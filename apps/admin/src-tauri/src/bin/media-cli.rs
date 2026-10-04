//! Línea de comandos del pipeline de medios.
//!
//! Existe por una razón concreta: el pipeline vive en Rust dentro del binario
//! del panel, y hay trabajo por LOTES que no tiene sentido hacer a mano desde
//! la interfaz — importar las 43 imágenes que quedaron de la fase anterior, o
//! re-derivar todo cuando suba la versión del pipeline (R11).
//!
//! REUTILIZA EL MISMO MÓDULO que el panel. No reimplementa la escalera ni los
//! argumentos de ffmpeg: si se duplicaran, el día que cambie un flag habría
//! dos sitios que corregir y uno se olvidaría.
//!
//! El reparto del trabajo con el script de Node es deliberado:
//!   - Rust hace medios y Storage, que es donde ya vive ese código.
//!   - Node hace Firestore, que es donde ya vive la sesión autenticada y el
//!     SDK de cliente.
//! Cruzarlo obligaría a reimplementar Firestore en Rust o ffmpeg en Node.
//!
//!   media-cli import --path FOTO --out DIR --bucket B --token T \
//!                    [--title T] [--alt A] [--tags a,b] [--no-upload]
//!
//! Imprime el registro del asset en JSON por stdout. Todo lo demás —progreso,
//! avisos— va por stderr, para que la salida se pueda encadenar con `jq` o
//! leer desde otro proceso sin filtrar ruido.

use princess_admin_lib::media::{pipeline, record::AssetRecord, upload};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// Lee `--clave valor` sin dependencias. Son veinte líneas y evita arrastrar
/// un parser de argumentos a un binario que tiene un solo subcomando.
fn arg(args: &[String], clave: &str) -> Option<String> {
    let i = args.iter().position(|a| a == clave)?;
    args.get(i + 1).filter(|v| !v.starts_with("--")).cloned()
}

fn tiene(args: &[String], bandera: &str) -> bool {
    args.iter().any(|a| a == bandera)
}

fn fallar(mensaje: &str) -> ExitCode {
    eprintln!("✗ {mensaje}");
    ExitCode::FAILURE
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.first().map(String::as_str) != Some("import") {
        eprintln!(
            "uso: media-cli import --path FOTO --out DIR [--bucket B --token T] \\\n\
             \x20                    [--title T] [--alt A] [--tags a,b] [--no-upload]\n\n\
             Imprime el registro del asset en JSON por stdout."
        );
        return ExitCode::FAILURE;
    }

    let Some(path) = arg(&args, "--path") else {
        return fallar("falta --path");
    };
    let Some(out) = arg(&args, "--out") else {
        return fallar("falta --out (la carpeta donde dejar los archivos)");
    };
    let src = PathBuf::from(&path);
    let root = PathBuf::from(&out);

    let title = arg(&args, "--title").unwrap_or_default();
    let alt = arg(&args, "--alt");
    let tags: Vec<String> = arg(&args, "--tags")
        .map(|t| t.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
        .unwrap_or_default();

    // ── 1. El pipeline
    eprintln!("· procesando {}", src.display());
    let asset: AssetRecord =
        match pipeline::normalize(&root, &src, &title, alt, tags, None) {
            Ok(a) => a,
            Err(e) => {
                // El detalle crudo a stderr (R10): trae rutas locales, y aquí
                // stderr es el log.
                if let Some(d) = &e.detail {
                    eprintln!("  detalle: {d}");
                }
                return fallar(&e.message);
            }
        };
    eprintln!(
        "  {} renditions, {} ms",
        asset.renditions.images.len() + asset.renditions.videos.len(),
        asset.pipeline.duration_ms
    );

    // ── 2. Storage, si se piden las credenciales
    let subir = !tiene(&args, "--no-upload");
    let mut base_path = String::new();

    if subir {
        let (Some(bucket), Some(token)) = (arg(&args, "--bucket"), arg(&args, "--token")) else {
            return fallar("falta --bucket o --token (o usá --no-upload)");
        };
        let dir = root.join("media").join(&asset.slug);

        let reporte = tauri::async_runtime::block_on(upload::upload_dir(
            &dir,
            &bucket,
            &token,
            &asset.slug,
            &|p| {
                if !p.file.is_empty() {
                    eprintln!("  ↑ {} ({}/{})", p.file, p.done + 1, p.total);
                }
            },
        ));

        match reporte {
            Ok(r) if r.failed.is_empty() => {
                eprintln!("  {} archivos, {} KB subidos", r.files, r.bytes / 1024);
                base_path = r.base_path;
            }
            Ok(r) => {
                return fallar(&format!(
                    "no se subieron {} archivo(s): {}",
                    r.failed.len(),
                    r.failed.join(", ")
                ))
            }
            Err(e) => {
                if let Some(d) = &e.detail {
                    eprintln!("  detalle: {d}");
                }
                return fallar(&e.message);
            }
        }
    }

    // El `basePath` se añade acá y no en el registro que escribe el pipeline
    // porque hasta que no se sube no existe: ponerlo antes sería afirmar que
    // los archivos están en Storage cuando todavía están solo en disco.
    let mut json = match serde_json::to_value(&asset) {
        Ok(v) => v,
        Err(e) => return fallar(&format!("no se pudo serializar el registro: {e}")),
    };
    if !base_path.is_empty() {
        json["basePath"] = serde_json::Value::String(base_path);
        // La ruta local del original no puede viajar a una colección de
        // lectura pública: filtra el usuario y la estructura del equipo.
        let nombre = Path::new(&asset.source.storage_path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        json["source"]["storagePath"] =
            serde_json::Value::String(format!("{}/{}", json["basePath"].as_str().unwrap(), nombre));
    }

    println!("{json}");
    ExitCode::SUCCESS
}
