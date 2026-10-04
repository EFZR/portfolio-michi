/**
 * URLs y `<picture>` a partir de un registro de medio.
 *
 * Funciones puras sobre el registro: no tocan red, no leen entorno, y por eso
 * las comparten la web (que arma el HTML) y el panel (que muestra la vista
 * previa de la biblioteca).
 */
import type { ImageFormat, ImageRendition, MediaAsset, VideoRendition } from './types'

/** La API v0 de Firebase Storage, que es la que respeta las reglas. */
const API = 'https://firebasestorage.googleapis.com/v0/b'

/**
 * URL pública de un archivo del asset.
 *
 * LA FORMA «LIMPIA» NO SIRVE, y conviene que quede escrito:
 * `https://storage.googleapis.com/<bucket>/<path>` exige un ACL público a
 * nivel de Google Cloud Storage, y las reglas de Firebase no otorgan ACLs de
 * GCS — responde 403. Esta forma pasa por las reglas, y con lectura pública no
 * necesita el parámetro `token`.
 *
 * La barra tiene que ir como `%2F`: en esta API el nombre del objeto es UN
 * segmento de URL, no una jerarquía de carpetas. `encodeURIComponent` ya lo
 * hace; `encodeURI` NO, y es el error fácil.
 */
export function mediaUrl(bucket: string, basePath: string, filename: string): string {
  return `${API}/${bucket}/o/${encodeURIComponent(`${basePath}/${filename}`)}?alt=media`
}

/** Orden de preferencia del `<picture>`: el navegador se queda con el primero que entiende. */
export const PICTURE_ORDER: readonly ImageFormat[] = ['avif', 'webp'] as const

export interface PictureSource {
  type: string
  srcset: string
}

export interface PictureModel {
  sources: PictureSource[]
  /** El `<img>` final: el formato que funciona en todas partes. */
  src: string
  srcset: string
  width: number
  height: number
  /** Para `aspect-ratio` en CSS, que es lo que evita el layout shift. */
  aspectRatio: number
  alt: string
  placeholder?: string
  dominant?: string
}

function renditionsDe(asset: MediaAsset): ImageRendition[] {
  // Para un vídeo, las imágenes que hay son las del poster.
  return asset.kind === 'video' ? (asset.poster?.formats ?? []) : asset.renditions.images
}

/**
 * `srcset` de un formato: `url 320w, url 640w, …`
 *
 * Devuelve cadena vacía si ese formato no existe para este asset — que es el
 * caso real de una imagen con transparencia, donde no hay AVIF porque el
 * encoder de ffmpeg pierde el canal alfa.
 */
export function srcsetFor(
  asset: MediaAsset,
  bucket: string,
  format: ImageFormat,
): string {
  if (!asset.basePath) return ''
  const base = asset.basePath
  return renditionsDe(asset)
    .filter((r) => r.format === format)
    .sort((a, b) => a.width - b.width)
    .map((r) => `${mediaUrl(bucket, base, r.path)} ${r.width}w`)
    .join(', ')
}

/**
 * La rendition de respaldo: PNG si la imagen tiene transparencia, JPEG si no.
 * Es el invariante 6 — siempre existe algo que funciona en cualquier sitio.
 */
export function fallbackRendition(asset: MediaAsset): ImageRendition | undefined {
  const rs = renditionsDe(asset)
  const objetivo: ImageFormat = rs.some((r) => r.hasAlpha) ? 'png' : 'jpeg'
  const candidatas = rs.filter((r) => r.format === objetivo)
  // El más grande disponible: es el `src` del `<img>`, que solo se usa cuando
  // el navegador ignora el srcset.
  return candidatas.sort((a, b) => b.width - a.width)[0]
}

/**
 * Todo lo que un `<picture>` necesita. Devuelve `null` si el asset no está
 * subido o no tiene respaldo: pintar un `<picture>` roto es peor que no pintar.
 */
export function pictureOf(asset: MediaAsset, bucket: string): PictureModel | null {
  if (!asset.basePath) return null
  const fallback = fallbackRendition(asset)
  if (!fallback) return null

  const sources: PictureSource[] = []
  for (const f of PICTURE_ORDER) {
    const srcset = srcsetFor(asset, bucket, f)
    if (srcset) sources.push({ type: `image/${f}`, srcset })
  }

  return {
    sources,
    src: mediaUrl(bucket, asset.basePath, fallback.path),
    srcset: srcsetFor(asset, bucket, fallback.format),
    width: fallback.width,
    height: fallback.height,
    aspectRatio: asset.intrinsic.aspectRatio,
    alt: asset.alt ?? '',
    placeholder: asset.colour.placeholder,
    dominant: asset.colour.dominant,
  }
}

export interface VideoSource {
  type: string
  src: string
}

export interface VideoModel {
  sources: VideoSource[]
  poster?: string
  previewLoop?: string
  aspectRatio: number
  hasAudio: boolean
  /** Un GIF convertido: va en loop y sin controles. */
  loop: boolean
}

/**
 * Las fuentes de un `<video>`, en orden: los modernos primero y el h264/mp4
 * SIEMPRE al final, porque es el único que no falla en ningún navegador.
 */
export function videoOf(asset: MediaAsset, bucket: string): VideoModel | null {
  if (!asset.basePath || asset.kind !== 'video') return null
  const base = asset.basePath

  const peso = (v: VideoRendition) => (v.format === 'webm' ? (v.codec === 'av1' ? 0 : 1) : 2)
  const vs = [...asset.renditions.videos].sort(
    // Dentro del mismo formato, la mayor altura primero: el navegador toma la
    // primera fuente que puede reproducir, así que la calidad manda.
    (a, b) => peso(a) - peso(b) || b.height - a.height,
  )
  if (!vs.some((v) => v.isFallback)) return null

  const poster = asset.poster?.formats
    .filter((r) => r.format === 'jpeg')
    .sort((a, b) => b.width - a.width)[0]

  return {
    sources: vs.map((v) => ({ type: v.mimeType, src: mediaUrl(bucket, base, v.path) })),
    poster: poster ? mediaUrl(bucket, base, poster.path) : undefined,
    previewLoop: asset.previewLoop
      ? mediaUrl(bucket, base, asset.previewLoop.path)
      : undefined,
    aspectRatio: asset.intrinsic.aspectRatio,
    hasAudio: asset.intrinsic.hasAudio,
    loop: asset.intrinsic.isAnimated,
  }
}

/**
 * ¿Se puede servir este asset?
 *
 * El `alt` NO entra en la cuenta, y es una decisión del proyecto que se aparta
 * del R12 del contrato: exigirlo dejaba 45 fotos ya procesadas inservibles
 * hasta escribir 45 descripciones. Sigue siendo un campo recomendable; ya no
 * es una puerta.
 */
export function canPublish(asset: MediaAsset): boolean {
  return asset.status === 'ready' && !!asset.basePath
}
