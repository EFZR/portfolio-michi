//! R10 — Los errores tienen dueño.
//!
//! Cuatro categorías que no se mezclan, porque colapsarlas hace que un entorno
//! mal configurado le reporte a la usuaria que su archivo está roto. La
//! distinción no es taxonómica: cambia a quién le toca arreglarlo.

use serde::Serialize;
use std::fmt;

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// Falta ffmpeg o un encoder. La usuaria no puede corregir su archivo.
    /// Debería haberse detectado al arrancar (R1).
    ToolchainUnavailable,
    /// ffprobe corrió y rechazó el archivo: corrupto, truncado, o no es un medio.
    InvalidMedia,
    /// Es un medio válido pero no llegamos. El archivo está bien; nosotros no.
    UnsupportedSource,
    /// ffmpeg falló sobre un archivo YA validado. Culpa nuestra.
    ProcessingFailed,
    TooLarge,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaError {
    pub code: ErrorCode,
    /// Para la usuaria. Accionable, en español, sin rutas.
    pub message: String,
    /// Salida cruda de ffmpeg/ffprobe. Al log y a `error.detail` del registro,
    /// NUNCA a `message`: trae rutas locales y puede traer URLs con token.
    pub detail: Option<String>,
}

impl MediaError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: None }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidMedia, message)
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::UnsupportedSource, message)
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ProcessingFailed, message)
    }
}

impl fmt::Display for MediaError {
    /// Solo el mensaje público. Si este error se loguea por accidente con
    /// `{}`, no arrastra el detalle crudo.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

pub type MediaResult<T> = Result<T, MediaError>;
