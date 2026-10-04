/**
 * Tests de las URLs y del `<picture>` a partir de un registro de medio.
 *
 * Son funciones puras, que es justo donde se esconden los errores silenciosos:
 * un srcset vacío o una URL mal codificada no lanzan nada — simplemente no se
 * ve la imagen.
 */
import { describe, expect, it } from 'vitest'
import {
  canPublish,
  fallbackRendition,
  mediaUrl,
  pictureOf,
  srcsetFor,
  videoOf,
  type ImageFormat,
  type ImageRendition,
  type MediaAsset,
} from './src/media'

const BUCKET = 'michi-portfolio.firebasestorage.app'

function rendition(format: ImageFormat, width: number, hasAlpha = false): ImageRendition {
  const height = Math.round(width * 1.25)
  return {
    format,
    width,
    height,
    bytes: width * 20,
    path: `foto-${width}.${format === 'jpeg' ? 'jpg' : format}`,
    mimeType: `image/${format}`,
    hasAlpha,
  }
}

/** Un asset como el que produce el pipeline: 3 anchos x 3 formatos. */
function imagen(over: Partial<MediaAsset> = {}): MediaAsset {
  const anchos = [320, 640, 960]
  return {
    id: 'a3019c0e70e8a473',
    slug: 'sesion-en-estudio',
    kind: 'image',
    title: 'Sesión en estudio',
    alt: 'Retrato a contraluz',
    basePath: 'media/a3019c0e70e8a473',
    source: {
      filename: 'servicio-fotografia.jpg',
      bytes: 169297,
      sha256: 'a3019c0e'.repeat(8),
      mimeType: 'image/jpeg',
      storagePath: '/tmp/x',
      container: 'image2',
      probedAt: '2026-10-04T07:35:44.926Z',
    },
    intrinsic: {
      width: 1200,
      height: 1500,
      aspectRatio: 0.8,
      orientation: 'portrait',
      hasAudio: false,
      isAnimated: false,
    },
    colour: {
      dominant: '#AAA19E',
      placeholder: 'data:image/webp;base64,UklGRq4=',
      sourceColourSpace: 'sin declarar',
      isHdrSource: false,
    },
    renditions: {
      images: anchos.flatMap((w) => [
        rendition('avif', w),
        rendition('webp', w),
        rendition('jpeg', w),
      ]),
      videos: [],
    },
    pipeline: {
      version: '1.0.0',
      ffmpegVersion: 'n9.0.1',
      encodedAt: '2026-10-04T07:35:44.926Z',
      durationMs: 4200,
      decisions: [],
      warnings: [],
    },
    status: 'ready',
    publishedAt: null,
    createdAt: '2026-10-04T07:35:44.926Z',
    updatedAt: '2026-10-04T07:35:44.926Z',
    ...over,
  }
}

describe('mediaUrl', () => {
  it('codifica la barra como %2F', () => {
    // En esta API el nombre del objeto es UN segmento de URL. Con la barra
    // cruda el servidor busca otro recurso y responde 404. `encodeURI` NO la
    // codifica — es el error fácil; `encodeURIComponent` sí.
    const u = mediaUrl(BUCKET, 'media/abc', 'foto-320.avif')
    expect(u).toContain('media%2Fabc%2Ffoto-320.avif')
    expect(u).not.toContain('media/abc/foto')
  })

  it('va contra firebasestorage y no contra storage.googleapis', () => {
    // La forma «limpia» de GCS exige un ACL público a nivel de Cloud Storage,
    // y las reglas de Firebase no otorgan ACLs de GCS: daría 403.
    const u = mediaUrl(BUCKET, 'media/abc', 'x.jpg')
    expect(u.startsWith('https://firebasestorage.googleapis.com/v0/b/')).toBe(true)
    // Anclado al principio a propósito: `firebastorage.googleapis.com`
    // CONTIENE la subcadena `storage.googleapis.com`, así que un `toContain`
    // negado falla siempre. Lo descubrí con este test en rojo.
    expect(u.startsWith('https://storage.googleapis.com/')).toBe(false)
  })

  it('pide el contenido, no los metadatos', () => {
    // Sin `alt=media` la API devuelve el JSON de metadatos del objeto, que en
    // un `<img src>` se ve como una imagen rota.
    expect(mediaUrl(BUCKET, 'media/abc', 'x.jpg').endsWith('?alt=media')).toBe(true)
  })
})

describe('srcsetFor', () => {
  it('ordena de menor a mayor con el descriptor w', () => {
    const s = srcsetFor(imagen(), BUCKET, 'avif')
    expect(s.split(', ').map((p) => p.split(' ')[1])).toEqual(['320w', '640w', '960w'])
  })

  it('un formato que no existe da cadena vacía, no una lista roto', () => {
    // El caso real: una imagen con transparencia no tiene AVIF porque el
    // encoder de ffmpeg pierde el canal alfa.
    expect(srcsetFor(imagen(), BUCKET, 'png')).toBe('')
  })

  it('sin basePath no se inventan URLs', () => {
    // El asset existe pero todavía no se subió a Storage.
    expect(srcsetFor(imagen({ basePath: undefined }), BUCKET, 'avif')).toBe('')
  })
})

describe('fallbackRendition — invariante 6', () => {
  it('sin transparencia el respaldo es el JPEG más grande', () => {
    const r = fallbackRendition(imagen())
    expect(r?.format).toBe('jpeg')
    expect(r?.width).toBe(960)
  })

  it('con transparencia el respaldo es PNG, nunca JPEG', () => {
    // Un JPEG con transparencia la pierde en silencio y aparece fondo negro.
    const a = imagen({
      renditions: {
        images: [320, 640].flatMap((w) => [rendition('webp', w, true), rendition('png', w, true)]),
        videos: [],
      },
    })
    const r = fallbackRendition(a)
    expect(r?.format).toBe('png')
    expect(r?.width).toBe(640)
  })
})

describe('pictureOf', () => {
  it('lista avif y webp como sources y deja el jpeg en el img', () => {
    const p = pictureOf(imagen(), BUCKET)!
    expect(p.sources.map((s) => s.type)).toEqual(['image/avif', 'image/webp'])
    expect(p.src).toContain('foto-960.jpg')
  })

  it('arrastra el aspect-ratio, que es lo que evita el salto de layout', () => {
    const p = pictureOf(imagen(), BUCKET)!
    expect(p.aspectRatio).toBe(0.8)
    expect(p.placeholder).toContain('data:image/webp')
    expect(p.dominant).toBe('#AAA19E')
  })

  it('con transparencia no ofrece AVIF', () => {
    const a = imagen({
      renditions: {
        images: [320, 640].flatMap((w) => [rendition('webp', w, true), rendition('png', w, true)]),
        videos: [],
      },
    })
    const p = pictureOf(a, BUCKET)!
    expect(p.sources.map((s) => s.type)).toEqual(['image/webp'])
    expect(p.src).toContain('.png')
  })

  it('sin subir todavía devuelve null en vez de un picture roto', () => {
    expect(pictureOf(imagen({ basePath: undefined }), BUCKET)).toBeNull()
  })

  it('sin ninguna rendition de respaldo devuelve null', () => {
    const a = imagen({
      renditions: { images: [rendition('avif', 320), rendition('webp', 320)], videos: [] },
    })
    expect(pictureOf(a, BUCKET)).toBeNull()
  })

  it('un alt ausente no se convierte en la cadena "undefined"', () => {
    const p = pictureOf(imagen({ alt: undefined }), BUCKET)!
    expect(p.alt).toBe('')
  })
})

describe('videoOf', () => {
  const video = (over: Partial<MediaAsset> = {}): MediaAsset =>
    imagen({
      kind: 'video',
      intrinsic: { ...imagen().intrinsic, aspectRatio: 1.778, hasAudio: true, isAnimated: false },
      renditions: {
        images: [],
        videos: [
          {
            format: 'mp4',
            codec: 'h264',
            width: 854,
            height: 480,
            bytes: 500_000,
            path: 'clip-480.mp4',
            mimeType: 'video/mp4',
            hasAudio: true,
            isFallback: true,
          },
          {
            format: 'mp4',
            codec: 'h264',
            width: 1280,
            height: 720,
            bytes: 2_400_000,
            path: 'clip-720.mp4',
            mimeType: 'video/mp4',
            hasAudio: true,
            isFallback: true,
          },
        ],
      },
      poster: {
        width: 1280,
        height: 720,
        atSec: 3.28,
        pickedBy: 'auto',
        formats: [320, 640].flatMap((w) => [rendition('avif', w), rendition('jpeg', w)]),
      },
      previewLoop: {
        path: 'clip-preview.mp4',
        bytes: 123_000,
        durationSec: 3,
        startSec: 3.28,
        format: 'mp4',
      },
      ...over,
    })

  it('dentro del mismo formato pone la mayor altura primero', () => {
    // El navegador toma la PRIMERA fuente que puede reproducir, así que el
    // orden es la calidad que va a servir.
    const v = videoOf(video(), BUCKET)!
    expect(v.sources.map((s) => s.src.includes('720') ? 720 : 480)).toEqual([720, 480])
  })

  it('el poster sale del jpeg más grande', () => {
    const v = videoOf(video(), BUCKET)!
    expect(v.poster).toContain('foto-640.jpg')
    expect(v.previewLoop).toContain('clip-preview.mp4')
  })

  it('un GIF convertido se marca como loop', () => {
    const v = videoOf(
      video({ intrinsic: { ...video().intrinsic, isAnimated: true, hasAudio: false } }),
      BUCKET,
    )!
    expect(v.loop).toBe(true)
    expect(v.hasAudio).toBe(false)
  })

  it('sin la rendition de respaldo devuelve null', () => {
    // Sin el h264/mp4 habría navegadores que no reproducen nada.
    const a = video()
    a.renditions.videos = a.renditions.videos.map((v) => ({ ...v, isFallback: false }))
    expect(videoOf(a, BUCKET)).toBeNull()
  })

  it('una imagen no se trata como vídeo', () => {
    expect(videoOf(imagen(), BUCKET)).toBeNull()
  })
})

describe('canPublish — R12', () => {
  it('un alt ausente bloquea la publicación', () => {
    expect(canPublish(imagen({ alt: undefined }))).toBe(false)
  })

  it('un alt vacío NO la bloquea: es "decorativa", declarado a propósito', () => {
    expect(canPublish(imagen({ alt: '' }))).toBe(true)
  })

  it('sin subir a Storage no se publica aunque tenga alt', () => {
    expect(canPublish(imagen({ basePath: undefined }))).toBe(false)
  })

  it('un asset fallido no se publica', () => {
    expect(canPublish(imagen({ status: 'failed' }))).toBe(false)
  })
})
