//! R6-R9 — Vídeo: fallback universal, poster, preview loop y GIF animado.
//!
//! Las reglas de un pipeline de signage se INVIERTEN acá, y el contrato lo
//! dice campo por campo. Lo que cambia de verdad:
//! - Se USAN b-frames (`-bf 3`). Prohibirlos agranda el peso un 10-15% sin
//!   ganar nada: ningún navegador tiene el problema de DPB de un decoder
//!   embebido.
//! - Perfil HIGH, no baseline. Soportado desde hace más de una década.
//! - Capped CRF, no CBR: importa el peso TOTAL, no el pico de un segundo.
//! - HDR se TONE-MAPEA en vez de marcarse para revisión: servirlo sin
//!   mapear se ve lavado en la mayoría de los navegadores, y eso pierde más.
//! - Varias renditions, no una: servir 1080p a un teléfono es el desperdicio
//!   más grande del pipeline.
//!
//! Lo que NO cambia: `+faststart`, `yuv420p`, dimensiones pares, nunca
//! upscalear, nunca re-encodear lo que ya cumple.

use crate::media::cmd::{self, ENCODE};
use crate::media::error::{MediaError, MediaResult};
use crate::media::probe::SourceInfo;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// R6. Para un portafolio 1080p suele ser el techo útil.
pub const HEIGHTS: &[u32] = &[480, 720, 1080];

/// 1440/2160 sólo si la pieza es específicamente sobre resolución. No se
/// generan por defecto: duplican el tiempo de encode y el peso en disco para
/// algo que casi nadie va a ver en una galería.
pub const HIGH_HEIGHTS: &[u32] = &[1440, 2160];

/// Techo de bitrate por altura. NO es CBR: el CRF fija la calidad y esto sólo
/// evita que un plano caótico dispare el peso. Un plano simple debe pesar poco.
fn maxrate_for(height: u32) -> (&'static str, &'static str) {
    match height {
        h if h <= 480 => ("1.5M", "3M"),
        h if h <= 720 => ("4M", "8M"),
        h if h <= 1080 => ("8M", "16M"),
        h if h <= 1440 => ("14M", "28M"),
        _ => ("28M", "56M"),
    }
}

/// Duración del preview loop, en segundos (R8).
const PREVIEW_SECONDS: &str = "3";

/// Transferencias que disparan el tone-map (R6/hdrToneMap).
const HDR_TRANSFERS: &[&str] = &["smpte2084", "arib-std-b67"];

/// Un frame con luma media por debajo de esto se considera casi negro.
///
/// **SUPOSICIÓN**: el contrato dice «combinar con `blackframe` para descartar
/// frames casi negros» pero no da umbral. 40/255 sale de medir: el frame que
/// `thumbnail` eligió en un clip con fundido de 1.5 s dio 129, y el timestamp
/// ciego del segundo 1 —dentro del fundido— dio 79. 40 deja pasar el 79 y
/// atrapa lo realmente negro, que es lo que se quiere: no descartar un plano
/// legítimamente oscuro.
const BLACK_LUMA: u8 = 40;

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
// El conjunto del esquema. `Webm` existe porque es el contenedor de las
// renditions AV1/VP9 que el contrato deja para una fase posterior; el
// frontend ya tipa el campo con los dos valores.
#[allow(dead_code)]
pub enum VideoFormat {
    Mp4,
    Webm,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)] // El conjunto del esquema; av1/vp9 llegan con los webm.
pub enum VideoCodec {
    H264,
    Av1,
    Vp9,
    Hevc,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoRendition {
    pub format: VideoFormat,
    pub codec: VideoCodec,
    /// MEDIDOS del archivo producido (invariante 8).
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate_bps: Option<u64>,
    pub path: String,
    pub mime_type: &'static str,
    pub has_audio: bool,
    /// El h264/mp4 es el único que no falla en ningún lado (invariante 6).
    pub is_fallback: bool,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PickedBy {
    Auto,
    Manual,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreviewLoop {
    pub path: String,
    pub bytes: u64,
    pub duration_sec: f64,
    pub start_sec: f64,
    pub format: VideoFormat,
}

/// El frame del poster, ya extraído. La escalera de imágenes se genera después
/// reutilizando `images::render`: el poster es una imagen más, y es la que se
/// ve en la galería.
pub struct PosterFrame {
    pub path: PathBuf,
    pub at_sec: f64,
    pub picked_by: PickedBy,
}

#[derive(Debug, Clone, Default)]
pub struct VideoOutput {
    pub renditions: Vec<VideoRendition>,
    pub decisions: Vec<String>,
    pub warnings: Vec<String>,
}

/// R6 — alturas ≤ la del original (invariante 1).
pub fn ladder(height: u32, include_high: bool) -> Vec<u32> {
    let fuente: Vec<u32> = if include_high {
        HEIGHTS.iter().chain(HIGH_HEIGHTS).copied().collect()
    } else {
        HEIGHTS.to_vec()
    };
    let v: Vec<u32> = fuente.into_iter().filter(|h| *h <= height).collect();
    if v.is_empty() {
        // Un clip vertical muy chico, o un GIF de 200 px de alto: igual tiene
        // que existir una rendition servible (invariante 6).
        vec![height - height % 2]
    } else {
        v
    }
}

/// R6/hdrToneMap — mapea HDR a SDR BT.709 cuando hace falta.
///
/// Devuelve el prefijo de filtro y la decisión para el registro. Es la
/// decisión más revisable del pipeline, así que queda escrita.
/// Sólo el filtro, para reutilizarlo en el poster y en el preview. Si el
/// poster no se tone-mapeara, saldría lavado mientras el vídeo sale corregido.
pub fn tonemap_for(info: &SourceInfo) -> Option<String> {
    tonemap_prefix(info).0
}

fn tonemap_prefix(info: &SourceInfo) -> (Option<String>, Option<String>) {
    let hdr = info
        .colour_transfer
        .as_deref()
        .map(|t| HDR_TRANSFERS.contains(&t))
        .unwrap_or(false);

    if !hdr {
        return (None, None);
    }
    (
        Some(
            "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,\
             tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
                .to_string(),
        ),
        Some(format!(
            "tone-map HDR→BT.709 (la fuente declara {})",
            info.colour_transfer.as_deref().unwrap_or("HDR")
        )),
    )
}

/// R6/colourTagging — taggear los tres campos de forma coherente, nunca
/// parcial.
///
/// En un decoder por hardware un tagging parcial impide la negociación y el
/// vídeo no reproduce. En un navegador no rompe nada, pero cada navegador
/// asume un defecto distinto para lo que falta y aparece un corrimiento de
/// color visible entre Safari y Chrome. Síntoma distinto, misma solución.
fn colour_tag_args() -> Vec<String> {
    ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
     "-color_range", "tv"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Audio para el mp4, o `-an`.
///
/// Si la fuente no tiene pista, NO se agrega una silenciosa: eso hacía falta en
/// pipelines que exigían audio presente, y acá pesa de gratis.
fn audio_args(has_audio: bool) -> Vec<String> {
    if has_audio {
        ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        vec!["-an".to_string()]
    }
}

/// Mide un vídeo producido: dimensiones, bytes y bitrate reales.
fn measure(path: &Path) -> MediaResult<(u32, u32, u64, Option<u64>)> {
    let out = cmd::run(
        "ffprobe",
        &[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=bit_rate",
            "-of", "json",
            &path.to_string_lossy(),
        ],
        cmd::SHORT,
        true,
    )?;

    let v: serde_json::Value = serde_json::from_str(&out.stdout).map_err(|e| {
        MediaError::failed("No se pudo medir el vídeo generado.").with_detail(e.to_string())
    })?;
    let s = v["streams"].get(0).ok_or_else(|| {
        MediaError::failed("El vídeo generado no tiene pista de imagen.")
            .with_detail(out.stdout.clone())
    })?;

    let w = s["width"].as_u64().unwrap_or(0) as u32;
    let h = s["height"].as_u64().unwrap_or(0) as u32;
    if w == 0 || h == 0 {
        return Err(MediaError::failed("El vídeo generado mide cero.")
            .with_detail(out.stdout.clone()));
    }
    let bitrate = v["format"]["bit_rate"].as_str().and_then(|x| x.parse().ok());
    let bytes = std::fs::metadata(path)
        .map_err(|e| MediaError::failed("No se pudo medir el archivo.").with_detail(e.to_string()))?
        .len();

    Ok((w, h, bytes, bitrate))
}

/// ¿El `moov` va antes del `mdat`? Es lo que `+faststart` consigue, y sin eso
/// el navegador tiene que bajar el archivo entero antes del primer frame.
///
/// Se leen los boxes de nivel superior sin parsear nada más: cada uno es
/// `[u32 tamaño][4 bytes de tipo]`.
fn has_faststart(path: &Path) -> bool {
    use std::io::Read;
    let mut f = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    // Los boxes de cabecera son chicos; 256 KB alcanzan de sobra para
    // encontrar el primero de los dos sin leer un archivo de 2 GB.
    let mut buf = vec![0u8; 256 * 1024];
    let n = match f.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };

    let mut i = 0usize;
    while i + 8 <= n {
        let size = u32::from_be_bytes([buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]) as usize;
        let kind = &buf[i + 4..i + 8];
        if kind == b"moov" {
            return true;
        }
        if kind == b"mdat" {
            return false; // el mdat llegó primero
        }
        if size < 8 {
            return false;
        }
        i += size;
    }
    false
}

/// R2 caso 1 — ¿esta fuente ya cumple el target para su altura nativa?
///
/// Nunca re-encodear lo que ya cumple: cada generación es calidad perdida.
fn already_compliant(info: &SourceInfo, src: &Path) -> bool {
    info.codec == "h264"
        && info.pix_fmt == "yuv420p"
        && info.container.contains("mp4")
        && !info.is_hdr_source
        && HEIGHTS.contains(&info.height)
        && has_faststart(src)
}

/// Luma media de un frame, para descartar los casi negros.
///
/// Va por ARCHIVO y no por stdout a propósito: `cmd::Output.stdout` pasa por
/// `from_utf8_lossy`, que reemplaza cualquier byte > 127 por el carácter de
/// reemplazo. Un luma de 200 llegaría como 239 y el umbral mediría cualquier
/// cosa.
fn mean_luma(path: &Path, tmp: &Path) -> Option<u8> {
    let raw = tmp.join(".luma.raw");
    cmd::run(
        "ffmpeg",
        &[
            "-v", "error", "-y",
            "-i", &path.to_string_lossy(),
            "-vf", "scale=1:1",
            "-frames:v", "1",
            "-f", "rawvideo",
            "-pix_fmt", "gray",
            &raw.to_string_lossy(),
        ],
        cmd::SHORT,
        false,
    )
    .ok()?;
    let bytes = std::fs::read(&raw).ok()?;
    std::fs::remove_file(&raw).ok();
    bytes.first().copied()
}

/// R7 — el poster no se saca en el segundo 1.
///
/// `thumbnail=100` puntúa los frames de cada lote de 100 y elige el más
/// representativo. MEDIDO sobre un clip con fundido de 1.5 s: eligió el
/// segundo 3.28 con luma 129/255, mientras que el timestamp ciego del segundo
/// 1 cayó dentro del fundido con luma 79/255.
///
/// `showinfo` es lo que devuelve el timestamp elegido, y va a `poster.atSec`
/// para que un re-proceso pueda respetarlo.
pub fn pick_poster(
    src: &Path,
    dir: &Path,
    slug: &str,
    manual_at_sec: Option<f64>,
    tonemap: Option<&str>,
) -> MediaResult<(PosterFrame, Vec<String>)> {
    let dest = dir.join(format!(".{slug}-poster-frame.png"));
    let mut decisions = Vec::new();

    let base_vf = |extra: &str| -> String {
        match tonemap {
            Some(t) => format!("{t},{extra}"),
            None => extra.to_string(),
        }
    };

    // R7/manualOverride: si alguien lo corrigió a mano, el re-proceso respeta
    // su elección y NO vuelve a elegir.
    if let Some(at) = manual_at_sec {
        cmd::run(
            "ffmpeg",
            &[
                "-v".into(), "error".into(), "-y".into(),
                "-ss".into(), at.to_string(),
                "-i".into(), src.to_string_lossy().into_owned(),
                "-vf".into(), base_vf("scale=iw:ih"),
                "-frames:v".into(), "1".into(),
                dest.to_string_lossy().into_owned(),
            ],
            ENCODE,
            false,
        )?;
        decisions.push(format!("poster: elección manual en {at:.2}s, respetada sin re-elegir"));
        return Ok((
            PosterFrame { path: dest, at_sec: at, picked_by: PickedBy::Manual },
            decisions,
        ));
    }

    let out = cmd::run(
        "ffmpeg",
        &[
            "-v".into(), "info".into(), "-y".into(),
            "-i".into(), src.to_string_lossy().into_owned(),
            "-vf".into(), base_vf("thumbnail=100,showinfo"),
            "-frames:v".into(), "1".into(),
            dest.to_string_lossy().into_owned(),
        ],
        ENCODE,
        false,
    )?;

    let at_sec = parse_pts_time(&out.stderr).unwrap_or(0.0);

    // La red extra del R7: si el frame elegido es casi negro —material con
    // fundidos largos— se intenta una vez más desde el 25% del clip.
    match mean_luma(&dest, dir) {
        Some(l) if l < BLACK_LUMA => {
            decisions.push(format!(
                "poster: el frame de {at_sec:.2}s salió casi negro (luma {l}), se busca más adelante"
            ));
            let salto = info_duration_fallback(src).map(|d| d * 0.25).unwrap_or(1.0);
            let retry = cmd::run(
                "ffmpeg",
                &[
                    "-v".into(), "info".into(), "-y".into(),
                    "-ss".into(), format!("{salto:.3}"),
                    "-i".into(), src.to_string_lossy().into_owned(),
                    "-vf".into(), base_vf("thumbnail=100,showinfo"),
                    "-frames:v".into(), "1".into(),
                    dest.to_string_lossy().into_owned(),
                ],
                ENCODE,
                false,
            )?;
            let at2 = parse_pts_time(&retry.stderr).map(|t| t + salto).unwrap_or(salto);
            Ok((
                PosterFrame { path: dest, at_sec: at2, picked_by: PickedBy::Auto },
                decisions,
            ))
        }
        _ => {
            decisions.push(format!("poster: frame de {at_sec:.2}s elegido por `thumbnail`"));
            Ok((
                PosterFrame { path: dest, at_sec, picked_by: PickedBy::Auto },
                decisions,
            ))
        }
    }
}

/// Lee el `pts_time:` que imprime `showinfo` en stderr.
fn parse_pts_time(stderr: &str) -> Option<f64> {
    stderr
        .split("pts_time:")
        .nth(1)?
        .split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .next()?
        .parse()
        .ok()
}

/// Duración por si `SourceInfo` no la trajo (un GIF, por ejemplo).
fn info_duration_fallback(src: &Path) -> Option<f64> {
    let out = cmd::run(
        "ffprobe",
        &[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            &src.to_string_lossy(),
        ],
        cmd::SHORT,
        true,
    )
    .ok()?;
    out.stdout.trim().parse().ok()
}

/// R8 — preview loop: archivo aparte, sin audio.
///
/// Servir el vídeo completo para un hover en la galería es el error de
/// performance más común en portafolios; por eso es un archivo distinto.
/// Y siempre sin audio: todo autoplay va muted o el navegador lo bloquea.
pub fn render_preview_loop(
    src: &Path,
    dir: &Path,
    slug: &str,
    start_sec: f64,
    tonemap: Option<&str>,
) -> MediaResult<PreviewLoop> {
    let name = format!("{slug}-preview.mp4");
    let dest = dir.join(&name);

    let vf = match tonemap {
        Some(t) => format!("{t},scale=-2:480"),
        None => "scale=-2:480".to_string(),
    };

    // `-ss` ANTES de `-i`: con transcodificación ffmpeg hace búsqueda precisa
    // igual, y así no decodifica desde el principio del archivo.
    cmd::run(
        "ffmpeg",
        &[
            "-v".into(), "error".into(), "-y".into(),
            "-ss".into(), format!("{start_sec:.3}"),
            "-i".into(), src.to_string_lossy().into_owned(),
            "-t".into(), PREVIEW_SECONDS.into(),
            "-an".into(),
            "-vf".into(), vf,
            "-c:v".into(), "libx264".into(),
            "-crf".into(), "28".into(),
            "-preset".into(), "slow".into(),
            "-pix_fmt".into(), "yuv420p".into(),
            "-movflags".into(), "+faststart".into(),
            dest.to_string_lossy().into_owned(),
        ],
        ENCODE,
        false,
    )?;

    let (_, _, bytes, _) = measure(&dest)?;
    let duration = info_duration_fallback(&dest).unwrap_or(0.0);

    Ok(PreviewLoop {
        path: name,
        bytes,
        duration_sec: duration,
        start_sec,
        format: VideoFormat::Mp4,
    })
}

/// R9 — GIF animado → vídeo, siempre.
///
/// Un GIF de 5 MB se vuelve un mp4 de ~200 KB con mejor calidad: es la
/// optimización de mayor rendimiento del pipeline entero.
///
/// El `trunc(iw/2)*2` no es decorativo: los GIF tienen dimensiones impares con
/// frecuencia y H.264 con 4:2:0 las rechaza.
pub fn render_animated(
    info: &SourceInfo,
    src: &Path,
    dir: &Path,
    slug: &str,
) -> MediaResult<VideoOutput> {
    let name = format!("{slug}-loop.mp4");
    let dest = dir.join(&name);

    cmd::run(
        "ffmpeg",
        &[
            "-v", "error", "-y",
            "-i", &src.to_string_lossy(),
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "slow",
            "-pix_fmt", "yuv420p",
            "-an",
            "-movflags", "+faststart",
            &dest.to_string_lossy(),
        ],
        ENCODE,
        false,
    )?;

    let (w, h, bytes, bitrate) = measure(&dest)?;

    let mut out = VideoOutput::default();

    // MEDIDO: para un GIF diminuto el mp4 sale MÁS GRANDE — un GIF de 4
    // cuadros planos de 908 bytes dio un mp4 de 2155, porque el contenedor
    // MP4 tiene un suelo de 1-2 KB entre ftyp, moov y mdat. La conversión se
    // hace igual (el contrato dice siempre, y para un GIF real de MB la
    // reducción es enorme), pero la comparación queda escrita en los dos
    // sentidos y avisa cuando crece.
    let delta = 100.0 - (bytes as f64 / info.bytes as f64 * 100.0);
    out.decisions.push(format!(
        "GIF animado convertido a mp4: {} KB → {} KB ({:.0}% {})",
        info.bytes / 1024,
        bytes / 1024,
        delta.abs(),
        if delta >= 0.0 { "menos" } else { "MÁS" }
    ));
    if bytes > info.bytes {
        out.warnings.push(format!(
            "El mp4 pesa {} bytes y el GIF original {}: para animaciones muy chicas el \
             contenedor MP4 pesa más que el GIF. Se convierte igual porque un <video> se \
             puede pausar y decodifica mejor, pero acá no hay ahorro de peso.",
            bytes, info.bytes
        ));
    }
    if w != info.width || h != info.height {
        out.decisions.push(format!(
            "dimensiones redondeadas a par: {}x{} → {w}x{h} (H.264 con 4:2:0 rechaza las impares)",
            info.width, info.height
        ));
    }
    out.warnings.push(
        "Es un GIF animado: se guarda como vídeo en loop sin audio. El front lo tiene que \
         pintar con <video autoplay muted loop playsinline>, no con <img>."
            .into(),
    );
    out.renditions.push(VideoRendition {
        format: VideoFormat::Mp4,
        codec: VideoCodec::H264,
        width: w,
        height: h,
        bytes,
        bitrate_bps: bitrate,
        path: name,
        mime_type: "video/mp4",
        has_audio: false,
        is_fallback: true,
    });

    Ok(out)
}

/// R6 — la escalera de h264/mp4. El fallback que siempre funciona.
pub fn render(
    info: &SourceInfo,
    src: &Path,
    dir: &Path,
    slug: &str,
    include_high: bool,
) -> MediaResult<VideoOutput> {
    let mut out = VideoOutput::default();
    let (tonemap, tonemap_decision) = tonemap_prefix(info);
    if let Some(d) = tonemap_decision {
        out.decisions.push(d);
    }

    let alturas = ladder(info.height, include_high);
    out.decisions.push(format!(
        "escalera de vídeo {alturas:?}: el original mide {} px de alto",
        info.height
    ));

    // R2 caso 1 — paso directo para la altura nativa.
    //
    // No es una copia de bytes: es un REMUX con `-map_metadata -1`. MEDIDO: un
    // `-c copy` normal CONSERVA los tags `location`/`location-eng` que mete un
    // teléfono, y en un portafolio público eso publica dónde se grabó. Con
    // `-map_metadata -1` desaparecen y el MD5 del bitstream de vídeo queda
    // IDÉNTICO: cero pérdida de calidad y cero geolocalización.
    let nativa_pasa = already_compliant(info, src) && alturas.contains(&info.height);
    if nativa_pasa {
        let name = format!("{slug}-{}.mp4", info.height);
        let dest = dir.join(&name);
        cmd::run(
            "ffmpeg",
            &[
                "-v", "error", "-y",
                "-i", &src.to_string_lossy(),
                "-c", "copy",
                "-map_metadata", "-1",
                "-movflags", "+faststart",
                &dest.to_string_lossy(),
            ],
            ENCODE,
            false,
        )?;
        let (w, h, bytes, bitrate) = measure(&dest)?;
        out.decisions.push(format!(
            "{}p sin re-encodear: la fuente ya cumple (h264/yuv420p/faststart). \
             Remux con metadata descartada, bitstream intacto",
            info.height
        ));
        out.renditions.push(VideoRendition {
            format: VideoFormat::Mp4,
            codec: VideoCodec::H264,
            width: w,
            height: h,
            bytes,
            bitrate_bps: bitrate,
            path: name,
            mime_type: "video/mp4",
            has_audio: info.has_audio,
            is_fallback: true,
        });
    }

    // Los fps mandan el GOP: ~2 s, que es lo razonable en la web. No hay
    // prefetch de zonas que recuperar como en un reproductor de signage.
    let fps = info.fps.filter(|f| *f > 0.0 && *f <= 120.0).unwrap_or(25.0);
    let gop = ((fps * 2.0).round() as u32).max(2).to_string();

    for &h in &alturas {
        if nativa_pasa && h == info.height {
            continue;
        }
        let (maxrate, bufsize) = maxrate_for(h);
        let name = format!("{slug}-{h}.mp4");
        let dest = dir.join(&name);

        // `-2` deriva el ancho del aspecto y lo redondea a par. Nunca se
        // estira ni se recorta: eso sería una decisión editorial.
        let vf = match tonemap.as_deref() {
            Some(t) => format!("{t},scale=-2:{h}"),
            None => format!("scale=-2:{h}"),
        };

        let mut args: Vec<String> = vec![
            "-v".into(), "error".into(), "-y".into(),
            "-i".into(), src.to_string_lossy().into_owned(),
            "-vf".into(), vf,
            "-c:v".into(), "libx264".into(),
            "-preset".into(), "slow".into(),
            "-crf".into(), "21".into(),
            "-profile:v".into(), "high".into(),
            "-level".into(), "4.1".into(),
            "-pix_fmt".into(), "yuv420p".into(),
            // b-frames: comprimen 10-15% mejor y ningún navegador se queja.
            "-bf".into(), "3".into(),
            "-g".into(), gop.clone(),
            "-keyint_min".into(), gop.clone(),
            // Techo, no objetivo: capped CRF.
            "-maxrate".into(), maxrate.into(),
            "-bufsize".into(), bufsize.into(),
        ];
        args.extend(audio_args(info.has_audio));
        args.extend(colour_tag_args());
        // Sin esto el navegador baja el archivo entero antes del primer frame.
        args.extend(["-movflags".to_string(), "+faststart".to_string()]);
        args.push(dest.to_string_lossy().into_owned());

        cmd::run("ffmpeg", &args, ENCODE, false).map_err(|e| {
            MediaError::failed(format!("No se pudo generar la versión de {h}p."))
                .with_detail(e.detail.unwrap_or(e.message))
        })?;

        let (w, mh, bytes, bitrate) = measure(&dest)?;
        if mh != h {
            return Err(MediaError::failed(
                "Las versiones de vídeo no salieron con el tamaño esperado; no se guardó.",
            )
            .with_detail(format!("se pidió {h}p y el archivo mide {w}x{mh}")));
        }
        if !has_faststart(&dest) {
            return Err(MediaError::failed(
                "El vídeo generado no quedó optimizado para empezar a reproducir; no se guardó.",
            )
            .with_detail(format!("{name}: el moov no quedó antes del mdat")));
        }

        out.renditions.push(VideoRendition {
            format: VideoFormat::Mp4,
            codec: VideoCodec::H264,
            width: w,
            height: mh,
            bytes,
            bitrate_bps: bitrate,
            path: name,
            mime_type: "video/mp4",
            has_audio: info.has_audio,
            is_fallback: true,
        });
    }

    if !info.has_audio {
        out.decisions
            .push("sin pista de audio en la fuente: se usa `-an` y no se agrega una silenciosa".into());
    }
    out.decisions
        .push("salida taggeada bt709/bt709/bt709/tv para que Safari y Chrome no difieran".into());
    out.warnings.push(
        "No se generan versiones en AV1 ni VP9 (webm). Bajarían el peso, pero duplican el \
         tiempo de encode; el mp4/h264 funciona en todas partes."
            .into(),
    );

    Ok(out)
}
