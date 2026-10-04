/**
 * EL REGISTRO DE UN MEDIO — espejo en TypeScript de lo que produce el pipeline.
 *
 * La forma la define `docs/change-history/pending/media-asset-schema.json` y la
 * escribe `apps/admin/src-tauri/src/media/record.rs`. Esto es la vista que
 * necesitan los dos consumidores: el panel para elegir de la biblioteca, y la
 * web para armar el `<picture>`.
 *
 * Está en el paquete compartido y NO en `apps/web` porque si cada app
 * declarara su propia versión, un campo añadido en Rust dejaría a una de las
 * dos mintiendo en silencio.
 */

export const IMAGE_FORMATS = ['avif', 'webp', 'jpeg', 'png'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export type MediaKind = 'image' | 'video'
export type MediaStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'stale'
export type Orientation = 'landscape' | 'portrait' | 'square'

export interface ImageRendition {
  format: ImageFormat
  width: number
  height: number
  bytes: number
  /** Nombre del archivo, relativo a `basePath`. No es una URL. */
  path: string
  mimeType: string
  hasAlpha: boolean
}

export interface VideoRendition {
  format: 'mp4' | 'webm'
  codec: 'h264' | 'av1' | 'vp9' | 'hevc'
  width: number
  height: number
  bytes: number
  bitrateBps?: number
  path: string
  mimeType: string
  hasAudio: boolean
  /** El h264/mp4 es el único que no falla en ningún navegador. */
  isFallback: boolean
}

export interface Poster {
  width: number
  height: number
  atSec: number
  pickedBy: 'auto' | 'manual'
  /** El poster pasa por la misma escalera que una foto. */
  formats: ImageRendition[]
}

export interface PreviewLoop {
  path: string
  bytes: number
  durationSec: number
  startSec: number
  format: 'mp4' | 'webm'
}

export interface MediaAsset {
  /** sha256 del original, recortado. Estable: el mismo archivo da el mismo id. */
  id: string
  slug: string
  kind: MediaKind
  title: string
  /**
   * Ausente = nadie lo escribió todavía y NO se publica.
   * Cadena vacía = «imagen decorativa», declarado a propósito.
   * Los dos estados no se colapsan.
   */
  alt?: string
  caption?: string
  credit?: string
  tags?: string[]
  /** Prefijo en Storage: `media/<id>`. Las URLs se construyen, no se guardan. */
  basePath?: string
  source: {
    filename: string
    bytes: number
    sha256: string
    mimeType: string
    storagePath: string
    container: string
    probedAt: string
  }
  intrinsic: {
    width: number
    height: number
    /** Va al CSS del contenedor ANTES de que cargue nada: es lo único que evita el salto. */
    aspectRatio: number
    orientation: Orientation
    durationSec?: number
    fps?: number
    hasAudio: boolean
    isAnimated: boolean
  }
  colour: {
    dominant?: string
    /** data URI diminuto (~150 caracteres) para pintar mientras baja la real. */
    placeholder?: string
    sourceColourSpace: string
    isHdrSource: boolean
  }
  renditions: {
    images: ImageRendition[]
    videos: VideoRendition[]
  }
  poster?: Poster
  previewLoop?: PreviewLoop
  pipeline: {
    version: string
    ffmpegVersion: string
    encodedAt: string
    durationMs: number
    decisions: string[]
    warnings: string[]
  }
  status: MediaStatus
  error?: { code: string; message: string; detail?: string }
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}
