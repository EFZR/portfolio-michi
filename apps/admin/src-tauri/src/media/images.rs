//! R3 — Imágenes: tres formatos y una escalera de anchos. Y R5 — color y
//! metadata.
//!
//! Las tres métricas que importan son peso de transferencia, time-to-first-
//! paint y ausencia de layout shift. Cada flag de aquí abajo dice a cuál
//! responde; un flag sin razón se borra en la primera refactorización.

use crate::media::cmd::{self, ENCODE};
use crate::media::error::{MediaError, MediaResult};
use crate::media::probe::SourceInfo;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// R3. Techo en 2560: cubre un slot de 1280 CSS px en retina, y más es peso
/// que nadie ve en un portafolio.
pub const WIDTHS: &[u32] = &[320, 640, 960, 1280, 1600, 1920, 2560];

/// Transferencia sRGB. Lo que se asume cuando la fuente no declara nada
/// creíble, que es el caso normal.
const SRGB_TRANSFER: &str = "iec61966-2-1";

/// Calidad del AVIF. El valor del contrato, VALIDADO sobre las tres fotos
/// reales del portafolio a 960 px de ancho (SSIM contra la misma reducción sin
/// comprimir):
///
/// | crf | bytes  | SSIM   |
/// |-----|--------|--------|
/// | 18  | 60 479 | 0.9838 |
/// | 23  | 46 758 | 0.9797 |
/// | 28  | 34 151 | 0.9750 |
/// | 32  | 26 855 | 0.9708 |  ← este
/// | WebP q80 | 58 664 | 0.9811 |
/// | JPEG q:v 3 | 109 497 | 0.9849 |
///
/// A crf 32 el AVIF pesa 2.2x menos que el WebP con 0.01 de SSIM menos. Subir
/// a crf 23 alcanza la calidad del WebP (0.980 contra 0.981) por un 74% más de
/// peso: la curva es muy plana y no lo vale.
///
/// ADVERTENCIA MEDIDA: sobre una fuente con RUIDO UNIFORME sintético el mismo
/// crf 32 cae a SSIM 0.805, muy por debajo del WebP. El ruido uniforme es
/// patológico para el denoiser de AV1 y no representa grano fotográfico real
/// (en las tres fotos del portafolio da 0.964-0.971). Pero si una foto de ISO
/// alto sale con la textura comida, este es el número que hay que bajar — y
/// está medido cuánto cuesta cada escalón.
const AVIF_CRF: &str = "32";

/// Primarios y transferencias que zscale acepta Y que vale la pena respetar
/// porque describen un espacio realmente distinto de sRGB.
///
/// Es una LISTA BLANCA y no "lo que diga ffprobe", por dos medidas:
/// - ffprobe reporta `color_primaries: gbr` para un PNG, y zscale no parsea
///   ese valor: «Unable to parse "pin" option value "gbr"». Pasárselo rompe
///   en TODO PNG.
/// - ffprobe reporta `bt470bg` (primarios PAL) para un JPEG corriente, que es
///   el defecto del demuxer, no una declaración. Pasárselo corre, pero
///   desplaza el color: diferencia máxima de 37 y media de 1.77 por canal
///   contra `bt709` sobre la misma foto. Es decir, introduciría justo el bug
///   de color que el R5 existe para evitar.
const TRUSTED_PRIMARIES: &[&str] = &["bt709", "bt2020", "smpte431", "smpte432"];
const TRUSTED_TRANSFERS: &[&str] = &["bt709", "iec61966-2-1", "smpte2084", "arib-std-b67"];

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Avif,
    Webp,
    Jpeg,
    Png,
}

impl ImageFormat {
    pub fn ext(self) -> &'static str {
        match self {
            Self::Avif => "avif",
            Self::Webp => "webp",
            Self::Jpeg => "jpg",
            Self::Png => "png",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Avif => "image/avif",
            Self::Webp => "image/webp",
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
        }
    }
}

/// Qué encoders hay. Sale del informe del R1; se pasa en vez de volver a
/// sondear para que una escalera de 21 archivos no lance 21 sondeos.
#[derive(Debug, Clone)]
pub struct Encoders {
    /// `libaom-av1` si está, si no `libsvtav1`, si no nada.
    pub avif: Option<&'static str>,
    pub webp: bool,
    pub jpeg: bool,
    pub png: bool,
}

impl Encoders {
    pub fn from_report(encoders: &BTreeMap<String, bool>) -> Self {
        let has = |k: &str| encoders.get(k).copied().unwrap_or(false);
        Self {
            // libaom para imágenes fijas: 23.1 KB contra 30.3 KB de libsvtav1
            // sobre la misma fuente (24% menos). libsvtav1 es más rápido y
            // sirve de reemplazo, no de preferencia.
            avif: if has("libaom-av1") {
                Some("libaom-av1")
            } else if has("libsvtav1") {
                Some("libsvtav1")
            } else {
                None
            },
            webp: has("libwebp"),
            jpeg: has("mjpeg"),
            png: has("png"),
        }
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageRendition {
    pub format: ImageFormat,
    /// MEDIDOS del archivo producido, nunca calculados (invariante 8).
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    pub path: String,
    pub mime_type: &'static str,
    pub has_alpha: bool,
}

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageOutput {
    pub renditions: Vec<ImageRendition>,
    /// data URI del LQIP. Medido: 94 bytes de WebP, 128 caracteres en base64.
    pub placeholder: Option<String>,
    pub dominant: Option<String>,
    pub source_colour_space: String,
    pub decisions: Vec<String>,
    pub warnings: Vec<String>,
}

/// R3 — la escalera. Sólo anchos ≤ el ancho ORIENTADO (invariante 1: nunca
/// upscalear). Un original de 1800 produce hasta 1600 y ahí se corta.
pub fn ladder(oriented_width: u32) -> Vec<u32> {
    let v: Vec<u32> = WIDTHS.iter().copied().filter(|w| *w <= oriented_width).collect();
    if v.is_empty() {
        // Una imagen más angosta que 320 px (un icono, un sello). La escalera
        // queda vacía y sin esto no habría ninguna rendition: el invariante 6
        // exige que SIEMPRE exista un fallback servible.
        vec![oriented_width]
    } else {
        v
    }
}

/// R3 — qué formatos para esta fuente.
///
/// **MEDIDO, y es una corrección al contrato**: el AVIF de libaom NO conserva
/// el canal alfa. Una imagen con transparencia sale con la esquina en negro
/// OPACO, y pedirle `-pix_fmt yuva420p` tampoco ayuda (produce 4 KB y la
/// pierde igual). Como el AVIF es el primer `<source>` del `<picture>`, dejarlo
/// significaría que los navegadores modernos —o sea, casi todas las visitas—
/// ven un rectángulo negro. Es peor que el caso del JPEG que el contrato ya
/// previene, no igual.
///
/// Así que con alfa: WebP (que sí la conserva, verificado `yuva420p`) y PNG.
pub fn formats_for(info: &SourceInfo, enc: &Encoders) -> Vec<ImageFormat> {
    let mut v = Vec::new();
    if info.has_alpha {
        if enc.webp {
            v.push(ImageFormat::Webp);
        }
        if enc.png {
            v.push(ImageFormat::Png);
        }
    } else {
        if enc.avif.is_some() {
            v.push(ImageFormat::Avif);
        }
        if enc.webp {
            v.push(ImageFormat::Webp);
        }
        if enc.jpeg {
            v.push(ImageFormat::Jpeg);
        }
    }
    v
}

/// R5 — la cadena de color. Todo sale sRGB.
///
/// Devuelve el filtro y la decisión en texto legible para `pipeline.decisions`.
pub fn colour_filter(info: &SourceInfo) -> (String, String) {
    let primaries = info
        .colour_primaries
        .as_deref()
        .filter(|p| TRUSTED_PRIMARIES.contains(p));
    let transfer = info
        .colour_transfer
        .as_deref()
        .filter(|t| TRUSTED_TRANSFERS.contains(t));

    match (primaries, transfer) {
        // La fuente declara algo que zscale entiende: se respeta como entrada.
        (Some(p), Some(t)) => (
            format!(
                "zscale=min=bt709:tin={t}:pin={p}:m=bt709:t={SRGB_TRANSFER}:p=bt709:r=full"
            ),
            format!("color: entrada declarada {p}/{t} convertida a sRGB"),
        ),
        // El caso normal. zscale NO adivina la entrada: sin declararla falla
        // con «code 3074: no path between colorspaces». Verificado.
        _ => (
            format!(
                "zscale=min=bt709:tin={SRGB_TRANSFER}:pin=bt709:m=bt709:t={SRGB_TRANSFER}:p=bt709:r=full"
            ),
            "color: entrada sin declaración creíble, se asume sRGB".to_string(),
        ),
    }
}

/// Argumentos del encoder. Cada uno con la métrica que mejora.
fn encoder_args(format: ImageFormat, enc: &Encoders) -> Vec<String> {
    let s = |v: &str| v.to_string();
    match format {
        ImageFormat::Avif => {
            let codec = enc.avif.unwrap_or("libaom-av1");
            let mut a = vec![s("-c:v"), s(codec), s("-crf"), s(AVIF_CRF)];
            if codec == "libaom-av1" {
                // cpu-used 6: el compromiso entre tiempo y peso que dio los
                // 23.1 KB medidos. still-picture le dice al encoder que no hay
                // temporalidad que explotar.  → PESO
                a.extend([s("-cpu-used"), s("6"), s("-still-picture"), s("1")]);
            } else {
                a.extend([s("-preset"), s("6"), s("-still-picture"), s("1")]);
            }
            // yuv420p: Safari no decodifica 4:4:4.  → COMPATIBILIDAD
            a.extend([s("-pix_fmt"), s("yuv420p")]);
            a
        }
        // preset=picture optimiza para imagen fija en vez de para fotograma
        // de vídeo.  → PESO
        ImageFormat::Webp => vec![
            s("-c:v"),
            s("libwebp"),
            s("-quality"),
            s("80"),
            s("-preset"),
            s("picture"),
        ],
        // yuvj420p NO es opcional. MEDIDO: sin él el encoder mjpeg sale en
        // 4:4:4 (yuvj444p) y el archivo pesa 128 927 bytes en vez de 83 468
        // — un 54% más grande por un defecto.  → PESO
        ImageFormat::Jpeg => vec![
            s("-c:v"),
            s("mjpeg"),
            s("-q:v"),
            s("3"),
            s("-pix_fmt"),
            s("yuvj420p"),
        ],
        // mixed deja que zlib elija el predictor por fila.  → PESO
        ImageFormat::Png => vec![s("-c:v"), s("png"), s("-pred"), s("mixed")],
    }
}

/// Mide un archivo producido: dimensiones reales y bytes reales.
/// Invariante 8 — nunca estimados.
fn measure(path: &Path) -> MediaResult<(u32, u32, u64)> {
    let out = cmd::run(
        "ffprobe",
        &[
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            &path.to_string_lossy(),
        ],
        cmd::SHORT,
        true,
    )?;

    let txt = out.stdout.trim();
    let (w, h) = txt
        .split_once('x')
        .ok_or_else(|| {
            MediaError::failed("No se pudieron medir las dimensiones de un archivo generado.")
                .with_detail(format!("ffprobe devolvió {txt:?} para {}", path.display()))
        })?;
    let w: u32 = w.trim().parse().map_err(|_| {
        MediaError::failed("Medición de ancho inválida.").with_detail(txt.to_string())
    })?;
    let h: u32 = h.trim().parse().map_err(|_| {
        MediaError::failed("Medición de alto inválida.").with_detail(txt.to_string())
    })?;
    let bytes = std::fs::metadata(path)
        .map_err(|e| MediaError::failed("No se pudo medir el archivo generado.").with_detail(e.to_string()))?
        .len();

    Ok((w, h, bytes))
}

/// Genera la escalera completa.
///
/// `src` no se modifica nunca (invariante 3). `out_dir` tiene que existir.
pub fn render(
    info: &SourceInfo,
    src: &Path,
    out_dir: &Path,
    slug: &str,
    enc: &Encoders,
) -> MediaResult<ImageOutput> {
    let formats = formats_for(info, enc);
    if formats.is_empty() {
        return Err(MediaError::new(
            crate::media::error::ErrorCode::ToolchainUnavailable,
            "No hay ningún encoder de imagen disponible para generar las versiones.",
        ));
    }

    let (colour, colour_decision) = colour_filter(info);
    let widths = ladder(info.width);

    let mut out = ImageOutput {
        source_colour_space: info
            .colour_primaries
            .clone()
            .unwrap_or_else(|| "sin declarar".into()),
        ..Default::default()
    };
    out.decisions.push(colour_decision);

    if widths.len() == 1 && widths[0] == info.width && info.width < WIDTHS[0] {
        out.decisions.push(format!(
            "escalera reducida al original: mide {} px, por debajo del primer escalón ({} px)",
            info.width, WIDTHS[0]
        ));
    } else {
        out.decisions.push(format!(
            "escalera cortada en {}: el original mide {} px",
            widths.last().copied().unwrap_or(0),
            info.width
        ));
    }

    // R5 — la metadata. ffmpeg descarta EXIF al re-encodear, que es justo lo
    // que se quiere para GPS y número de serie: VERIFICADO con exiv2, después
    // del re-encode no queda ni GPS ni BodySerialNumber.
    //
    // Y por eso NO hay paso directo para imágenes aunque el invariante 2 diga
    // "nunca re-encodear lo que ya cumple": un JPEG de cámara que ya mide
    // 1600 px NO cumple, porque trae la geolocalización dentro. Copiarlo tal
    // cual publicaría dónde se tomó la foto.
    out.decisions
        .push("metadata: strip total al re-encodear (GPS y nº de serie fuera)".into());

    // La tensión del R5, dicha y no escondida. MEDIDO: `-metadata
    // copyright=... -metadata artist=...` sobre el muxer de imagen NO escribe
    // nada — exiv2 no encuentra los tags después. ffmpeg no puede devolver la
    // autoría al archivo.
    out.warnings.push(
        "La autoría no viaja dentro del archivo: ffmpeg no escribe EXIF en imágenes \
         (probado, `-metadata copyright/artist` no sobrevive). El crédito vive en el \
         campo `credit` del registro, que es la fuente de verdad, y lo tiene que \
         pintar el front."
            .into(),
    );

    if formats.contains(&ImageFormat::Jpeg) {
        out.warnings.push(
            "El JPEG lo genera `mjpeg`, no mozjpeg: pesa ~1.5-2x lo que daría mozjpeg a \
             calidad equivalente. Es el costo de la restricción ffmpeg-only, y por eso el \
             JPEG es el último fallback y no el formato principal."
                .into(),
        );
    }
    if info.has_alpha {
        out.warnings.push(
            "La imagen tiene transparencia, así que no se genera AVIF: el encoder de \
             ffmpeg la pierde y la zona transparente sale negra. Se sirve WebP con PNG \
             de respaldo."
                .into(),
        );
    }

    for &w in &widths {
        for &format in &formats {
            let name = format!("{slug}-{w}.{}", format.ext());
            let dest: PathBuf = out_dir.join(&name);

            // `-2` fuerza alto par manteniendo el aspecto: H.264 y el 4:2:0 de
            // AVIF rechazan dimensiones impares.  → COMPATIBILIDAD
            let vf = format!("{colour},scale={w}:-2:flags=lanczos");

            let mut args: Vec<String> = vec![
                "-v".into(),
                "error".into(),
                "-y".into(),
                "-i".into(),
                src.to_string_lossy().into_owned(),
                "-vf".into(),
                vf,
                "-frames:v".into(),
                "1".into(),
            ];
            args.extend(encoder_args(format, enc));
            args.push(dest.to_string_lossy().into_owned());

            cmd::run("ffmpeg", &args, ENCODE, false).map_err(|e| {
                // Llegados aquí la fuente ya pasó el R2, así que esto es culpa
                // nuestra: `processing_failed`, no `invalid_media`.
                MediaError::failed(format!(
                    "No se pudo generar la versión de {w} px en {}.",
                    format.ext()
                ))
                .with_detail(e.detail.unwrap_or(e.message))
            })?;

            let (mw, mh, bytes) = measure(&dest)?;

            // La red de seguridad del R4. Si ffmpeg no hubiera resuelto la
            // orientación —un binario viejo, por ejemplo— el ancho medido no
            // coincidiría con el pedido y la escalera entera estaría mal.
            // Mejor fallar fuerte que publicar retratos acostados.
            if mw != w {
                return Err(MediaError::failed(
                    "Las versiones generadas no tienen el tamaño esperado; el archivo no se publicó.",
                )
                .with_detail(format!(
                    "se pidió {w} px de ancho y el archivo mide {mw}x{mh}. \
                     Fuente {}x{} orientada (almacenada {}x{}, cruza ejes: {}). \
                     Puede ser un ffmpeg que no aplica la orientación EXIF.",
                    info.width, info.height, info.stored_width, info.stored_height, info.swaps_axes
                )));
            }

            out.renditions.push(ImageRendition {
                format,
                width: mw,
                height: mh,
                bytes,
                path: name,
                mime_type: format.mime(),
                has_alpha: matches!(format, ImageFormat::Png | ImageFormat::Webp)
                    && info.has_alpha,
            });
        }
    }

    out.placeholder = placeholder(src, &colour, out_dir).ok();
    out.dominant = dominant_colour(src, &colour, out_dir).ok();
    if out.placeholder.is_none() {
        out.warnings
            .push("No se pudo generar el placeholder borroso; la imagen cargará sin él.".into());
    }

    Ok(out)
}

/// LQIP como data URI. Medido: 94 bytes de WebP → 128 caracteres en base64,
/// holgadamente por debajo del tope de ~1 KB del contrato.
///
/// Mejora el TIME-TO-FIRST-PAINT: hay algo pintado en el hueco reservado desde
/// el primer byte del HTML, sin una petición de red más.
fn placeholder(src: &Path, colour: &str, tmp: &Path) -> MediaResult<String> {
    let dest = tmp.join(".lqip.webp");
    cmd::run(
        "ffmpeg",
        &[
            "-v",
            "error",
            "-y",
            "-i",
            &src.to_string_lossy(),
            "-vf",
            &format!("{colour},scale=20:-2"),
            "-frames:v",
            "1",
            "-c:v",
            "libwebp",
            "-quality",
            "20",
            &dest.to_string_lossy(),
        ],
        ENCODE,
        false,
    )?;

    let bytes = std::fs::read(&dest).map_err(|e| {
        MediaError::failed("No se pudo leer el placeholder generado.").with_detail(e.to_string())
    })?;
    std::fs::remove_file(&dest).ok();

    use base64::Engine;
    Ok(format!(
        "data:image/webp;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

/// Color dominante: un píxel. Evita el flash de fondo blanco incluso si el
/// placeholder falla.  → TIME-TO-FIRST-PAINT
///
/// Medido contra el promedio real de la imagen (`PIL` a 1x1): `#82818C` contra
/// `#81818C`, una unidad de diferencia en el rojo por usar otro filtro de
/// reducción. Irrelevante para un fondo.
fn dominant_colour(src: &Path, colour: &str, tmp: &Path) -> MediaResult<String> {
    let dest = tmp.join(".dom.raw");
    cmd::run(
        "ffmpeg",
        &[
            "-v",
            "error",
            "-y",
            "-i",
            &src.to_string_lossy(),
            "-vf",
            &format!("{colour},scale=1:1"),
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            &dest.to_string_lossy(),
        ],
        ENCODE,
        false,
    )?;

    let bytes = std::fs::read(&dest).map_err(|e| {
        MediaError::failed("No se pudo leer el color dominante.").with_detail(e.to_string())
    })?;
    std::fs::remove_file(&dest).ok();

    if bytes.len() < 3 {
        return Err(MediaError::failed("El color dominante salió vacío."));
    }
    Ok(format!("#{:02X}{:02X}{:02X}", bytes[0], bytes[1], bytes[2]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::probe::probe;

    fn fixture(n: u8) -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(format!("orient-{n}.jpg"))
    }

    fn todos() -> Encoders {
        Encoders { avif: Some("libaom-av1"), webp: true, jpeg: true, png: true }
    }

    #[test]
    fn la_escalera_nunca_sube_del_original() {
        // Invariante 1. El ejemplo del contrato: un original de 1800 produce
        // hasta 1600, y 1920/2560 no existen para ese asset.
        assert_eq!(ladder(1800), vec![320, 640, 960, 1280, 1600]);
        assert_eq!(ladder(2560), vec![320, 640, 960, 1280, 1600, 1920, 2560]);
        assert_eq!(ladder(9000), WIDTHS.to_vec(), "el techo es 2560");
        assert_eq!(ladder(640), vec![320, 640]);
        assert_eq!(ladder(641), vec![320, 640]);
    }

    #[test]
    fn una_imagen_mas_angosta_que_el_primer_escalon_igual_tiene_una_version() {
        // Invariante 6: siempre un fallback servible. Sin este caso, un sello
        // de 200 px no generaría ninguna rendition.
        assert_eq!(ladder(200), vec![200]);
        assert_eq!(ladder(1), vec![1]);
    }

    #[test]
    fn con_alfa_no_se_genera_avif() {
        // MEDIDO: el AVIF de libaom pierde el canal alfa y la zona
        // transparente sale NEGRA OPACA. Como el AVIF es el primer <source>
        // del <picture>, dejarlo haría que los navegadores modernos —casi
        // todas las visitas— vieran un rectángulo negro.
        let mut i = probe(&fixture(1)).unwrap();
        i.has_alpha = true;
        assert_eq!(formats_for(&i, &todos()), vec![ImageFormat::Webp, ImageFormat::Png]);
    }

    #[test]
    fn sin_alfa_el_orden_es_avif_webp_jpeg() {
        let i = probe(&fixture(1)).unwrap();
        assert_eq!(
            formats_for(&i, &todos()),
            vec![ImageFormat::Avif, ImageFormat::Webp, ImageFormat::Jpeg]
        );
    }

    #[test]
    fn si_falta_un_encoder_el_formato_desaparece_y_el_resto_sigue() {
        let i = probe(&fixture(1)).unwrap();
        let sin_avif = Encoders { avif: None, ..todos() };
        assert_eq!(
            formats_for(&i, &sin_avif),
            vec![ImageFormat::Webp, ImageFormat::Jpeg]
        );
    }

    #[test]
    fn libsvtav1_sirve_de_reemplazo_de_libaom() {
        let mut m = BTreeMap::new();
        for k in ["libwebp", "mjpeg", "png", "libsvtav1"] {
            m.insert(k.to_string(), true);
        }
        m.insert("libaom-av1".into(), false);
        assert_eq!(Encoders::from_report(&m).avif, Some("libsvtav1"));

        m.insert("libaom-av1".into(), true);
        assert_eq!(
            Encoders::from_report(&m).avif,
            Some("libaom-av1"),
            "con los dos presentes gana libaom: 23.1 KB contra 30.3 KB medidos"
        );
    }

    #[test]
    fn el_jpeg_lleva_yuvj420p_siempre() {
        // MEDIDO: sin esto el mjpeg de ffmpeg sale 4:4:4 y el archivo pesa
        // 128 927 bytes en vez de 83 468 — 54% más por un defecto.
        let a = encoder_args(ImageFormat::Jpeg, &todos());
        let i = a.iter().position(|x| x == "-pix_fmt").expect("falta -pix_fmt");
        assert_eq!(a[i + 1], "yuvj420p");
    }

    #[test]
    fn el_crf_del_avif_es_el_medido_y_no_un_numero_suelto() {
        // Si alguien lo cambia, que sea mirando la tabla de la constante.
        let a = encoder_args(ImageFormat::Avif, &todos());
        let i = a.iter().position(|x| x == "-crf").expect("falta -crf");
        assert_eq!(a[i + 1], AVIF_CRF);
    }

    #[test]
    fn el_avif_lleva_yuv420p_porque_safari_no_decodifica_444() {
        let a = encoder_args(ImageFormat::Avif, &todos());
        let i = a.iter().position(|x| x == "-pix_fmt").expect("falta -pix_fmt");
        assert_eq!(a[i + 1], "yuv420p");
    }

    #[test]
    fn una_entrada_sin_declaracion_creible_se_asume_srgb() {
        // MEDIDO: ffprobe reporta `color_primaries: gbr` para un PNG y
        // `bt470bg` para un JPEG corriente. Ninguno es una declaración: son
        // defectos del demuxer. `gbr` ni siquiera lo parsea zscale («Unable
        // to parse "pin" option value "gbr"»), y `bt470bg` corre pero desplaza
        // el color (diferencia máxima de 37 por canal contra bt709).
        let mut i = probe(&fixture(1)).unwrap();

        i.colour_primaries = Some("gbr".into());
        i.colour_transfer = None;
        let (f, d) = colour_filter(&i);
        assert!(!f.contains("gbr"), "gbr no puede llegar a zscale: {f}");
        assert!(f.contains("pin=bt709"));
        assert!(d.contains("asume sRGB"));

        i.colour_primaries = Some("bt470bg".into());
        let (f, _) = colour_filter(&i);
        assert!(!f.contains("bt470bg"), "bt470bg desplaza el color: {f}");
    }

    #[test]
    fn una_entrada_que_si_declara_su_espacio_se_respeta() {
        let mut i = probe(&fixture(1)).unwrap();
        i.colour_primaries = Some("bt2020".into());
        i.colour_transfer = Some("smpte2084".into());

        let (f, d) = colour_filter(&i);
        assert!(f.contains("pin=bt2020"), "{f}");
        assert!(f.contains("tin=smpte2084"), "{f}");
        assert!(f.contains("p=bt709"), "la salida siempre es sRGB: {f}");
        assert!(d.contains("bt2020"));
    }

    #[test]
    fn la_cadena_de_color_siempre_declara_la_entrada() {
        // zscale NO adivina: sin declarar la entrada falla con
        // «code 3074: no path between colorspaces». Verificado.
        let i = probe(&fixture(1)).unwrap();
        let (f, _) = colour_filter(&i);
        for clave in ["min=", "tin=", "pin="] {
            assert!(f.contains(clave), "falta {clave} en {f}");
        }
    }

    #[test]
    fn la_escalera_completa_se_genera_y_se_mide() {
        let dir = std::env::temp_dir().join("princess-images-test");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();

        // Fixture de 60x40: la escalera cae al caso del original.
        let i = probe(&fixture(1)).unwrap();
        let out = render(&i, &fixture(1), &dir, "prueba", &todos()).unwrap();

        assert_eq!(out.renditions.len(), 3, "un ancho x tres formatos");
        for r in &out.renditions {
            assert_eq!(r.width, 60, "{:?}", r.format);
            assert!(r.bytes > 0, "bytes medidos del archivo, no estimados");
            assert!(dir.join(&r.path).exists(), "falta {}", r.path);
            assert_eq!(
                std::fs::metadata(dir.join(&r.path)).unwrap().len(),
                r.bytes,
                "los bytes del registro tienen que ser los del archivo"
            );
        }

        let p = out.placeholder.expect("placeholder");
        assert!(p.starts_with("data:image/webp;base64,"));
        assert!(p.len() < 1400, "el placeholder tiene que ser diminuto: {}", p.len());

        let d = out.dominant.expect("color dominante");
        assert_eq!(d.len(), 7, "formato #RRGGBB");
        assert!(d.starts_with('#'));

        // R11: las decisiones en texto legible.
        assert!(out.decisions.iter().any(|x| x.contains("color")));
        assert!(out.decisions.iter().any(|x| x.contains("metadata")));
        // La debilidad del mjpeg se declara, no se esconde.
        assert!(out.warnings.iter().any(|w| w.contains("mozjpeg")));
        // Y la tensión del R5 con la autoría también.
        assert!(out.warnings.iter().any(|w| w.contains("autoría")));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn un_retrato_girado_genera_las_dimensiones_del_lado_correcto() {
        // El caso que el contrato marca como el que más se escapa. El fixture
        // 6 está almacenado 60x40 y se MUESTRA 40x60.
        let dir = std::env::temp_dir().join("princess-images-rot-test");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();

        let i = probe(&fixture(6)).unwrap();
        assert_eq!((i.width, i.height), (40, 60));

        let out = render(&i, &fixture(6), &dir, "retrato", &todos()).unwrap();
        for r in &out.renditions {
            assert_eq!(r.width, 40, "{:?} salió acostada", r.format);
            assert!(r.height > r.width, "{:?} {}x{}", r.format, r.width, r.height);
        }

        std::fs::remove_dir_all(&dir).ok();
    }
}
