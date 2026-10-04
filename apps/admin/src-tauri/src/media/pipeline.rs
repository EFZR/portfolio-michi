//! El orquestador: de un archivo suelto a un registro de asset.
//!
//! Orden fijo, y el orden es la mitad del diseño:
//!   1. sondear (R2) — nunca se toca el archivo antes de saber qué es
//!   2. archivar el original (invariante 3) — sin él no se puede re-derivar
//!   3. generar la escalera (R3/R5)
//!   4. armar el registro (R11) y escribirlo
//!
//! Si algo falla a mitad, el asset queda recuperable y nunca a medio escribir
//! (invariante 5): el registro se escribe al final, de una vez, y mientras no
//! exista el asset simplemente no existe.

use crate::media::error::{ErrorCode, MediaError, MediaResult};
use crate::media::images::{self, Encoders};
use crate::media::probe::{self, Kind, SourceInfo};
use crate::media::record::{self, AssetRecord, Derived, Poster};
use crate::media::toolchain;
use crate::media::video;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::Manager;

/// Marca de tiempo ISO 8601 en UTC, que es lo que pide el esquema.
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Copia el original al directorio del asset sin tocarlo (invariante 3).
///
/// Se COPIA y no se mueve: el archivo de origen es de la usuaria y está en su
/// carpeta de fotos. Moverlo sería hacer desaparecer su archivo.
fn archive(src: &Path, dir: &Path, slug: &str) -> MediaResult<PathBuf> {
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .filter(|e| e.len() <= 8 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or_else(|| "bin".into());

    let dest = dir.join(format!("{slug}-original.{ext}"));
    std::fs::copy(src, &dest).map_err(|e| {
        MediaError::failed("No se pudo guardar una copia del archivo original.")
            .with_detail(format!("copy {} -> {}: {e}", src.display(), dest.display()))
    })?;
    Ok(dest)
}

/// Deriva todo lo de una imagen fija (R3/R5).
fn derive_image(
    info: &SourceInfo,
    src: &Path,
    dir: &Path,
    slug: &str,
    enc: &Encoders,
) -> MediaResult<Derived> {
    let out = images::render(info, src, dir, slug, enc)?;
    Ok(Derived {
        images: out.renditions,
        placeholder: out.placeholder,
        dominant: out.dominant,
        source_colour_space: out.source_colour_space,
        decisions: out.decisions,
        warnings: out.warnings,
        ..Default::default()
    })
}

/// Deriva todo lo de un vídeo (R6-R9): escalera, poster y preview loop.
///
/// El poster pasa por la MISMA escalera de imágenes que una foto, porque es
/// una imagen más y es la que se ve en la galería (R7).
fn derive_video(
    info: &SourceInfo,
    src: &Path,
    dir: &Path,
    slug: &str,
    enc: &Encoders,
    manual_poster_at: Option<f64>,
) -> MediaResult<Derived> {
    // R9 — un GIF o WebP animado no pasa por la escalera: una pieza en loop de
    // unos segundos no necesita tres alturas.
    let vout = if info.is_animated {
        video::render_animated(info, src, dir, slug)?
    } else {
        video::render(info, src, dir, slug, false)?
    };

    let mut d = Derived {
        videos: vout.renditions,
        decisions: vout.decisions,
        warnings: vout.warnings,
        source_colour_space: info
            .colour_primaries
            .clone()
            .unwrap_or_else(|| "sin declarar".into()),
        ..Default::default()
    };

    // El prefijo de tone-map tiene que aplicarse también al poster y al
    // preview: si no, el poster de un vídeo HDR saldría lavado mientras el
    // vídeo sale corregido.
    let tonemap = video::tonemap_for(info);

    let (frame, mut pdec) = video::pick_poster(src, dir, slug, manual_poster_at, tonemap.as_deref())?;
    d.decisions.append(&mut pdec);

    // El frame extraído se sondea como cualquier imagen y se le aplica la
    // escalera. Así el poster hereda el placeholder y el color dominante.
    let finfo = probe::probe(&frame.path)?;
    let pout = images::render(&finfo, &frame.path, dir, &format!("{slug}-poster"), enc)?;

    d.placeholder = pout.placeholder;
    d.dominant = pout.dominant;
    for w in pout.warnings {
        // La advertencia del mozjpeg ya está dicha si además hay imágenes;
        // acá interesa que quede una vez.
        if !d.warnings.contains(&w) {
            d.warnings.push(w);
        }
    }
    d.poster = Some(Poster {
        width: finfo.width,
        height: finfo.height,
        at_sec: frame.at_sec,
        picked_by: frame.picked_by,
        formats: pout.renditions,
    });

    // El frame crudo era un intermedio: no se publica.
    std::fs::remove_file(&frame.path).ok();

    // R8 — arranca en el frame del poster, nunca en el segundo 0.
    match video::render_preview_loop(src, dir, slug, frame.at_sec, tonemap.as_deref()) {
        Ok(pl) => {
            if pl.bytes > 512 * 1024 {
                d.warnings.push(format!(
                    "El preview de la galería pesa {} KB, por encima del objetivo de 500 KB.",
                    pl.bytes / 1024
                ));
            }
            d.preview_loop = Some(pl);
        }
        Err(e) => {
            // Que falle el preview no tira el asset: el vídeo y el poster ya
            // están, y la galería puede vivir con el poster quieto.
            d.warnings.push(
                "No se pudo generar el clip de previsualización; la galería mostrará el \
                 poster quieto."
                    .into(),
            );
            eprintln!("[media] preview loop: {:?}", e.detail);
        }
    }

    Ok(d)
}

/// Normaliza una imagen o un vídeo y devuelve el registro.
pub fn normalize(
    root: &Path,
    src: &Path,
    title: &str,
    alt: Option<String>,
    tags: Vec<String>,
    manual_poster_at: Option<f64>,
) -> MediaResult<AssetRecord> {
    let started = Instant::now();

    // ── 1. Sondear antes de tocar nada (R2)
    let info = probe::probe(src)?;

    // ── El toolchain manda qué formatos se pueden generar (R1)
    let report = toolchain::probe_blocking();
    if !report.ok {
        return Err(MediaError::new(
            ErrorCode::ToolchainUnavailable,
            "Falta ffmpeg o alguna de sus piezas, así que no se puede preparar el archivo.",
        )
        .with_detail(report.detail.unwrap_or_default()));
    }
    if info.kind == Kind::Video && !report.encoders.get("libx264").copied().unwrap_or(false) {
        return Err(MediaError::new(
            ErrorCode::ToolchainUnavailable,
            "Falta el encoder de H.264, así que no se puede preparar un vídeo. Las \
             imágenes fijas sí funcionan.",
        ));
    }
    let enc = Encoders::from_report(&report.encoders);

    // El slug sale del título si hay, y del nombre del archivo si no. Pasa
    // por `slugify` en cualquier caso: se usa para construir rutas.
    let base = if title.trim().is_empty() {
        info.filename
            .rsplit_once('.')
            .map(|(n, _)| n)
            .unwrap_or(&info.filename)
    } else {
        title
    };
    let slug = record::slugify(base);

    let dir = root.join("media").join(&slug);
    std::fs::create_dir_all(&dir).map_err(|e| {
        MediaError::failed("No se pudo crear la carpeta del medio.")
            .with_detail(format!("{}: {e}", dir.display()))
    })?;

    // ── 2. Archivar el original
    let archived = archive(src, &dir, &slug)?;

    // ── 3. Derivar
    let derived = match info.kind {
        Kind::Image => derive_image(&info, src, &dir, &slug, &enc)?,
        Kind::Video => derive_video(&info, src, &dir, &slug, &enc, manual_poster_at)?,
    };

    // ── 4. El registro (R11)
    let now = now_iso();
    let mut asset = record::build(
        // El id sale del sha256 del original, no de un aleatorio: dos corridas
        // sobre el mismo archivo dan el mismo id, que es lo que hace la
        // idempotencia observable (invariante 4).
        info.sha256.chars().take(16).collect(),
        slug,
        if title.trim().is_empty() {
            info.filename.clone()
        } else {
            title.to_string()
        },
        alt,
        tags,
        &info,
        derived,
        archived.to_string_lossy().into_owned(),
        report.ffmpeg.map(|f| f.version).unwrap_or_default(),
        now,
        started.elapsed().as_millis() as u64,
    );

    // ── Comprobaciones de integridad antes de escribir nada.
    //
    // Invariante 6: siempre tiene que existir una rendition que funcione en
    // cualquier navegador — jpeg/png para una imagen, h264/mp4 para un vídeo.
    // Si no está, el `<picture>` quedaría con sources modernas y ningún `<img>`
    // final. Es culpa nuestra, así que es `processing_failed`.
    if !asset.fallback_exists() {
        return Err(MediaError::failed(
            "No se generó ninguna versión de respaldo, así que el archivo no se guardó.",
        )
        .with_detail(format!(
            "sin fallback: {} imágenes, {} vídeos (alfa: {})",
            asset.renditions.images.len(),
            asset.renditions.videos.len(),
            info.has_alpha
        )));
    }

    // De una sola escritura: o está el registro completo o no está. Un JSON a
    // medio escribir sería un asset irrecuperable, que es lo que el
    // invariante 5 prohíbe.
    let json = serde_json::to_string_pretty(&asset).map_err(|e| {
        MediaError::failed("No se pudo serializar el registro del medio.").with_detail(e.to_string())
    })?;
    std::fs::write(dir.join("asset.json"), json).map_err(|e| {
        MediaError::failed("No se pudo guardar el registro del medio.")
            .with_detail(format!("{}: {e}", dir.display()))
    })?;

    Ok(asset)
}

/// Normaliza el archivo que la usuaria eligió y devuelve el registro.
///
/// La carpeta de salida la resuelve Rust (el directorio de datos de la app),
/// no la manda el frontend: así la webview no puede elegir dónde se escribe.
#[tauri::command]
pub async fn normalize_media(
    app: tauri::AppHandle,
    path: String,
    title: String,
    alt: Option<String>,
    tags: Option<Vec<String>>,
    // R7 — si la usuaria corrigió el poster a mano se respeta su segundo y no
    // se vuelve a elegir.
    poster_at_sec: Option<f64>,
) -> Result<AssetRecord, MediaError> {
    let root = app.path().app_data_dir().map_err(|e| {
        MediaError::failed("No se pudo encontrar la carpeta de datos de la aplicación.")
            .with_detail(e.to_string())
    })?;

    tauri::async_runtime::spawn_blocking(move || {
        normalize(&root, Path::new(&path), &title, alt, tags.unwrap_or_default(), poster_at_sec)
    })
    .await
    .map_err(|e| {
        MediaError::failed("Falló la preparación del archivo.").with_detail(e.to_string())
    })?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fuente realista: degradado con grano, que comprime como una foto y no
    /// como un patrón sintético. `testsrc2` daría números optimistas.
    fn fuente_realista(dir: &Path, w: u32, h: u32) -> PathBuf {
        let p = dir.join("fuente.png");
        crate::media::cmd::run(
            "ffmpeg",
            &[
                "-v".to_string(),
                "error".to_string(),
                "-y".to_string(),
                "-f".to_string(),
                "lavfi".to_string(),
                "-i".to_string(),
                format!("gradients=size={w}x{h}:nb_colors=4:seed=7"),
                "-vf".to_string(),
                // `noise` es un filtro, no una fuente: va en -vf, no en -i.
                // El grano importa — un degradado limpio comprimiría de forma
                // optimista y los números medidos no servirían de referencia.
                // `format=rgb24` no es decorativo: la fuente `gradients` sale
                // con canal alfa y el pipeline —correctamente— omitiría el
                // AVIF, dejando 12 renditions en vez de 18. Lo descubrió este
                // test fallando.
                "noise=alls=18:allf=t,format=rgb24".to_string(),
                "-frames:v".to_string(),
                "1".to_string(),
                p.to_string_lossy().into_owned(),
            ],
            crate::media::cmd::ENCODE,
            false,
        )
        .unwrap_or_else(|e| panic!("no se pudo generar la fuente: {:?}", e.detail));
        p
    }

    #[test]
    fn de_punta_a_punta_sobre_una_imagen_de_tamano_real() {
        let dir = std::env::temp_dir().join("princess-e2e");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let src = fuente_realista(&dir, 2400, 1600);
        let antes = std::fs::metadata(&src).unwrap().len();

        let root = dir.join("datos");
        let a = normalize(&root, &src, "Retrato en el muelle", Some("Una foto".into()), vec![], None)
            .expect("la normalización debe funcionar");

        assert_eq!(a.slug, "retrato-en-el-muelle");
        assert_eq!(a.kind, crate::media::probe::Kind::Image);
        assert_eq!(a.status, crate::media::record::Status::Ready);
        assert_eq!(a.published_at, None, "null explícito, no ausente");
        assert!(a.can_publish(), "con alt y ready tendría que poder publicarse");

        // Invariante 1: la escalera se corta en 1920 porque el original mide
        // 2400 — el escalón de 2560 no existe para este asset.
        let anchos: Vec<u32> = {
            let mut v: Vec<u32> = a.renditions.images.iter().map(|r| r.width).collect();
            v.sort_unstable();
            v.dedup();
            v
        };
        assert_eq!(anchos, vec![320, 640, 960, 1280, 1600, 1920]);
        assert_eq!(a.renditions.images.len(), 18, "6 anchos x 3 formatos");

        // Invariantes 7 y 8: todo medido del archivo producido.
        for r in &a.renditions.images {
            let real = std::fs::metadata(root.join("media").join(&a.slug).join(&r.path)).unwrap();
            assert_eq!(real.len(), r.bytes, "{}", r.path);
            assert!(r.height > 0);
        }

        // Invariante 3: el original archivado y sin tocar.
        let arch = Path::new(&a.source.storage_path);
        assert!(arch.exists(), "el original no quedó archivado");
        assert_eq!(std::fs::metadata(arch).unwrap().len(), antes);
        assert_eq!(std::fs::metadata(&src).unwrap().len(), antes, "la fuente se modificó");

        // El registro escrito, completo y releíble.
        let json = std::fs::read_to_string(root.join("media").join(&a.slug).join("asset.json"))
            .expect("asset.json");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["intrinsic"]["aspectRatio"].as_f64().unwrap(), 1.5);
        assert!(v["colour"]["placeholder"].as_str().unwrap().starts_with("data:image/webp"));
        assert_eq!(v["pipeline"]["version"], crate::media::record::PIPELINE_VERSION);
        assert!(!v["pipeline"]["ffmpegVersion"].as_str().unwrap().is_empty());

        // ── Lo medido, para el registro del commit.
        let por_formato = |f: crate::media::images::ImageFormat| -> u64 {
            a.renditions.images.iter().filter(|r| r.format == f).map(|r| r.bytes).sum()
        };
        use crate::media::images::ImageFormat::*;
        eprintln!(
            "\n  fuente 2400x1600 ({} KB) -> 18 renditions en {} ms\n  \
             AVIF {:>6} B · WebP {:>6} B · JPEG {:>6} B · total {} KB\n  \
             placeholder {} chars · dominante {}\n  decisiones: {:?}",
            antes / 1024,
            a.pipeline.duration_ms,
            por_formato(Avif),
            por_formato(Webp),
            por_formato(Jpeg),
            (por_formato(Avif) + por_formato(Webp) + por_formato(Jpeg)) / 1024,
            a.colour.placeholder.as_ref().unwrap().len(),
            a.colour.dominant.as_ref().unwrap(),
            a.pipeline.decisions,
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn una_fuente_con_transparencia_sale_sin_avif_y_con_png() {
        // Descubierto por el test de punta a punta: `gradients` lleva alfa.
        // La rama importa — un AVIF con transparencia sale con la zona
        // transparente en NEGRO OPACO, y es el primer <source> del <picture>.
        let dir = std::env::temp_dir().join("princess-alfa-e2e");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();

        let src = dir.join("con-alfa.png");
        crate::media::cmd::run(
            "ffmpeg",
            &[
                "-v", "error", "-y", "-f", "lavfi", "-i",
                "color=c=red@0.4:size=700x400,format=rgba",
                "-frames:v", "1",
                &src.to_string_lossy(),
            ],
            crate::media::cmd::ENCODE,
            false,
        )
        .unwrap();

        let a = normalize(&dir.join("d"), &src, "Con alfa", Some("x".into()), vec![], None).unwrap();
        use crate::media::images::ImageFormat;
        let formatos: Vec<_> = a.renditions.images.iter().map(|r| r.format).collect();
        assert!(!formatos.contains(&ImageFormat::Avif), "el AVIF perdería el alfa");
        assert!(formatos.contains(&ImageFormat::Webp));
        assert!(formatos.contains(&ImageFormat::Png));
        // Invariante 6: el fallback de una imagen con alfa es PNG, no JPEG.
        assert_eq!(a.fallback().unwrap().format, ImageFormat::Png);
        assert!(a.pipeline.warnings.iter().any(|w| w.contains("transparencia")));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn dos_corridas_dan_el_mismo_id_y_el_mismo_resultado() {
        // Invariante 4 — idempotencia. El id sale del sha256, no de un
        // aleatorio, así que es observable.
        let dir = std::env::temp_dir().join("princess-idem");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let src = fuente_realista(&dir, 400, 300);
        let root = dir.join("datos");

        let a = normalize(&root, &src, "Prueba", None, vec![], None).unwrap();
        let b = normalize(&root, &src, "Prueba", None, vec![], None).unwrap();

        assert_eq!(a.id, b.id);
        assert_eq!(a.slug, b.slug);
        assert_eq!(a.source.sha256, b.source.sha256);
        let pesos = |r: &AssetRecord| -> Vec<u64> {
            r.renditions.images.iter().map(|x| x.bytes).collect()
        };
        assert_eq!(pesos(&a), pesos(&b), "el mismo archivo tiene que dar el mismo peso");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sin_alt_se_publica_igual() {
        // DECISIÓN DEL PROYECTO, apartándose del R12 del contrato: el texto
        // alternativo no bloquea la publicación. Exigirlo dejaba 45 fotos ya
        // procesadas inservibles hasta escribir 45 descripciones, y convertía
        // cada subida en dos tareas.
        //
        // El coste queda escrito donde se decidió (`record::can_publish`): un
        // lector de pantalla y un buscador no sabrán qué hay en la foto.
        let dir = std::env::temp_dir().join("princess-alt");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let src = fuente_realista(&dir, 400, 300);

        let sin = normalize(&dir.join("d1"), &src, "Sin alt", None, vec![], None).unwrap();
        assert_eq!(sin.alt, None);
        assert!(sin.can_publish(), "el alt no es una puerta");
        assert!(!sin.renditions.images.is_empty());
        assert!(
            !sin.pipeline.warnings.iter().any(|w| w.contains("texto alternativo")),
            "ya no se avisa de algo que no bloquea nada"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn un_slug_no_puede_escapar_de_su_carpeta() {
        // El slug sale del título, que lo escribe la usuaria. Si dejara pasar
        // `/` o `..` se podría escribir fuera del directorio del asset.
        use crate::media::record::slugify;
        assert_eq!(slugify("../../etc/passwd"), "etc-passwd");
        assert_eq!(slugify("/absoluto"), "absoluto");
        assert_eq!(slugify("con espacios Y MAYÚSCULAS"), "con-espacios-y-mayusculas");
        assert_eq!(slugify("acentuación y ñ"), "acentuacion-y-n");
        assert_eq!(slugify("...."), "medio");
        assert!(!slugify("a/b\\c:d*e?f").contains(['/', '\\', ':', '*', '?']));
    }

    /// Clip con fundido desde negro en los primeros 1.5 s: es lo que hace
    /// útil al filtro `thumbnail` y lo que un timestamp ciego arruinaría.
    fn clip(dir: &Path, w: u32, h: u32, segundos: u32, con_audio: bool) -> PathBuf {
        let p = dir.join("clip.mp4");
        let mut args: Vec<String> = vec![
            "-v".into(), "error".into(), "-y".into(),
            "-f".into(), "lavfi".into(),
            "-i".into(), format!("testsrc2=size={w}x{h}:rate=25:duration={segundos}"),
        ];
        if con_audio {
            args.extend([
                "-f".to_string(), "lavfi".to_string(),
                "-i".to_string(), format!("sine=frequency=440:duration={segundos}"),
                "-c:a".to_string(), "aac".to_string(), "-shortest".to_string(),
            ]);
        }
        args.extend([
            "-vf".to_string(), "fade=t=in:st=0:d=1.5".to_string(),
            "-c:v".to_string(), "libx264".to_string(),
            "-crf".to_string(), "24".to_string(),
            "-preset".to_string(), "veryfast".to_string(),
            "-pix_fmt".to_string(), "yuv420p".to_string(),
            p.to_string_lossy().into_owned(),
        ]);
        crate::media::cmd::run("ffmpeg", &args, crate::media::cmd::ENCODE, false)
            .unwrap_or_else(|e| panic!("no se pudo generar el clip: {:?}", e.detail));
        p
    }

    #[test]
    fn un_video_genera_escalera_poster_y_preview() {
        let dir = std::env::temp_dir().join("princess-video-e2e");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let src = clip(&dir, 1280, 720, 6, true);
        let root = dir.join("datos");

        let a = normalize(&root, &src, "Showreel", Some("Un clip".into()), vec![], None).unwrap();
        let carpeta = root.join("media").join(&a.slug);

        assert_eq!(a.kind, Kind::Video);
        assert!(a.intrinsic.has_audio);
        assert!(!a.intrinsic.is_animated);
        assert!((a.intrinsic.fps.unwrap() - 25.0).abs() < 0.1);

        // R6 — escalera 480/720, cortada en la altura del original.
        let alturas: Vec<u32> = a.renditions.videos.iter().map(|v| v.height).collect();
        assert_eq!(alturas, vec![480, 720]);
        for v in &a.renditions.videos {
            assert!(v.is_fallback, "el h264/mp4 es el fallback universal");
            assert_eq!(v.width % 2, 0, "H.264 4:2:0 rechaza dimensiones impares");
            let real = std::fs::metadata(carpeta.join(&v.path)).unwrap().len();
            assert_eq!(real, v.bytes, "{}", v.path);
            assert!(v.has_audio);
        }

        // Lo que el contrato pide verificar del h264.
        let salida = carpeta.join(&a.renditions.videos[1].path);
        let probe = crate::media::cmd::run(
            "ffprobe",
            &[
                "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=profile,level,pix_fmt,has_b_frames",
                "-of", "json", &salida.to_string_lossy(),
            ],
            crate::media::cmd::SHORT,
            true,
        )
        .unwrap();
        let v: serde_json::Value = serde_json::from_str(&probe.stdout).unwrap();
        assert_eq!(v["streams"][0]["profile"], "High");
        assert_eq!(v["streams"][0]["level"], 41);
        assert_eq!(v["streams"][0]["pix_fmt"], "yuv420p");
        assert_eq!(v["streams"][0]["has_b_frames"], 2, "sin b-frames se pierde 10-15%");

        // R7 — el poster no cae en el fundido, y es una imagen más.
        let p = a.poster.as_ref().expect("poster");
        assert!(p.at_sec > 1.5, "el poster cayó en el fundido: {}s", p.at_sec);
        assert_eq!(p.picked_by, crate::media::video::PickedBy::Auto);
        assert!(!p.formats.is_empty(), "el poster va en el ladder de imágenes");
        for r in &p.formats {
            assert!(carpeta.join(&r.path).exists(), "falta {}", r.path);
        }
        // El frame crudo era un intermedio y no se publica.
        assert!(!carpeta.join(format!(".{}-poster-frame.png", a.slug)).exists());

        // R8 — preview aparte, sin audio, arrancando en el poster.
        let pl = a.preview_loop.as_ref().expect("preview loop");
        assert!((pl.start_sec - p.at_sec).abs() < 0.01);
        assert!(pl.duration_sec > 0.0 && pl.duration_sec <= 3.5);
        assert!(pl.bytes < 512 * 1024, "{} bytes", pl.bytes);
        let pa = crate::media::cmd::run(
            "ffprobe",
            &[
                "-v", "error", "-show_entries", "stream=codec_type",
                "-of", "csv=p=0", &carpeta.join(&pl.path).to_string_lossy(),
            ],
            crate::media::cmd::SHORT,
            true,
        )
        .unwrap();
        assert!(!pa.stdout.contains("audio"), "el preview tiene que ir muted: {}", pa.stdout);

        // El placeholder y el color salen del poster.
        assert!(a.colour.placeholder.unwrap().starts_with("data:image/webp"));
        assert!(a.colour.dominant.is_some());

        eprintln!(
            "\n  clip 1280x720 6s -> {} vídeos + {} formatos de poster + preview en {} ms\n  \
             poster en {:.2}s · preview {} KB · vídeos {} KB\n  decisiones: {:#?}",
            a.renditions.videos.len(),
            p.formats.len(),
            a.pipeline.duration_ms,
            p.at_sec,
            pl.bytes / 1024,
            a.renditions.videos.iter().map(|v| v.bytes).sum::<u64>() / 1024,
            a.pipeline.decisions,
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn un_clip_sin_audio_no_recibe_una_pista_silenciosa() {
        // En pipelines de signage había que agregarla. Acá pesa de gratis.
        let dir = std::env::temp_dir().join("princess-video-mudo");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let src = clip(&dir, 854, 480, 4, false);

        let a = normalize(&dir.join("d"), &src, "Mudo", Some("x".into()), vec![], None).unwrap();
        assert!(!a.intrinsic.has_audio);
        for v in &a.renditions.videos {
            assert!(!v.has_audio);
        }
        assert!(a.pipeline.decisions.iter().any(|d| d.contains("silenciosa")));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn un_gif_animado_se_vuelve_un_mp4_en_loop() {
        // R9 — la optimización de mayor rendimiento del pipeline entero.
        let dir = std::env::temp_dir().join("princess-gif-e2e");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();

        // 101x75: dimensiones IMPARES en los dos ejes, que es el caso que el
        // contrato marca. Va como fixture del repo porque ffmpeg NO puede
        // generarlo: su propio encoder de GIF redondea a par al crear el
        // archivo (medido: `testsrc2=size=101x75` sale 100x74).
        let gif = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/anim-impar.gif");
        let antes = std::fs::metadata(&gif).unwrap().len();

        let a = normalize(&dir.join("d"), gif.as_path(), "Animado", Some("x".into()), vec![], None).unwrap();
        assert_eq!(a.kind, Kind::Video, "un GIF animado es vídeo, no imagen");
        assert!(a.intrinsic.is_animated);
        assert_eq!(a.renditions.videos.len(), 1, "un loop no necesita escalera");

        let v = &a.renditions.videos[0];
        assert_eq!(v.width % 2, 0, "101 tiene que redondearse a par");
        assert_eq!(v.height % 2, 0);
        assert!(!v.has_audio);
        assert!(a.pipeline.warnings.iter().any(|w| w.contains("<video")));
        assert!(a.pipeline.decisions.iter().any(|d| d.contains("par")));

        // MEDIDO: con un GIF diminuto el mp4 sale MÁS grande (908 → 2155
        // bytes) porque el contenedor MP4 tiene un suelo de 1-2 KB. Se
        // convierte igual, y el caso queda avisado en vez de escondido.
        if v.bytes > antes {
            assert!(
                a.pipeline.warnings.iter().any(|w| w.contains("contenedor MP4")),
                "el mp4 creció y no se avisó"
            );
        }

        eprintln!("\n  GIF {} KB (101x75) -> mp4 {} KB en {}x{}",
            antes / 1024, v.bytes / 1024, v.width, v.height);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn la_escalera_de_video_nunca_sube_del_original() {
        use crate::media::video::ladder;
        assert_eq!(ladder(1080, false), vec![480, 720, 1080]);
        assert_eq!(ladder(720, false), vec![480, 720]);
        assert_eq!(ladder(1440, false), vec![480, 720, 1080], "1440 no entra por defecto");
        assert_eq!(ladder(1440, true), vec![480, 720, 1080, 1440]);
        assert_eq!(ladder(2160, true), vec![480, 720, 1080, 1440, 2160]);
        // Más chico que el primer escalón: igual una rendition, con altura par.
        assert_eq!(ladder(301, false), vec![300]);
    }
}

