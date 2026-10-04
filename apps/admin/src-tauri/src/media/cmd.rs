//! Ejecución de ffmpeg/ffprobe. El único sitio del pipeline que lanza procesos.
//!
//! Nunca se construye una línea de shell: `Command` recibe el programa y los
//! argumentos por separado, así que un nombre de archivo con espacios, comillas
//! o `;` no puede convertirse en otro comando. Por eso tampoco hay un helper
//! que acepte una cadena.

use crate::media::error::{ErrorCode, MediaError, MediaResult};
use std::ffi::OsStr;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Sondeos y lecturas de metadata: rápidos o algo va mal.
pub const SHORT: Duration = Duration::from_secs(10);

/// Encodes. Un AVIF de 2560 px con libaom tarda segundos; una escalera
/// completa, decenas. El tope existe para un proceso colgado, no para
/// apurarle el trabajo a ffmpeg.
pub const ENCODE: Duration = Duration::from_secs(600);

pub struct Output {
    pub stdout: String,
    /// ffmpeg escribe los avisos y la salida de `showinfo` acá, no en stdout.
    /// Es de donde sale el timestamp del poster (R7).
    pub stderr: String,
}

/// Ejecuta y espera, con tope de tiempo y matando al hijo si se pasa.
///
/// `cap_stdout` decide si la salida estándar se captura. Para los encodes NO se
/// captura: ffmpeg puede escribir el medio a stdout y no queremos acumularlo en
/// memoria. Para `-show_streams` sí, que es JSON de unos pocos KB.
pub fn run<S: AsRef<OsStr>>(
    program: &str,
    args: &[S],
    timeout: Duration,
    cap_stdout: bool,
) -> MediaResult<Output> {
    let started = Instant::now();

    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(if cap_stdout {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            // Que el binario no esté es `toolchain_unavailable`, no un fallo de
            // procesamiento: no hay nada que la usuaria pueda corregir en su
            // archivo. El R1 debería haberlo avisado al arrancar.
            MediaError::new(
                ErrorCode::ToolchainUnavailable,
                "No se encontró ffmpeg en este equipo.",
            )
            .with_detail(format!("spawn {program}: {e}"))
        })?;

    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(MediaError::failed(
                        "El procesamiento tardó demasiado y se canceló.",
                    )
                    .with_detail(format!("{program} superó {}s", timeout.as_secs())));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(e) => {
                return Err(MediaError::failed("Falló el procesamiento del archivo.")
                    .with_detail(format!("wait {program}: {e}")))
            }
        }
    }

    let out = child.wait_with_output().map_err(|e| {
        MediaError::failed("Falló el procesamiento del archivo.")
            .with_detail(format!("output {program}: {e}"))
    })?;

    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();

    if !out.status.success() {

        // El mensaje público queda genérico a propósito. Quién convierte esto
        // en `invalid_media` o `unsupported_source` es quien llamó, que sabe
        // qué estaba intentando; aquí solo se sabe que el proceso falló.
        return Err(
            MediaError::failed("Falló el procesamiento del archivo.").with_detail(format!(
                "{program} salió con {:?}\n{}",
                out.status.code(),
                stderr.trim()
            )),
        );
    }

    Ok(Output {
        // OJO: `from_utf8_lossy` destruye los bytes > 127. Si alguna vez hace
        // falta leer un medio por stdout (un frame en rawvideo, por ejemplo),
        // NO sirve este camino: hay que escribir a un archivo y leerlo.
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr,
    })
}
