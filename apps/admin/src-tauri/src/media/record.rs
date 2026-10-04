//! El registro del asset: la forma que exige `media-asset-schema.json`.
//!
//! Lo que el panel produce son archivos y este JSON. El transporte a storage
//! es otro problema (está fuera de alcance), pero el registro tiene que
//! alcanzar para que el front arme el `<picture>` sin consultar nada más.

use crate::media::error::MediaError;
use crate::media::images::ImageRendition;
use crate::media::probe::{Kind, Orientation, SourceInfo};
use crate::media::video::{PickedBy, PreviewLoop, VideoRendition};
use serde::Serialize;

/// R11 — `pipeline.version` no es decorativa. Cuando esto suba, los assets de
/// versión anterior quedan `stale`: existen y se sirven, pero se pueden
/// re-derivar por lotes.
pub const PIPELINE_VERSION: &str = "1.0.0";

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
// El conjunto es el del esquema, cerrado, y se declara entero aunque el
// pipeline de imágenes fijas sólo produzca `Ready`: es el contrato que el
// frontend tipa y el que los estados de vídeo y de re-derivación van a usar.
// Recortarlo para callar el aviso y volver a ampliarlo es ruido en el diff.
#[allow(dead_code)]
pub enum Status {
    Uploaded,
    Processing,
    Ready,
    Failed,
    Stale,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceRecord {
    pub filename: String,
    pub bytes: u64,
    pub sha256: String,
    pub mime_type: String,
    /// Dónde quedó archivado el original. Sin el original, re-derivar es
    /// imposible (invariante 3), y eso tiene que ser una decisión consciente
    /// y no un descubrimiento a los seis meses.
    pub storage_path: String,
    pub container: String,
    pub probed_at: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Intrinsic {
    pub width: u32,
    pub height: u32,
    /// Va al CSS del contenedor ANTES de que cargue nada. Es lo único que
    /// evita el layout shift, y es gratis porque el dato ya está aquí.
    pub aspect_ratio: f64,
    pub orientation: Orientation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
    pub has_audio: bool,
    pub is_animated: bool,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Colour {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dominant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    pub source_colour_space: String,
    pub is_hdr_source: bool,
}

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Renditions {
    pub images: Vec<ImageRendition>,
    pub videos: Vec<VideoRendition>,
}

/// R7 — el poster es una imagen más, y es la que se ve en la galería: va en
/// los mismos tres formatos y en el mismo ladder de anchos.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Poster {
    pub width: u32,
    pub height: u32,
    pub at_sec: f64,
    /// Si es `Manual`, un re-proceso tiene que respetar `at_sec` y no volver
    /// a elegir.
    pub picked_by: PickedBy,
    pub formats: Vec<ImageRendition>,
}

/// Todo lo que el pipeline derivó, sea de una imagen o de un vídeo.
#[derive(Debug, Clone, Default)]
pub struct Derived {
    pub images: Vec<ImageRendition>,
    pub videos: Vec<VideoRendition>,
    pub poster: Option<Poster>,
    pub preview_loop: Option<PreviewLoop>,
    pub placeholder: Option<String>,
    pub dominant: Option<String>,
    pub source_colour_space: String,
    pub decisions: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    pub version: String,
    pub ffmpeg_version: String,
    pub encoded_at: String,
    pub duration_ms: u64,
    /// R11 — las decisiones en texto legible. Sin esto, dentro de seis meses
    /// nadie sabe por qué un asset tiene siete anchos y otro tres.
    pub decisions: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub slug: String,
    pub kind: Kind,
    pub title: String,
    /// R12 — `None` significa «nadie lo escribió todavía»; `Some("")`
    /// significa explícitamente «imagen decorativa». No se colapsan: el
    /// primero bloquea la publicación, el segundo no.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credit: Option<String>,
    /// Etiquetas libres. El importador marca con `provisional` las imágenes de
    /// relleno, para que se pueda listar qué falta reemplazar por una foto
    /// real en vez de que se olvide a los dos meses.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub source: SourceRecord,
    pub intrinsic: Intrinsic,
    pub colour: Colour,
    pub renditions: Renditions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poster: Option<Poster>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_loop: Option<PreviewLoop>,
    pub pipeline: Pipeline,
    pub status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<MediaError>,
    /// `null` explícito: el asset existe y no está publicado. Distinto de
    /// ausente.
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl AssetRecord {
    /// ¿Se puede servir este asset?
    ///
    /// DECISIÓN DEL PROYECTO, que se aparta del R12 del contrato: el `alt` NO
    /// bloquea la publicación. El contrato pedía que un asset sin texto
    /// alternativo no se publicara; en la práctica eso dejaba 45 fotos
    /// procesadas inservibles hasta escribir 45 descripciones, y convertía
    /// cada subida en dos tareas.
    ///
    /// El coste es real y conviene tenerlo escrito: un lector de pantalla y un
    /// buscador no sabrán qué hay en una foto sin `alt`. Sigue siendo un campo
    /// editable y recomendable; ya no es una puerta.
    pub fn can_publish(&self) -> bool {
        self.status == Status::Ready && self.fallback_exists()
    }

    /// Invariante 6 para los dos tipos: una imagen necesita jpeg o png, un
    /// vídeo necesita el h264/mp4.
    pub fn fallback_exists(&self) -> bool {
        match self.kind {
            Kind::Image => self.fallback().is_some(),
            Kind::Video => self.renditions.videos.iter().any(|v| v.is_fallback),
        }
    }

    /// El fallback universal del invariante 6: el `<img>` final del
    /// `<picture>`. JPEG, o PNG cuando hay transparencia.
    pub fn fallback(&self) -> Option<&ImageRendition> {
        use crate::media::images::ImageFormat;
        let objetivo = if self.renditions.images.iter().any(|r| r.has_alpha) {
            ImageFormat::Png
        } else {
            ImageFormat::Jpeg
        };
        self.renditions
            .images
            .iter()
            .filter(|r| r.format == objetivo)
            .max_by_key(|r| r.width)
    }
}

/// Reduce un texto a un slug seguro para nombre de archivo y de carpeta.
///
/// No es cosmética: el slug viene del frontend y se usa para construir una
/// ruta. Dejar pasar `/` o `..` permitiría escribir fuera del directorio del
/// asset. Por eso la lista es blanca y no negra.
pub fn slugify(raw: &str) -> String {
    let mut out = String::new();
    let mut guion = false;
    // Se minusculiza ANTES de clasificar: si no, una 'Ú' no coincide con
    // ningún caso y se trata como separador, dejando «MAYÚSCULAS» en
    // «may-sculas».
    for ch in raw.to_lowercase().chars() {
        let c = match ch {
            'a'..='z' | '0'..='9' => ch,
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            _ => {
                guion = !out.is_empty();
                continue;
            }
        };
        if guion {
            out.push('-');
            guion = false;
        }
        out.push(c);
    }
    if out.is_empty() {
        "medio".to_string()
    } else {
        out.chars().take(80).collect()
    }
}

/// Arma el registro a partir del sondeo y de la escalera ya generada.
#[allow(clippy::too_many_arguments)]
pub fn build(
    id: String,
    slug: String,
    title: String,
    alt: Option<String>,
    tags: Vec<String>,
    info: &SourceInfo,
    derived: Derived,
    archived_at: String,
    ffmpeg_version: String,
    now: String,
    duration_ms: u64,
) -> AssetRecord {
    let mut decisions = derived.decisions;
    if let Some(d) = orientation_decision(info) {
        decisions.push(d);
    }

    AssetRecord {
        id,
        slug,
        kind: info.kind,
        title,
        alt,
        caption: None,
        credit: None,
        tags,
        source: SourceRecord {
            filename: info.filename.clone(),
            bytes: info.bytes,
            sha256: info.sha256.clone(),
            mime_type: mime_for(&info.codec),
            storage_path: archived_at,
            container: info.container.clone(),
            probed_at: now.clone(),
        },
        intrinsic: Intrinsic {
            width: info.width,
            height: info.height,
            aspect_ratio: info.aspect_ratio,
            orientation: info.orientation,
            duration_sec: info.duration_sec,
            fps: info.fps,
            has_audio: info.has_audio,
            is_animated: info.is_animated,
        },
        colour: Colour {
            dominant: derived.dominant,
            placeholder: derived.placeholder,
            source_colour_space: derived.source_colour_space,
            is_hdr_source: info.is_hdr_source,
        },
        renditions: Renditions { images: derived.images, videos: derived.videos },
        poster: derived.poster,
        preview_loop: derived.preview_loop,
        pipeline: Pipeline {
            version: PIPELINE_VERSION.to_string(),
            ffmpeg_version,
            encoded_at: now.clone(),
            duration_ms,
            decisions,
            warnings: derived.warnings,
        },
        status: Status::Ready,
        error: None,
        published_at: None,
        created_at: now.clone(),
        updated_at: now,
    }
}

/// Resumen legible de la orientación, para `pipeline.decisions` (R11).
fn orientation_decision(info: &SourceInfo) -> Option<String> {
    let m = info.display_matrix?;
    if m == [65536, 0, 0, 0, 65536, 0, 0, 0, 1_073_741_824] {
        return None; // identidad: no hay nada que contar
    }
    Some(format!(
        "orientación EXIF resuelta por ffmpeg: se mide {}x{} (almacenado {}x{})",
        info.width, info.height, info.stored_width, info.stored_height
    ))
}

/// Tipo MIME de la fuente a partir del codec que reportó ffprobe.
fn mime_for(codec: &str) -> String {
    match codec {
        "mjpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" | "webp_anim" => "image/webp",
        "av1" => "image/avif",
        "gif" => "image/gif",
        "tiff" => "image/tiff",
        "h264" => "video/mp4",
        "hevc" => "video/mp4",
        "vp9" | "vp8" => "video/webm",
        otro => return format!("application/octet-stream; codec={otro}"),
    }
    .to_string()
}
