//! R1 — Detección del toolchain al arrancar, no en el primer archivo.
//!
//! Por qué esto es un comando de Rust propio y NO `tauri-plugin-shell`: el
//! plugin de shell le da a la webview la capacidad de ejecutar procesos. Aunque
//! se limite el alcance por configuración, la superficie queda abierta y el
//! contenido que pinta el panel viene de la base de datos. Aquí la webview solo
//! puede pedir UNA cosa —"sondeá el toolchain"— y los argumentos los fija este
//! archivo. No hay forma de inyectar un comando desde el frontend.
//!
//! Nunca se construye una línea de shell: `Command` recibe el programa y los
//! argumentos por separado, así que no hay interpretación de metacaracteres.

use serde::Serialize;
use std::collections::BTreeMap;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Encoders que el pipeline puede llegar a necesitar. El orden es el del brief.
const ENCODERS: &[&str] = &[
    "libx264",
    "libaom-av1",
    "libsvtav1",
    "libwebp",
    "libvpx-vp9",
    "mjpeg",
    "png",
    "libopus",
    "aac",
];

/// Filtros. `scale`, `zscale` y `thumbnail` son los que exige el R1; el resto
/// se sondea porque su ausencia degrada pasos concretos y conviene saberlo ya.
const FILTERS: &[&str] = &[
    "scale",
    "zscale",
    "thumbnail",
    "palettegen",
    "tonemap",
    "blackframe",
    "transpose",
];

/// Un sondeo no debería tardar más que esto. `-encoders` responde en
/// milisegundos; el tope existe para un binario colgado (un montaje de red que
/// no responde), que si no dejaría el arranque del panel esperando para siempre.
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    /// Nombre con el que se invocó. No es la ruta absoluta: resolverla pediría
    /// una dependencia más (`which`) y para el registro del R11 basta la versión.
    pub program: String,
    pub version: String,
}

/// Gravedad de una carencia. La distinción importa porque determina qué le
/// decimos a la usuaria y si puede trabajar o no.
#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// No se puede procesar nada. El panel debe impedir la subida.
    Fatal,
    /// Este formato de salida concreto no se va a poder generar. El resto sí.
    Blocking,
    /// Se genera igual, peor. No impide trabajar.
    Degraded,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityGap {
    /// Identificador estable para que el frontend decida sin parsear texto.
    pub id: String,
    pub severity: Severity,
    /// Mensaje para la usuaria: concreto sobre QUÉ no se va a poder generar.
    /// Nunca lleva salida cruda de ffmpeg (R10): eso trae rutas locales.
    pub message: String,
    /// Encoders o filtros que faltan, para el log y el informe de soporte.
    pub missing: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainReport {
    /// `true` si el pipeline puede correr aunque sea en modo degradado.
    pub ok: bool,
    pub ffmpeg: Option<ToolInfo>,
    pub ffprobe: Option<ToolInfo>,
    pub encoders: BTreeMap<String, bool>,
    pub filters: BTreeMap<String, bool>,
    pub gaps: Vec<CapabilityGap>,
    /// Salida cruda del sondeo que falló. Va al log y a `error.detail`, nunca
    /// a la cara de la usuaria (R10).
    pub detail: Option<String>,
    /// Epoch en milisegundos. Lo formatea el frontend; evita una dependencia
    /// de fechas en Rust solo para esto.
    pub probed_at: u64,
    /// Cuánto tardó el sondeo completo. Útil cuando alguien reporta un
    /// arranque lento: si son 9 s, el problema es el binario, no el panel.
    pub probe_ms: u64,
    /// Cómo instalar ffmpeg en ESTE sistema. Se resuelve con `cfg!` en
    /// compilación, no se adivina en el frontend: un panel compilado para
    /// Windows no debe sugerir `pacman`.
    pub install_hint: &'static str,
}

/// Instrucción de instalación según el sistema para el que se compiló.
const fn install_hint() -> &'static str {
    if cfg!(target_os = "windows") {
        "winget install ffmpeg"
    } else if cfg!(target_os = "macos") {
        "brew install ffmpeg"
    } else {
        // Linux: la orden depende de la distribución, así que se nombra el
        // paquete y no un gestor concreto.
        "instalar el paquete `ffmpeg` desde el gestor de paquetes del sistema"
    }
}

/// Resultado crudo de ejecutar un binario. Solo se construye si el proceso
/// terminó con éxito, así que quien lo recibe puede fiarse de `stdout`.
struct Capture {
    stdout: String,
}

/// Ejecuta `program args...` con tope de tiempo, matando el proceso si se pasa.
///
/// Se lee la salida al final en vez de en paralelo: `-encoders` produce ~10 KB,
/// holgadamente por debajo del buffer de la tubería, así que el hijo no se
/// bloquea escribiendo. Si algún día se sondea algo mucho más verboso, esto
/// hay que cambiarlo por hilos lectores.
fn run(program: &str, args: &[&str]) -> Result<Capture, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("no se pudo ejecutar `{program}`: {e}"))?;

    let deadline = Instant::now() + TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("`{program}` no respondió en {}s", TIMEOUT.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(format!("fallo esperando a `{program}`: {e}")),
        }
    }

    let out = child
        .wait_with_output()
        .map_err(|e| format!("fallo leyendo la salida de `{program}`: {e}"))?;

    // Comprobar el estado NO es ceremonia. Sin esto, un `-encoders` que falle
    // deja un stdout vacío que se parsea como "no hay ningún encoder", y el
    // panel le diría a la usuaria que su ffmpeg no sirve para nada cuando el
    // problema es otro. El stderr se arrastra porque es el único sitio donde
    // ffmpeg explica por qué falló — y por eso va a `detail`, no al mensaje.
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "`{program} {}` terminó con {} — {}",
            args.join(" "),
            out.status
                .code()
                .map_or_else(|| "señal".to_string(), |c| c.to_string()),
            stderr.trim()
        ));
    }

    Ok(Capture {
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
    })
}

/// Extrae la versión de la primera línea de `-version`.
///
/// El formato es `ffmpeg version 9.0.1 Copyright (c) ...`, pero las compilaciones
/// de distribución meten sufijos (`n9.0.1-1-gabc`, `9.0.1-arch1`). Se toma el
/// token siguiente a "version" tal cual: para el registro del R11 interesa la
/// cadena exacta, no una normalizada.
fn parse_version(output: &str) -> String {
    output
        .lines()
        .next()
        .and_then(|line| {
            let mut it = line.split_whitespace();
            while let Some(tok) = it.next() {
                if tok == "version" {
                    return it.next();
                }
            }
            None
        })
        .unwrap_or("desconocida")
        .to_string()
}

/// Recoge la segunda columna de cada línea de `-encoders` / `-filters`.
///
/// Ambos listados tienen la forma `<banderas> <nombre> <resto>`. Se mete TODO
/// en un conjunto y luego se pregunta por los nombres que interesan: así las
/// líneas de cabecera no molestan y no hace falta adivinar dónde acaban.
///
/// (Un `grep` con la máscara de banderas parecía más preciso y resultó al
/// contrario: fallaba por un carácter y reportaba que faltaba todo.)
fn parse_names(output: &str) -> std::collections::HashSet<String> {
    output
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .map(str::to_string)
        .collect()
}

fn gap(id: &str, severity: Severity, message: &str, missing: &[&str]) -> CapabilityGap {
    CapabilityGap {
        id: id.to_string(),
        severity,
        message: message.to_string(),
        missing: missing.iter().map(|s| s.to_string()).collect(),
    }
}

/// Traduce "falta este encoder" a "esto no vas a poder generar".
///
/// Es la mitad del R1 que de verdad importa: un informe que diga
/// `libaom-av1: false` no le sirve a nadie que no haya compilado ffmpeg.
fn derive_gaps(
    enc: &BTreeMap<String, bool>,
    flt: &BTreeMap<String, bool>,
) -> Vec<CapabilityGap> {
    let has = |m: &BTreeMap<String, bool>, k: &str| m.get(k).copied().unwrap_or(false);
    let mut gaps = Vec::new();

    // `scale` es el único filtro sin el cual no hay nada que hacer: toda la
    // escalera de anchos pasa por él.
    if !has(flt, "scale") {
        gaps.push(gap(
            "scale",
            Severity::Fatal,
            "Este ffmpeg no trae el filtro `scale`, así que no se puede redimensionar \
             ninguna imagen. No se puede procesar nada hasta reinstalarlo.",
            &["scale"],
        ));
    }

    if !has(enc, "libaom-av1") && !has(enc, "libsvtav1") {
        gaps.push(gap(
            "avif",
            Severity::Blocking,
            "No se van a generar los AVIF (el formato más liviano, ~23 KB donde un \
             JPEG pesa ~83 KB). Las imágenes se servirán en WebP y JPEG.",
            &["libaom-av1", "libsvtav1"],
        ));
    }
    if !has(enc, "libwebp") {
        gaps.push(gap(
            "webp",
            Severity::Blocking,
            "No se van a generar los WebP. Queda el JPEG como respaldo, que pesa \
             alrededor del doble.",
            &["libwebp"],
        ));
    }
    if !has(enc, "mjpeg") {
        gaps.push(gap(
            "jpeg",
            Severity::Blocking,
            "No se va a generar el JPEG de respaldo. Un navegador viejo que no \
             entienda AVIF ni WebP se quedará sin imagen.",
            &["mjpeg"],
        ));
    }
    if !has(enc, "png") {
        gaps.push(gap(
            "png",
            Severity::Blocking,
            "No se va a poder generar el placeholder borroso que se muestra \
             mientras carga la imagen definitiva.",
            &["png"],
        ));
    }
    if !has(enc, "libx264") {
        gaps.push(gap(
            "video-h264",
            Severity::Blocking,
            "No se van a poder subir vídeos ni GIF animados: falta el encoder de \
             H.264. Las imágenes fijas funcionan igual.",
            &["libx264"],
        ));
    }
    if !has(enc, "libvpx-vp9") {
        gaps.push(gap(
            "video-vp9",
            Severity::Degraded,
            "Los vídeos se generarán solo en MP4, sin la versión WebM.",
            &["libvpx-vp9"],
        ));
    }

    // zscale viene de `--enable-libzimg`. Sin él no hay gestión de color: una
    // foto en Display P3 o un vídeo HDR saldrán con los colores lavados o
    // quemados, y no hay aviso visible — por eso esto se dice al arrancar.
    if !has(flt, "zscale") {
        gaps.push(gap(
            "color-management",
            Severity::Degraded,
            "Falta la gestión de color (`zscale`): las fotos en espacios amplios \
             (Display P3, Adobe RGB) y los vídeos HDR pueden salir con los colores \
             alterados. Las fotos sRGB normales no se ven afectadas.",
            &["zscale"],
        ));
    }
    if !has(flt, "tonemap") {
        gaps.push(gap(
            "hdr-tonemap",
            Severity::Degraded,
            "Un vídeo HDR se convertirá sin mapeo de tonos y las zonas claras \
             pueden quedar quemadas.",
            &["tonemap"],
        ));
    }
    if !has(flt, "thumbnail") {
        gaps.push(gap(
            "poster",
            Severity::Degraded,
            "La miniatura de los vídeos se tomará del primer fotograma en vez de \
             buscar el más representativo; a veces sale un cuadro negro.",
            &["thumbnail"],
        ));
    }
    if !has(flt, "transpose") {
        gaps.push(gap(
            "orientation",
            Severity::Degraded,
            "Una foto tomada en vertical con el móvil podría quedar acostada.",
            &["transpose"],
        ));
    }
    if !has(enc, "aac") && !has(enc, "libopus") {
        gaps.push(gap(
            "audio",
            Severity::Degraded,
            "Los vídeos se guardarán sin audio: no hay ningún encoder de sonido.",
            &["aac", "libopus"],
        ));
    }

    gaps
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Informe para cuando ffmpeg o ffprobe no están. No tiene sentido seguir
/// sondeando: sin el binario, todo lo demás es desconocido, no "ausente".
fn unavailable(detail: String, started: Instant) -> ToolchainReport {
    ToolchainReport {
        ok: false,
        ffmpeg: None,
        ffprobe: None,
        encoders: BTreeMap::new(),
        filters: BTreeMap::new(),
        gaps: vec![gap(
            "toolchain",
            Severity::Fatal,
            "No se encontró ffmpeg en este equipo. El panel necesita ffmpeg y \
             ffprobe para preparar las imágenes y los vídeos antes de subirlos; \
             sin ellos la subida queda desactivada.",
            &["ffmpeg", "ffprobe"],
        )],
        detail: Some(detail),
        probed_at: now_ms(),
        probe_ms: started.elapsed().as_millis() as u64,
        install_hint: install_hint(),
    }
}

/// El sondeo. Se llama una vez al arrancar el panel.
#[tauri::command]
pub async fn probe_toolchain() -> ToolchainReport {
    // `spawn_blocking` porque esto lanza procesos y espera: en el hilo async
    // de Tauri bloquearía el resto de los comandos durante el arranque.
    tauri::async_runtime::spawn_blocking(probe_blocking)
        .await
        .unwrap_or_else(|e| unavailable(format!("el hilo del sondeo falló: {e}"), Instant::now()))
}

fn probe_blocking() -> ToolchainReport {
    let started = Instant::now();

    let ffmpeg_version = match run("ffmpeg", &["-hide_banner", "-version"]) {
        Ok(c) => c.stdout,
        Err(e) => return unavailable(e, started),
    };
    let ffprobe_version = match run("ffprobe", &["-hide_banner", "-version"]) {
        Ok(c) => c.stdout,
        // ffmpeg sin ffprobe es raro pero posible en builds recortadas, y sin
        // ffprobe no hay R2: no se puede clasificar el archivo antes de tocarlo.
        Err(e) => return unavailable(e, started),
    };

    let mut detail: Option<String> = None;

    let encoder_names = match run("ffmpeg", &["-hide_banner", "-encoders"]) {
        Ok(c) => parse_names(&c.stdout),
        Err(e) => {
            detail = Some(e);
            Default::default()
        }
    };
    let filter_names = match run("ffmpeg", &["-hide_banner", "-filters"]) {
        Ok(c) => parse_names(&c.stdout),
        Err(e) => {
            detail = Some(match detail {
                Some(prev) => format!("{prev}\n{e}"),
                None => e,
            });
            Default::default()
        }
    };

    let encoders: BTreeMap<String, bool> = ENCODERS
        .iter()
        .map(|n| (n.to_string(), encoder_names.contains(*n)))
        .collect();
    let filters: BTreeMap<String, bool> = FILTERS
        .iter()
        .map(|n| (n.to_string(), filter_names.contains(*n)))
        .collect();

    let gaps = derive_gaps(&encoders, &filters);
    let ok = !gaps.iter().any(|g| matches!(g.severity, Severity::Fatal));

    ToolchainReport {
        ok,
        ffmpeg: Some(ToolInfo {
            program: "ffmpeg".into(),
            version: parse_version(&ffmpeg_version),
        }),
        ffprobe: Some(ToolInfo {
            program: "ffprobe".into(),
            version: parse_version(&ffprobe_version),
        }),
        encoders,
        filters,
        gaps,
        detail,
        probed_at: now_ms(),
        probe_ms: started.elapsed().as_millis() as u64,
        install_hint: install_hint(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_la_version_de_la_primera_linea() {
        let out = "ffmpeg version 9.0.1 Copyright (c) 2000-2025 the FFmpeg developers\n\
                   built with gcc 15.2.1\n";
        assert_eq!(parse_version(out), "9.0.1");
    }

    #[test]
    fn conserva_los_sufijos_de_distribucion() {
        // Arch publica `n9.0.1-1-gabc1234`. Para el registro del R11 interesa
        // la cadena exacta: una versión normalizada no permite reproducir.
        assert_eq!(parse_version("ffmpeg version n9.0.1-1-gabc1234 Copy"), "n9.0.1-1-gabc1234");
    }

    #[test]
    fn sin_version_no_revienta() {
        assert_eq!(parse_version(""), "desconocida");
        assert_eq!(parse_version("algo que no es ffmpeg\n"), "desconocida");
    }

    #[test]
    fn extrae_nombres_de_la_segunda_columna() {
        let out = "Encoders:\n\
                   \x20V..... = Video\n\
                   \x20------\n\
                   \x20V....D libx264              libx264 H.264 / AVC\n\
                   \x20V..... libaom-av1           libaom AV1\n\
                   \x20A....D aac                  AAC\n";
        let names = parse_names(out);
        assert!(names.contains("libx264"));
        assert!(names.contains("libaom-av1"));
        assert!(names.contains("aac"));
        assert!(!names.contains("libsvtav1"));
    }

    #[test]
    fn un_toolchain_completo_no_tiene_carencias() {
        let enc: BTreeMap<String, bool> = ENCODERS.iter().map(|n| (n.to_string(), true)).collect();
        let flt: BTreeMap<String, bool> = FILTERS.iter().map(|n| (n.to_string(), true)).collect();
        assert!(derive_gaps(&enc, &flt).is_empty());
    }

    #[test]
    fn libsvtav1_basta_para_avif() {
        // Los dos encoders de AV1 son alternativos, no acumulativos: medido en
        // esta máquina, libaom da 23.1 KB y libsvtav1 29.2 KB sobre la misma
        // fuente. Peor, pero sirve — así que no es una carencia.
        let mut enc: BTreeMap<String, bool> = ENCODERS.iter().map(|n| (n.to_string(), true)).collect();
        let flt: BTreeMap<String, bool> = FILTERS.iter().map(|n| (n.to_string(), true)).collect();
        enc.insert("libaom-av1".into(), false);
        assert!(derive_gaps(&enc, &flt).is_empty());

        enc.insert("libsvtav1".into(), false);
        let gaps = derive_gaps(&enc, &flt);
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].id, "avif");
        assert!(matches!(gaps[0].severity, Severity::Blocking));
    }

    #[test]
    fn sin_scale_todo_es_fatal() {
        let enc: BTreeMap<String, bool> = ENCODERS.iter().map(|n| (n.to_string(), true)).collect();
        let mut flt: BTreeMap<String, bool> = FILTERS.iter().map(|n| (n.to_string(), true)).collect();
        flt.insert("scale".into(), false);

        let gaps = derive_gaps(&enc, &flt);
        assert!(gaps.iter().any(|g| matches!(g.severity, Severity::Fatal)));
    }

    #[test]
    fn la_falta_de_zscale_degrada_pero_no_bloquea() {
        let enc: BTreeMap<String, bool> = ENCODERS.iter().map(|n| (n.to_string(), true)).collect();
        let mut flt: BTreeMap<String, bool> = FILTERS.iter().map(|n| (n.to_string(), true)).collect();
        flt.insert("zscale".into(), false);

        let gaps = derive_gaps(&enc, &flt);
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].id, "color-management");
        assert!(matches!(gaps[0].severity, Severity::Degraded));
    }

    #[test]
    fn ningun_mensaje_filtra_salida_cruda() {
        // R10: lo que ve la usuaria no puede traer rutas ni nombres de binario
        // con ruta. Los nombres técnicos van en `missing`, no en `message`.
        let enc: BTreeMap<String, bool> = ENCODERS.iter().map(|n| (n.to_string(), false)).collect();
        let flt: BTreeMap<String, bool> = FILTERS.iter().map(|n| (n.to_string(), false)).collect();

        for g in derive_gaps(&enc, &flt) {
            assert!(!g.message.contains('/'), "mensaje con ruta: {}", g.message);
            assert!(!g.message.is_empty());
        }
    }

    #[test]
    fn la_instruccion_de_instalacion_es_la_del_sistema_compilado() {
        let hint = install_hint();
        assert!(!hint.is_empty());
        if cfg!(target_os = "linux") {
            assert!(!hint.contains("brew"), "hint de macOS en un build de Linux");
            assert!(!hint.contains("winget"), "hint de Windows en un build de Linux");
        }
    }

    #[test]
    fn el_sondeo_real_coincide_con_lo_medido() {
        // Este test corre contra el ffmpeg de la máquina. No se salta si falta:
        // que falle es exactamente la señal de que el entorno no sirve.
        let r = probe_blocking();
        assert!(r.ffmpeg.is_some(), "no se encontró ffmpeg: {:?}", r.detail);
        assert!(r.ffprobe.is_some());
        assert!(r.ok, "toolchain inservible: {:?}", r.detail);
        assert!(r.encoders["mjpeg"], "falta mjpeg");
        assert!(r.filters["scale"], "falta scale");

        // Con `-- --nocapture` esto imprime el informe exacto que va a recibir
        // la webview. Es la forma rápida de diagnosticar una máquina ajena.
        eprintln!("{}", serde_json::to_string_pretty(&r).unwrap());
    }
}
