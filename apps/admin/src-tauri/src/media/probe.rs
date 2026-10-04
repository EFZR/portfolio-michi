//! R2 — Clasificar antes de tocar, y R4 — resolver la orientación.
//!
//! «ffprobe primero, decidir después.» Nunca re-encodear por reflejo: cada
//! generación es calidad perdida y en un portafolio eso se ve.
//!
//! ──────────────────────────────────────────────────────────────────────────
//! R4: CORRECCIÓN AL CONTRATO, MEDIDA EN ESTA MÁQUINA (ffmpeg n9.0.1)
//!
//! El contrato dice que ffmpeg no aplica de forma confiable la orientación
//! EXIF en imágenes fijas y que hay que aplicar `transpose`/`hflip` a mano.
//! **En esta versión no es así.** El decoder mjpeg traduce el tag EXIF a un
//! `3x3 displaymatrix` de side data a nivel de frame —exactamente como en
//! vídeo— y el CLI de ffmpeg lo aplica solo. Verificado píxel a píxel contra
//! `PIL.ImageOps.exif_transpose` en las OCHO orientaciones: coinciden las
//! ocho, incluidas las espejadas (2, 4, 5, 7).
//!
//! Así que aplicar `transpose` a mano ROTARÍA DOS VECES. No se hace.
//!
//! Lo que sí hay que hacer es la otra mitad del R4, y sigue siendo necesaria:
//! `ffprobe -show_streams` devuelve las dimensiones ALMACENADAS (1200x800
//! para una foto vertical), no las orientadas. Elegir la escalera con esas
//! trataría un retrato como paisaje. Por eso se lee la matriz y se calcula
//! el intercambio de ejes.
//!
//! Dos trampas que esto evita:
//! - El escalar `rotation` NO alcanza: para la orientación 2 (espejo
//!   horizontal) ffprobe reporta `rotation: -180` y para la 4 reporta `0`.
//!   Ninguno describe un espejo. La matriz completa sí.
//! - La matriz vive en el FRAME, no en el stream: hay que pedir
//!   `-show_frames -read_intervals %+#1`. `-show_streams` no la trae.
//!
//! Si el panel llega a correr sobre un ffmpeg viejo que no autorrote, esto se
//! nota: la primera rendition saldría con las dimensiones cruzadas respecto a
//! lo calculado. Por eso `images.rs` compara lo medido con lo predicho.

use crate::media::cmd::{self, SHORT};
use crate::media::error::{MediaError, MediaResult};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;

/// Tope de tamaño de la fuente. **SUPOSICIÓN**: no está en el contrato ni en
/// el JSON del esquema. 500 MB cubre un RAW de cualquier cámara y un clip
/// corto en ProRes sin cortar nada razonable de un portafolio.
pub const MAX_SOURCE_BYTES: u64 = 500 * 1024 * 1024;

/// Demuxers de imagen fija.
///
/// Es un CONJUNTO y no un nombre a propósito. Medido con ffprobe n9.0.1: el
/// mismo JPEG se clasifica como `jpeg_pipe` con 1 KB y como `image2` con
/// 26 KB — ffprobe puntúa los demuxers por contenido y el tamaño del archivo
/// mueve el resultado. El nombre del archivo no influye (probado con y sin
/// extensión). Encadenar la lógica a un nombre concreto rompería con las
/// imágenes chicas.
const STILL_DEMUXERS: &[&str] = &[
    "image2",
    "png_pipe",
    "jpeg_pipe",
    "mjpeg_pipe",
    "webp_pipe",
    "tiff_pipe",
    "bmp_pipe",
    "jpegls_pipe",
];

/// Formatos de pixel con canal alfa. Se usa una lista y no una heurística
/// sobre el nombre porque `bgr0` tiene una posición muerta y no alfa, y
/// `pal8` (los GIF) la lleva en la paleta.
const ALPHA_PIX_FMTS: &[&str] = &[
    "rgba", "bgra", "argb", "abgr", "rgba64le", "rgba64be", "bgra64le", "bgra64be", "yuva420p",
    "yuva422p", "yuva444p", "yuva420p9le", "yuva420p10le", "yuva422p10le", "yuva444p10le",
    "yuva444p12le", "yuva444p16le", "ya8", "ya16le", "ya16be", "gbrap", "gbrap10le", "gbrap12le",
    "gbrap16le", "pal8",
];

/// Transferencias HDR. Un archivo HDR servido sin tone-map se ve lavado en la
/// mayoría de los navegadores, así que hay que saberlo para el R6.
const HDR_TRANSFERS: &[&str] = &["smpte2084", "arib-std-b67"];

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Image,
    Video,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Landscape,
    Portrait,
    Square,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub filename: String,
    pub bytes: u64,
    pub sha256: String,
    pub container: String,
    pub codec: String,
    pub pix_fmt: String,

    pub kind: Kind,
    /// Un GIF o WebP animado: va a salir como vídeo (R9), no como imagen.
    pub is_animated: bool,
    pub has_audio: bool,
    pub has_alpha: bool,
    pub duration_sec: Option<f64>,
    pub fps: Option<f64>,

    /// Lo que ffprobe reporta: las dimensiones ALMACENADAS, sin orientar.
    pub stored_width: u32,
    pub stored_height: u32,
    /// Dimensiones YA ORIENTADAS. Son las que manda la escalera.
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f64,
    pub orientation: Orientation,
    /// `true` si la orientación EXIF cruza los ejes (las orientaciones 5-8).
    pub swaps_axes: bool,
    /// La matriz tal como vino, para el registro de decisiones del R11.
    pub display_matrix: Option<[i64; 9]>,

    pub colour_primaries: Option<String>,
    pub colour_transfer: Option<String>,
    pub colour_space: Option<String>,
    pub is_hdr_source: bool,
}

/// Lee la matriz 3x3 del texto que imprime ffprobe.
///
/// El formato es una línea por fila con un prefijo de índice:
/// `00000000:            0       65536           0`
/// El prefijo también parsea como número, así que se corta por el `:`.
fn parse_display_matrix(text: &str) -> Option<[i64; 9]> {
    let mut v = Vec::with_capacity(9);
    for line in text.lines() {
        let body = match line.split_once(':') {
            Some((_, rest)) => rest,
            None => continue,
        };
        for tok in body.split_whitespace() {
            v.push(tok.parse::<i64>().ok()?);
        }
    }
    if v.len() != 9 {
        return None;
    }
    let mut m = [0i64; 9];
    m.copy_from_slice(&v);
    Some(m)
}

/// `true` si la transformación cruza los ejes, es decir si el ancho y el alto
/// se intercambian al mostrarla.
///
/// Verificado contra las ocho orientaciones EXIF: acierta las ocho. Las 1-4
/// (identidad, espejo, 180°, espejo vertical) tienen la diagonal ocupada; las
/// 5-8 (las que rotan 90°) tienen la diagonal en cero y la antidiagonal con
/// valor.
fn swaps_axes(m: &[i64; 9]) -> bool {
    m[0] == 0 && m[1] != 0
}

fn json_str(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && *s != "unknown" && *s != "N/A")
        .map(str::to_string)
}

fn json_u32(v: &Value, key: &str) -> Option<u32> {
    v.get(key).and_then(Value::as_u64).map(|n| n as u32)
}

/// `nb_frames` viene como cadena en el JSON de ffprobe, y a veces como "N/A".
fn nb_frames(v: &Value) -> Option<u64> {
    v.get("nb_frames")
        .and_then(Value::as_str)
        .and_then(|s| s.parse().ok())
}

/// `r_frame_rate` viene como `"30/1"`.
fn parse_rate(s: &str) -> Option<f64> {
    let (n, d) = s.split_once('/')?;
    let (n, d): (f64, f64) = (n.parse().ok()?, d.parse().ok()?);
    if d == 0.0 || n == 0.0 {
        return None;
    }
    Some(n / d)
}

/// sha256 del original. Sirve para dos cosas del contrato: la idempotencia
/// (invariante 4 — reconocer que este archivo ya se procesó) y poder verificar
/// el archivo archivado (invariante 3).
fn sha256_of(path: &Path) -> MediaResult<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut f = std::fs::File::open(path)
        .map_err(|e| MediaError::invalid("No se pudo leer el archivo.").with_detail(e.to_string()))?;
    let mut hasher = Sha256::new();
    // En trozos: un vídeo de 500 MB no entra cómodo en memoria.
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).map_err(|e| {
            MediaError::invalid("Se cortó la lectura del archivo.").with_detail(e.to_string())
        })?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Sondea la fuente. Devuelve `Err` con el código correcto del R10 si hay que
/// rechazarla; nunca toca el archivo.
pub fn probe(path: &Path) -> MediaResult<SourceInfo> {
    let filename = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "sin-nombre".into());

    let meta = std::fs::metadata(path).map_err(|e| {
        MediaError::invalid("No se encontró el archivo o no se puede leer.")
            .with_detail(format!("{}: {e}", path.display()))
    })?;
    let bytes = meta.len();

    if bytes == 0 {
        return Err(MediaError::invalid("El archivo está vacío."));
    }
    if bytes > MAX_SOURCE_BYTES {
        return Err(MediaError::new(
            crate::media::error::ErrorCode::TooLarge,
            format!(
                "El archivo pesa {} MB y el límite es {} MB.",
                bytes / 1024 / 1024,
                MAX_SOURCE_BYTES / 1024 / 1024
            ),
        ));
    }

    let out = cmd::run(
        "ffprobe",
        &[
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            &path.to_string_lossy(),
        ],
        SHORT,
        true,
    )
    // Que ffprobe falle sobre un archivo que existe significa que el archivo
    // no es un medio, o está roto. Eso es `invalid_media`, no culpa nuestra.
    .map_err(|e| {
        MediaError::invalid("Este archivo no parece ser una imagen ni un vídeo válidos.")
            .with_detail(e.detail.unwrap_or(e.message))
    })?;

    let root: Value = serde_json::from_str(&out.stdout).map_err(|e| {
        MediaError::failed("No se pudo interpretar la información del archivo.")
            .with_detail(e.to_string())
    })?;

    let streams = root.get("streams").and_then(Value::as_array).cloned().unwrap_or_default();
    let video = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(Value::as_str) == Some("video"))
        .ok_or_else(|| {
            // Un MP3 o un PDF llegan aquí: son archivos válidos, pero sin
            // imagen. No es que estén roto — es que no los soportamos.
            MediaError::unsupported("Este archivo no tiene imagen, así que no se puede usar como medio del portafolio.")
        })?;

    let format = root.get("format").cloned().unwrap_or(Value::Null);
    let container = json_str(&format, "format_name").unwrap_or_default();
    let codec = json_str(video, "codec_name").unwrap_or_default();
    let pix_fmt = json_str(video, "pix_fmt").unwrap_or_default();

    let stored_width = json_u32(video, "width")
        .ok_or_else(|| MediaError::invalid("El archivo no declara su ancho; puede estar truncado."))?;
    let stored_height = json_u32(video, "height")
        .ok_or_else(|| MediaError::invalid("El archivo no declara su alto; puede estar truncado."))?;
    if stored_width == 0 || stored_height == 0 {
        return Err(MediaError::invalid("El archivo declara un tamaño de cero."));
    }

    let frames = nb_frames(video);
    let duration_sec = format
        .get("duration")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|d| *d > 0.0);

    // ── Clasificación (R2). La tabla sale de medir ffprobe, no de suponer.
    let es_demuxer_fijo = STILL_DEMUXERS.contains(&container.as_str());
    let es_animado_declarado = container == "webp_anim" || codec == "webp_anim" || codec == "apng";
    let gif_animado = container == "gif" && frames.unwrap_or(1) > 1;

    // El conteo de frames manda sobre la duración cuando está presente.
    // MEDIDO: un GIF de UN frame declara `duration: 0.040000` (el retardo del
    // frame), así que decidir por duración lo convertiría en vídeo y le
    // generaría un mp4 de un cuadro. La duración solo entra cuando el
    // contenedor no dice cuántos frames tiene.
    let varios_frames = match frames {
        Some(n) => n > 1,
        None => duration_sec.is_some(),
    };

    let is_animated = es_animado_declarado || gif_animado;
    let kind = if es_demuxer_fijo && !is_animated {
        Kind::Image
    } else if is_animated || varios_frames {
        // R9: un GIF animado sale como vídeo. Un GIF de 5 MB se vuelve un mp4
        // de ~200 KB con mejor calidad.
        Kind::Video
    } else {
        // AVIF/HEIC: contenedor de vídeo con un solo frame y sin duración.
        Kind::Image
    };

    let has_audio = streams
        .iter()
        .any(|s| s.get("codec_type").and_then(Value::as_str) == Some("audio"));
    let has_alpha = ALPHA_PIX_FMTS.contains(&pix_fmt.as_str());

    let fps = video
        .get("avg_frame_rate")
        .or_else(|| video.get("r_frame_rate"))
        .and_then(Value::as_str)
        .and_then(parse_rate)
        .filter(|_| kind == Kind::Video);

    // ── Orientación (R4)
    let display_matrix = read_display_matrix(path)?;
    let swaps = display_matrix.as_ref().map(swaps_axes).unwrap_or(false);
    let (width, height) = if swaps {
        (stored_height, stored_width)
    } else {
        (stored_width, stored_height)
    };

    let colour_primaries = json_str(video, "color_primaries");
    let colour_transfer = json_str(video, "color_transfer");
    let colour_space = json_str(video, "color_space");
    let is_hdr_source = colour_transfer
        .as_deref()
        .map(|t| HDR_TRANSFERS.contains(&t))
        .unwrap_or(false);

    Ok(SourceInfo {
        filename,
        bytes,
        sha256: sha256_of(path)?,
        container,
        codec,
        pix_fmt,
        kind,
        is_animated,
        has_audio,
        has_alpha,
        duration_sec,
        fps,
        stored_width,
        stored_height,
        width,
        height,
        aspect_ratio: f64::from(width) / f64::from(height),
        orientation: match width.cmp(&height) {
            std::cmp::Ordering::Greater => Orientation::Landscape,
            std::cmp::Ordering::Less => Orientation::Portrait,
            std::cmp::Ordering::Equal => Orientation::Square,
        },
        swaps_axes: swaps,
        display_matrix,
        colour_primaries,
        colour_transfer,
        colour_space,
        is_hdr_source,
    })
}

/// Pide el primer frame y busca el `3x3 displaymatrix`.
///
/// Es una segunda llamada a ffprobe a propósito: `-show_frames` sobre un vídeo
/// largo sin `-read_intervals` recorrería el archivo entero.
fn read_display_matrix(path: &Path) -> MediaResult<Option<[i64; 9]>> {
    let out = cmd::run(
        "ffprobe",
        &[
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_frames",
            "-read_intervals",
            "%+#1",
            "-of",
            "json",
            &path.to_string_lossy(),
        ],
        SHORT,
        true,
    );

    // Que esto falle no invalida el archivo: significa que no se pudo leer la
    // orientación. Se sigue sin ella, que es el caso de la inmensa mayoría.
    let out = match out {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };

    let root: Value = match serde_json::from_str(&out.stdout) {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    let matrix = root
        .get("frames")
        .and_then(Value::as_array)
        .and_then(|f| f.first())
        .and_then(|f| f.get("side_data_list"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|sd| {
            sd.get("side_data_type").and_then(Value::as_str) == Some("3x3 displaymatrix")
        })
        .and_then(|sd| sd.get("displaymatrix").and_then(Value::as_str))
        .and_then(parse_display_matrix);

    Ok(matrix)
}

/// Clasifica una fuente sin tocarla. Es lo que el panel llama al elegir un
/// archivo: así puede decir "esto va a salir como vídeo porque es un GIF
/// animado" o rechazarlo con el código correcto antes de copiar 40 MB.
#[tauri::command]
pub async fn probe_media(path: String) -> Result<SourceInfo, MediaError> {
    tauri::async_runtime::spawn_blocking(move || probe(Path::new(&path)))
        .await
        .map_err(|e| {
            MediaError::failed("Falló el análisis del archivo.").with_detail(e.to_string())
        })?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Los ocho fixtures de 60x40 con cada valor del tag EXIF Orientation.
    /// Están en el repo (9 KB en total) porque son el único caso que no se
    /// puede generar con ffmpeg: ffmpeg no escribe EXIF.
    fn fixture(n: u8) -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(format!("orient-{n}.jpg"))
    }

    const IDENTIDAD: [i64; 9] = [65536, 0, 0, 0, 65536, 0, 0, 0, 1_073_741_824];

    #[test]
    fn lee_la_matriz_salteando_el_prefijo_de_indice() {
        // Tal como lo imprime ffprobe. El `00000000:` también parsea como
        // número, y si no se corta por el `:` salen 12 valores en vez de 9.
        let texto = "\n00000000:            0       65536           0\n\
                     00000001:       -65536           0           0\n\
                     00000002:            0           0  1073741824\n";
        assert_eq!(
            parse_display_matrix(texto),
            Some([0, 65536, 0, -65536, 0, 0, 0, 0, 1_073_741_824])
        );
    }

    #[test]
    fn una_matriz_incompleta_no_se_adivina() {
        assert_eq!(parse_display_matrix("00000000: 1 2 3\n"), None);
        assert_eq!(parse_display_matrix(""), None);
        assert_eq!(parse_display_matrix("00000000: a b c\n"), None);
    }

    #[test]
    fn el_intercambio_de_ejes_acierta_las_ocho_orientaciones() {
        // Medido con ffprobe n9.0.1 sobre los fixtures. Las 1-4 no cruzan
        // ejes; las 5-8 sí. El escalar `rotation` NO sirve para esto: para la
        // orientación 2 reporta -180 y para la 4 reporta 0.
        let esperado = [false, false, false, false, true, true, true, true];
        for (i, &swap) in esperado.iter().enumerate() {
            let n = i as u8 + 1;
            let info = probe(&fixture(n)).expect("el fixture debe sondearse");
            assert_eq!(info.swaps_axes, swap, "orientación {n}");
        }
    }

    #[test]
    fn las_dimensiones_que_manda_la_escalera_son_las_orientadas() {
        // El caso que el contrato marca como el que más se escapa: un retrato
        // tratado como paisaje. ffprobe reporta 60x40 para las ocho; las 5-8
        // se MUESTRAN 40x60, y es eso lo que decide el ladder.
        for n in 1..=4 {
            let i = probe(&fixture(n)).unwrap();
            assert_eq!((i.stored_width, i.stored_height), (60, 40));
            assert_eq!((i.width, i.height), (60, 40), "orientación {n}");
            assert_eq!(i.orientation, Orientation::Landscape);
        }
        for n in 5..=8 {
            let i = probe(&fixture(n)).unwrap();
            assert_eq!((i.stored_width, i.stored_height), (60, 40), "orientación {n}");
            assert_eq!((i.width, i.height), (40, 60), "orientación {n}");
            assert_eq!(i.orientation, Orientation::Portrait, "orientación {n}");
            assert!((i.aspect_ratio - 40.0 / 60.0).abs() < 1e-9);
        }
    }

    #[test]
    fn la_orientacion_1_es_la_identidad() {
        let i = probe(&fixture(1)).unwrap();
        assert_eq!(i.display_matrix, Some(IDENTIDAD));
        assert!(!i.swaps_axes);
    }

    #[test]
    fn un_jpeg_es_imagen_fija_sin_audio_ni_alfa() {
        let i = probe(&fixture(1)).unwrap();
        assert_eq!(i.kind, Kind::Image);
        assert!(!i.is_animated);
        assert!(!i.has_audio);
        assert!(!i.has_alpha);
        assert_eq!(i.fps, None, "una imagen fija no tiene fps");
        // No se afirma un demuxer concreto: ver el comentario de
        // STILL_DEMUXERS. Lo que importa es que caiga en el conjunto.
        assert!(
            STILL_DEMUXERS.contains(&i.container.as_str()),
            "demuxer inesperado: {}",
            i.container
        );
        assert_eq!(i.codec, "mjpeg");
    }

    #[test]
    fn el_tamano_del_archivo_no_cambia_la_clasificacion() {
        // El fixture de 1 KB entra por `jpeg_pipe`; una copia inflada entra
        // por `image2`. Las dos tienen que salir como imagen fija.
        let dir = std::env::temp_dir().join("princess-demuxer-test");
        std::fs::create_dir_all(&dir).unwrap();
        let chico = probe(&fixture(1)).unwrap();

        // Un JPEG más pesado con el mismo contenido visual: se re-encodea sin
        // submuestreo para que pese más sin dejar de ser el mismo tipo.
        let grande = dir.join("grande.jpg");
        crate::media::cmd::run(
            "ffmpeg",
            &[
                "-v", "error", "-y",
                "-i", &fixture(1).to_string_lossy(),
                "-vf", "scale=1200:-2",
                "-c:v", "mjpeg", "-q:v", "1", "-pix_fmt", "yuvj444p",
                &grande.to_string_lossy(),
            ],
            crate::media::cmd::SHORT,
            false,
        )
        .expect("el re-encode del fixture debe funcionar");

        let g = probe(&grande).unwrap();
        assert_ne!(chico.container, g.container, "el supuesto del test ya no vale");
        assert_eq!(chico.kind, Kind::Image);
        assert_eq!(g.kind, Kind::Image, "demuxer {}", g.container);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn el_sha256_es_estable_y_distingue_archivos() {
        let a = probe(&fixture(1)).unwrap();
        let b = probe(&fixture(1)).unwrap();
        let c = probe(&fixture(6)).unwrap();
        assert_eq!(a.sha256, b.sha256, "la idempotencia depende de esto");
        assert_eq!(a.sha256.len(), 64);
        assert_ne!(a.sha256, c.sha256);
        assert_eq!(a.bytes, std::fs::metadata(fixture(1)).unwrap().len());
    }

    #[test]
    fn un_archivo_que_no_existe_es_invalid_media_no_un_panico() {
        let e = probe(std::path::Path::new("/no/existe/nada.jpg")).unwrap_err();
        assert_eq!(e.code, crate::media::error::ErrorCode::InvalidMedia);
        // El mensaje es para la usuaria: sin la ruta, que va en el detalle.
        assert!(!e.message.contains("/no/existe"));
        assert!(e.detail.unwrap().contains("/no/existe"));
    }

    #[test]
    fn un_archivo_que_no_es_un_medio_se_rechaza_con_el_codigo_correcto() {
        let dir = std::env::temp_dir().join("princess-probe-test");
        std::fs::create_dir_all(&dir).unwrap();

        let vacio = dir.join("vacio.jpg");
        std::fs::write(&vacio, b"").unwrap();
        assert_eq!(
            probe(&vacio).unwrap_err().code,
            crate::media::error::ErrorCode::InvalidMedia
        );

        let basura = dir.join("basura.jpg");
        std::fs::write(&basura, b"esto no es un jpeg, solo texto suelto").unwrap();
        let e = probe(&basura).unwrap_err();
        assert_eq!(e.code, crate::media::error::ErrorCode::InvalidMedia);
        // R10: el crudo de ffprobe no puede llegar al mensaje.
        assert!(!e.message.contains("Invalid data"));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Genera un medio con ffmpeg en un directorio temporal. Estos sí se
    /// pueden fabricar en el momento (a diferencia del EXIF), así que no
    /// ocupan sitio en el repo.
    fn generar(nombre: &str, args: &[&str]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("princess-probe-gen");
        std::fs::create_dir_all(&dir).unwrap();
        let salida = dir.join(nombre);
        let mut v: Vec<String> = vec!["-v".into(), "error".into(), "-y".into()];
        v.extend(args.iter().map(|s| s.to_string()));
        v.push(salida.to_string_lossy().into_owned());
        crate::media::cmd::run("ffmpeg", &v, crate::media::cmd::ENCODE, false)
            .unwrap_or_else(|e| panic!("no se pudo generar {nombre}: {:?}", e.detail));
        salida
    }

    #[test]
    fn un_gif_animado_sale_como_video_no_como_imagen() {
        // R9: un GIF de 5 MB se vuelve un mp4 de ~200 KB. Por eso el registro
        // queda kind=video con isAnimated, y el front lo pinta con <video>.
        let gif = generar(
            "anim.gif",
            &["-f", "lavfi", "-i", "testsrc2=size=64x48:rate=10:duration=1"],
        );
        let i = probe(&gif).unwrap();
        assert_eq!(i.kind, Kind::Video, "un GIF animado no es una imagen fija");
        assert!(i.is_animated);
        assert!(!i.has_audio);
        assert_eq!((i.width, i.height), (64, 48));
    }

    #[test]
    fn un_gif_de_un_solo_frame_sigue_siendo_imagen() {
        // El mismo contenedor `gif` con un frame es una imagen fija. Si se
        // clasificara por contenedor saldría como vídeo y se le generaría un
        // mp4 absurdo de un frame.
        let gif = generar(
            "fijo.gif",
            &["-f", "lavfi", "-i", "testsrc2=size=64x48", "-frames:v", "1"],
        );
        let i = probe(&gif).unwrap();
        assert_eq!(i.kind, Kind::Image);
        assert!(!i.is_animated);
    }

    #[test]
    fn un_mp4_trae_duracion_fps_y_audio() {
        let mp4 = generar(
            "clip.mp4",
            &[
                "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=25:duration=1",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-c:v", "libx264", "-crf", "30", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest",
            ],
        );
        let i = probe(&mp4).unwrap();
        assert_eq!(i.kind, Kind::Video);
        assert!(!i.is_animated, "un vídeo normal no se marca como animado");
        assert!(i.has_audio);
        assert_eq!(i.codec, "h264");
        assert!((i.fps.unwrap() - 25.0).abs() < 0.01);
        assert!(i.duration_sec.unwrap() > 0.9);
    }

    #[test]
    fn el_alfa_se_detecta_por_el_formato_de_pixel() {
        // Decide el fallback: con alfa es PNG, no JPEG — un JPEG la pierde en
        // silencio y aparece fondo negro.
        let con = generar(
            "alfa.png",
            &["-f", "lavfi", "-i", "color=c=red@0.5:size=64x64,format=rgba", "-frames:v", "1"],
        );
        let sin = generar(
            "opaca.png",
            &["-f", "lavfi", "-i", "color=c=red:size=64x64,format=rgb24", "-frames:v", "1"],
        );
        assert!(probe(&con).unwrap().has_alpha, "pix_fmt con alfa no detectado");
        assert!(!probe(&sin).unwrap().has_alpha);
    }

    #[test]
    fn un_archivo_de_audio_es_unsupported_no_invalid() {
        // El archivo está perfecto; somos nosotros los que no llegamos. Si se
        // colapsara en invalid_media, el mensaje acusaría al archivo.
        let wav = generar(
            "solo-audio.wav",
            &["-f", "lavfi", "-i", "sine=frequency=440:duration=1"],
        );
        let e = probe(&wav).unwrap_err();
        assert_eq!(e.code, crate::media::error::ErrorCode::UnsupportedSource);
    }

    #[test]
    fn el_display_de_un_error_no_filtra_el_detalle() {
        // Si alguien loguea el error con `{}` por descuido, no debe arrastrar
        // rutas locales.
        let e = MediaError::invalid("Mensaje público.").with_detail("/home/alguien/foto.jpg");
        assert_eq!(format!("{e}"), "Mensaje público.");
    }
}
