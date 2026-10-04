import { ref, type Ref } from 'vue'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { getFirebaseStorage } from '@princess/content'

/**
 * SUBIDA DE IMÁGENES A FIREBASE STORAGE.
 *
 * Tres cosas pasan antes de que un byte salga a la red, y las tres existen por
 * un motivo distinto:
 *
 *  1. SE COMPRUEBA LA PROPORCIÓN. El 4:5 de las fichas y el 16:9 de las portadas
 *     SON la retícula. `object-cover` evita que una imagen cuadrada rompa el
 *     layout, pero le recorta la cabeza al retrato — y ese es justo el error que
 *     un panel debe atrapar en vez de propagar a treinta fichas.
 *
 *  2. SE CONVIERTE A WEBP. Un JPEG de cámara pesa 4-8 MB; el mismo encuadre en
 *     WebP al 82% ronda los 200 KB. Se hace en el propio webview con un
 *     `<canvas>`: sin servicio externo, sin esperar a nadie.
 *
 *  3. SE COMPRUEBA EL TAMAÑO FINAL. Las reglas rechazan por encima de 5 MB, y
 *     un rechazo del servidor llega como `storage/unauthorized`, que no le dice
 *     nada a quien está subiendo una foto.
 */

export interface AspectRatio {
  width: number
  height: number
  tolerance?: number
}

export interface UploadResult {
  url: string
  /** Ruta dentro del bucket. Útil para borrar después. */
  path: string
}

const MAX_BYTES = 5 * 1024 * 1024
/** Tope de lado largo. Más allá no se nota en pantalla y sí en la descarga. */
const MAX_LADO = 2000

export function useUpload() {
  const subiendo = ref(false)
  const progreso = ref('')
  const error = ref('')

  async function medir(file: File): Promise<{ bitmap: ImageBitmap; w: number; h: number }> {
    const bitmap = await createImageBitmap(file)
    return { bitmap, w: bitmap.width, h: bitmap.height }
  }

  function comprobarProporcion(w: number, h: number, ar?: AspectRatio): string {
    if (!ar) return ''
    const esperada = ar.width / ar.height
    const real = w / h
    const tolerancia = ar.tolerance ?? 0.03
    if (Math.abs(real - esperada) / esperada <= tolerancia) return ''
    return (
      `La imagen es ${w}×${h} (${real.toFixed(2)}:1) y se espera ` +
      `${ar.width}:${ar.height} (${esperada.toFixed(2)}:1). Recórtala antes de subirla: ` +
      `si no, el encuadre se corta solo y casi siempre por donde no toca.`
    )
  }

  /** JPEG/PNG/lo que sea → WebP, reescalado si hace falta. */
  async function aWebp(bitmap: ImageBitmap): Promise<Blob> {
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h)

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('El navegador no pudo convertir la imagen.'))),
        'image/webp',
        0.82,
      )
    })
  }

  /**
   * @param destino plantilla de ruta, p. ej. `projects/{slug}/principal.webp`
   * @param valores lo que sustituye a los `{marcadores}` de la plantilla
   */
  async function subir(
    file: File,
    destino: string,
    valores: Record<string, string> = {},
    aspectRatio?: AspectRatio,
  ): Promise<UploadResult | null> {
    subiendo.value = true
    error.value = ''
    progreso.value = 'Leyendo…'

    try {
      const { bitmap, w, h } = await medir(file)

      const aviso = comprobarProporcion(w, h, aspectRatio)
      if (aviso) {
        error.value = aviso
        return null
      }

      progreso.value = 'Convirtiendo a WebP…'
      const blob = await aWebp(bitmap)
      bitmap.close()

      if (blob.size > MAX_BYTES) {
        error.value = `Aun convertida pesa ${(blob.size / 1024 / 1024).toFixed(1)} MB y el tope son 5 MB.`
        return null
      }

      // Nombre con marca de tiempo: subir una foto nueva NO pisa la anterior, y
      // así un artículo ya publicado no cambia de imagen por detrás mientras se
      // edita otro. Lo viejo se queda y se limpia aparte.
      const ruta =
        destino.replace(/\{(\w+)\}/g, (m, k: string) => valores[k] ?? m).replace(/\.\w+$/, '') +
        `-${Date.now()}.webp`

      progreso.value = `Subiendo ${(blob.size / 1024).toFixed(0)} KB…`
      const r = storageRef(getFirebaseStorage(import.meta.env), ruta)
      await uploadBytes(r, blob, { contentType: 'image/webp' })

      return { url: await getDownloadURL(r), path: ruta }
    } catch (e) {
      const code = (e as { code?: string }).code ?? String(e)
      error.value =
        code === 'storage/unauthorized'
          ? 'Storage rechazó la subida. ¿La sesión sigue abierta?'
          : `No se pudo subir (${code}).`
      return null
    } finally {
      subiendo.value = false
      progreso.value = ''
    }
  }

  return { subir, subiendo: subiendo as Ref<boolean>, progreso, error }
}
