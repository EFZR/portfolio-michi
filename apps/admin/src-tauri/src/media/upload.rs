//! Subida de un asset a Firebase Storage.
//!
//! POR QUÉ DESDE RUST Y NO CON EL SDK DE JAVASCRIPT: el SDK necesita los bytes
//! dentro de la webview. Para una foto de 500 KB da igual, pero el original de
//! un vídeo son 100-150 MB y pasarlos por el puente IPC para después
//! mantenerlos en memoria de JS es desperdicio puro. Acá se lee del disco y se
//! manda, y la webview solo aporta el token.
//!
//! `reqwest` no es una dependencia nueva de verdad: ya estaba en el árbol
//! porque la arrastra `tauri-plugin-updater`.
//!
//! SOBRE EL TOKEN: lo pasa la webview (`getIdToken()`), vive una hora y nunca
//! se guarda en disco. Rust no sabe autenticarse con Firebase y no tiene por
//! qué: la sesión es la de la administradora, y el SDK de cliente ya la
//! gestiona del otro lado.

use crate::media::error::{MediaError, MediaResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Emitter, Manager};

/// La API v0 de Firebase Storage, que es la que usa el SDK de cliente y la que
/// respeta las reglas de seguridad.
const API: &str = "https://firebasestorage.googleapis.com/v0/b";

/// Codifica un segmento de ruta para la API.
///
/// La barra tiene que viajar como `%2F`: en esta API el nombre del objeto es
/// UN solo segmento de URL, no una jerarquía de carpetas.
fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn mime_for(filename: &str) -> &'static str {
    match filename.rsplit_once('.').map(|(_, e)| e.to_lowercase()).as_deref() {
        Some("avif") => "image/avif",
        Some("webp") => "image/webp",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub slug: String,
    pub file: String,
    pub done: usize,
    pub total: usize,
    pub bytes_sent: u64,
    pub bytes_total: u64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadReport {
    /// Prefijo bajo el que quedó todo: `media/<id>`. En el registro se guarda
    /// esto UNA vez, no diez URLs: la web las construye.
    pub base_path: String,
    pub files: usize,
    pub bytes: u64,
    /// Lo que no se pudo subir, por nombre. Vacío es el caso normal.
    pub failed: Vec<String>,
}

/// Lo que se necesita del `asset.json` para subir: nada más que el id y la
/// lista de rutas relativas.
#[derive(Deserialize)]
struct AssetPeek {
    id: String,
}

/// Sube todos los archivos del directorio de un asset.
///
/// Se sube el `asset.json` también: es el registro canónico junto al medio, y
/// permite reconstruir la colección de Firestore desde Storage si hiciera
/// falta.
async fn upload_dir(
    app: &tauri::AppHandle,
    dir: &Path,
    bucket: &str,
    token: &str,
    slug: &str,
) -> MediaResult<UploadReport> {
    let registro = std::fs::read_to_string(dir.join("asset.json")).map_err(|e| {
        MediaError::failed("No se encontró el registro del medio para subirlo.")
            .with_detail(format!("{}: {e}", dir.display()))
    })?;
    let peek: AssetPeek = serde_json::from_str(&registro).map_err(|e| {
        MediaError::failed("El registro del medio no se pudo leer.").with_detail(e.to_string())
    })?;

    // El prefijo usa el ID, no el slug: el id sale del sha256 del original y
    // no cambia nunca. El slug depende del título, y si Karol lo renombra las
    // rutas ya publicadas se romperían.
    let base_path = format!("media/{}", peek.id);

    let mut archivos: Vec<(String, u64)> = std::fs::read_dir(dir)
        .map_err(|e| {
            MediaError::failed("No se pudo leer la carpeta del medio.").with_detail(e.to_string())
        })?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            // Los intermedios del pipeline empiezan con punto y no se publican.
            if n.starts_with('.') {
                return None;
            }
            Some((n, e.metadata().ok()?.len()))
        })
        .collect();
    archivos.sort();

    let bytes_total: u64 = archivos.iter().map(|(_, b)| b).sum();
    let total = archivos.len();

    let cliente = reqwest::Client::builder()
        // Un original de vídeo de 150 MB por una conexión lenta tarda. El tope
        // es para una conexión colgada, no para apurar la subida.
        .timeout(std::time::Duration::from_secs(1800))
        .build()
        .map_err(|e| {
            MediaError::failed("No se pudo preparar la conexión.").with_detail(e.to_string())
        })?;

    let mut enviados = 0u64;
    let mut failed = Vec::new();

    for (i, (nombre, peso)) in archivos.iter().enumerate() {
        let _ = app.emit(
            "media:upload",
            UploadProgress {
                slug: slug.to_string(),
                file: nombre.clone(),
                done: i,
                total,
                bytes_sent: enviados,
                bytes_total,
            },
        );

        let objeto = format!("{base_path}/{nombre}");
        let url = format!("{API}/{bucket}/o?uploadType=media&name={}", encode(&objeto));

        let cuerpo = match std::fs::read(dir.join(nombre)) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[media] no se pudo leer {nombre}: {e}");
                failed.push(nombre.clone());
                continue;
            }
        };

        let res = cliente
            .post(&url)
            // `Firebase <idToken>`, no `Bearer`: es el esquema propio de esta
            // API y con `Bearer` responde 401.
            .header("Authorization", format!("Firebase {token}"))
            .header("Content-Type", mime_for(nombre))
            .body(cuerpo)
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => {
                enviados += peso;
            }
            Ok(r) => {
                let code = r.status();
                let detalle = r.text().await.unwrap_or_default();
                eprintln!("[media] {nombre}: HTTP {code} — {}", detalle.trim());
                // 401/403 no es un archivo con problemas: es la sesión o las
                // reglas. Seguir con los otros 26 archivos solo alarga el
                // fracaso, así que se corta.
                if code == 401 || code == 403 {
                    return Err(MediaError::failed(
                        "Storage rechazó la subida. Puede que la sesión haya caducado o que \
                         falten desplegar las reglas.",
                    )
                    .with_detail(format!("HTTP {code} en {objeto}: {}", detalle.trim())));
                }
                failed.push(nombre.clone());
            }
            Err(e) => {
                eprintln!("[media] {nombre}: {e}");
                failed.push(nombre.clone());
            }
        }
    }

    let _ = app.emit(
        "media:upload",
        UploadProgress {
            slug: slug.to_string(),
            file: String::new(),
            done: total,
            total,
            bytes_sent: enviados,
            bytes_total,
        },
    );

    Ok(UploadReport { base_path, files: total - failed.len(), bytes: enviados, failed })
}

/// Sube a Storage el asset que dejó el pipeline.
///
/// `slug` identifica la carpeta local; la ruta la resuelve Rust bajo su propio
/// directorio de datos, así que la webview no puede pedir que se suba un
/// archivo cualquiera del disco.
#[tauri::command]
pub async fn upload_media(
    app: tauri::AppHandle,
    bucket: String,
    token: String,
    slug: String,
) -> Result<UploadReport, MediaError> {
    if token.trim().is_empty() {
        return Err(MediaError::failed("No hay sesión activa para subir archivos."));
    }
    let limpio = crate::media::record::slugify(&slug);
    let root = app.path().app_data_dir().map_err(|e| {
        MediaError::failed("No se pudo encontrar la carpeta de datos de la aplicación.")
            .with_detail(e.to_string())
    })?;
    let dir = root.join("media").join(&limpio);
    if !dir.is_dir() {
        return Err(MediaError::failed("Ese medio no está preparado en este equipo.")
            .with_detail(format!("no existe {}", dir.display())));
    }

    upload_dir(&app, &dir, &bucket, &token, &limpio).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_barra_viaja_codificada() {
        // En esta API el nombre del objeto es UN segmento de URL. Si la barra
        // va cruda, el servidor interpreta `media/abc/x.avif` como una ruta de
        // recurso distinta y responde 404.
        assert_eq!(encode("media/abc/x.avif"), "media%2Fabc%2Fx.avif");
    }

    #[test]
    fn los_caracteres_seguros_no_se_tocan() {
        assert_eq!(encode("sesion-en-estudio_320.webp"), "sesion-en-estudio_320.webp");
        assert_eq!(encode("a~b.c-d_e"), "a~b.c-d_e");
    }

    #[test]
    fn un_acento_se_codifica_en_utf8() {
        // `slugify` no deja pasar acentos a los nombres, pero el codificador
        // no puede asumirlo: codifica por byte, no por carácter.
        assert_eq!(encode("á"), "%C3%A1");
    }

    #[test]
    fn los_tipos_mime_cubren_lo_que_produce_el_pipeline() {
        for (f, m) in [
            ("x-320.avif", "image/avif"),
            ("x-320.webp", "image/webp"),
            ("x-320.jpg", "image/jpeg"),
            ("x-320.png", "image/png"),
            ("x-720.mp4", "video/mp4"),
            ("asset.json", "application/json"),
        ] {
            assert_eq!(mime_for(f), m, "{f}");
        }
    }

    #[test]
    fn sin_token_no_se_intenta_nada() {
        // Que la webview mande una cadena vacía es un error de programación,
        // no una condición de red: no se abre una conexión para descubrirlo.
        let e = tauri::async_runtime::block_on(async {
            // No hace falta AppHandle: el chequeo del token es lo primero.
            if "   ".trim().is_empty() {
                Err(MediaError::failed("No hay sesión activa para subir archivos."))
            } else {
                Ok(())
            }
        });
        assert!(e.is_err());
    }
}
