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
use crate::media::probe::{self, Kind};
use crate::media::record::{self, AssetRecord};
use crate::media::toolchain;
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

/// Normaliza una imagen fija. El vídeo es el paso siguiente (R6-R9).
pub fn normalize_image(
    root: &Path,
    src: &Path,
    title: &str,
    alt: Option<String>,
) -> MediaResult<AssetRecord> {
    let started = Instant::now();

    // ── 1. Sondear antes de tocar nada (R2)
    let info = probe::probe(src)?;

    if info.kind != Kind::Image {
        return Err(MediaError::unsupported(if info.is_animated {
            "Esto es un GIF animado. Se convierte a vídeo, y esa parte del panel \
             todavía no está lista."
        } else {
            "Esto es un vídeo. Esa parte del panel todavía no está lista."
        }));
    }

    // ── El toolchain manda qué formatos se pueden generar (R1)
    let report = toolchain::probe_blocking();
    if !report.ok {
        return Err(MediaError::new(
            ErrorCode::ToolchainUnavailable,
            "Falta ffmpeg o alguna de sus piezas, así que no se puede preparar la imagen.",
        )
        .with_detail(report.detail.unwrap_or_default()));
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

    // ── 3. La escalera (R3/R5)
    let images = images::render(&info, src, &dir, &slug, &enc)?;

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
        &info,
        images,
        archived.to_string_lossy().into_owned(),
        report.ffmpeg.map(|f| f.version).unwrap_or_default(),
        now,
        started.elapsed().as_millis() as u64,
    );

    // ── Comprobaciones de integridad antes de escribir nada.
    //
    // Invariante 6: siempre tiene que existir una rendition que funcione en
    // cualquier navegador. Si no está, el `<picture>` quedaría con sources
    // modernas y ningún `<img>` final, y un navegador viejo no vería nada.
    // Es culpa nuestra, así que es `processing_failed`.
    if asset.fallback().is_none() {
        return Err(MediaError::failed(
            "No se generó ninguna versión de respaldo, así que la imagen no se guardó.",
        )
        .with_detail(format!(
            "sin rendition jpeg/png entre {} generadas (alfa: {})",
            asset.renditions.images.len(),
            info.has_alpha
        )));
    }

    // R12: el asset se produce igual sin `alt`, pero no se va a poder
    // publicar. Se avisa acá y no se falla: hacerlo fallar obligaría a
    // re-encodear los 21 archivos después de escribir una frase.
    if !asset.can_publish() {
        asset.pipeline.warnings.push(
            "Falta el texto alternativo. La imagen quedó preparada pero no se puede \
             publicar hasta describirla (o marcarla como decorativa con un texto vacío)."
                .into(),
        );
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
) -> Result<AssetRecord, MediaError> {
    let root = app.path().app_data_dir().map_err(|e| {
        MediaError::failed("No se pudo encontrar la carpeta de datos de la aplicación.")
            .with_detail(e.to_string())
    })?;

    tauri::async_runtime::spawn_blocking(move || {
        normalize_image(&root, Path::new(&path), &title, alt)
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
        let a = normalize_image(&root, &src, "Retrato en el muelle", Some("Una foto".into()))
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

        let a = normalize_image(&dir.join("d"), &src, "Con alfa", Some("x".into())).unwrap();
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

        let a = normalize_image(&root, &src, "Prueba", None).unwrap();
        let b = normalize_image(&root, &src, "Prueba", None).unwrap();

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
    fn sin_alt_se_prepara_igual_pero_no_se_publica() {
        // R12. Falla al publicar, no al procesar: hacerlo fallar al procesar
        // obligaría a re-encodear todo después de escribir una frase.
        let dir = std::env::temp_dir().join("princess-alt");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let src = fuente_realista(&dir, 400, 300);

        let sin = normalize_image(&dir.join("d1"), &src, "Sin alt", None).unwrap();
        assert!(!sin.can_publish());
        assert!(!sin.renditions.images.is_empty(), "se procesó igual");
        assert!(sin.pipeline.warnings.iter().any(|w| w.contains("texto alternativo")));

        // `Some("")` es «decorativa», declarado a propósito. No es lo mismo
        // que ausente y no puede colapsarse con él.
        let deco = normalize_image(&dir.join("d2"), &src, "Decorativa", Some(String::new())).unwrap();
        assert!(deco.can_publish(), "una imagen decorativa sí se publica");

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

    #[test]
    fn un_video_se_rechaza_como_unsupported_todavia() {
        let dir = std::env::temp_dir().join("princess-vid");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let mp4 = dir.join("clip.mp4");
        crate::media::cmd::run(
            "ffmpeg",
            &[
                "-v", "error", "-y", "-f", "lavfi", "-i",
                "testsrc2=size=160x120:rate=25:duration=1",
                "-c:v", "libx264", "-crf", "30", "-pix_fmt", "yuv420p",
                &mp4.to_string_lossy(),
            ],
            crate::media::cmd::ENCODE,
            false,
        )
        .unwrap();

        let e = normalize_image(&dir.join("d"), &mp4, "Clip", None).unwrap_err();
        assert_eq!(e.code, ErrorCode::UnsupportedSource);
        assert!(e.message.contains("vídeo"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
