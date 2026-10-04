//! Pipeline de normalización de medios con ffmpeg.
//!
//! Vive en Rust y no en la webview porque la webview no puede lanzar procesos.
//! Cada paso del brief (docs/change-history/pending/project-prompt.md) entra
//! aquí como su propio módulo; por ahora solo está el R1.

pub mod cmd;
pub mod error;
pub mod probe;
pub mod toolchain;
