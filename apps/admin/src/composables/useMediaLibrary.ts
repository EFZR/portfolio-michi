import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@princess/content'
import type { MediaAsset, MediaKind } from '@princess/content/media'

/**
 * LA BIBLIOTECA DE MEDIOS.
 *
 * Singleton de módulo: el listado se carga una vez y lo comparten todos los
 * campos `media` del formulario. Si viviera dentro de la función, abrir una
 * ficha con tres campos de imagen haría tres lecturas de la colección.
 *
 * El recorrido completo de una subida son cuatro pasos y los cuatro importan:
 *
 *   1. elegir el archivo con el diálogo NATIVO — el pipeline recibe una ruta
 *      del sistema, y un `<input type="file">` no la expone
 *   2. `normalize_media` en Rust: ffprobe, escalera, poster, registro
 *   3. `upload_media` en Rust: los archivos a Storage
 *   4. el documento a Firestore, que es lo que la web va a leer en el build
 *
 * Si el 4 falla, los archivos quedan en Storage sin documento que los
 * referencie. Es recuperable —el `asset.json` se sube junto al medio— y es
 * mejor que lo contrario: un documento apuntando a archivos que no existen
 * daría imágenes rotas en la web publicada.
 */

export type EstadoBiblioteca = 'inactivo' | 'cargando' | 'listo' | 'error'
export type Paso = 'eligiendo' | 'procesando' | 'subiendo' | 'guardando'

export interface Progreso {
  paso: Paso
  /** Nombre del archivo en curso, para que la espera no sea una barra muda. */
  archivo: string
  /** 0-100, o -1 cuando no se puede saber (el procesado de ffmpeg no informa). */
  porcentaje: number
}

const assets = shallowRef<MediaAsset[]>([])
const estado = ref<EstadoBiblioteca>('inactivo')
const error = ref('')
const progreso = ref<Progreso | null>(null)

let cargaEnCurso: Promise<void> | null = null
let desuscribir: (() => void) | null = null

function enTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Quita del registro lo que no debe acabar en una colección de LECTURA
 * PÚBLICA.
 *
 * `source.storagePath` es la ruta absoluta del original en el disco de Karol
 * (`/home/karol/.local/share/...`). Publicarla no da acceso a nada, pero filtra
 * el nombre de usuario y la estructura de su equipo a cualquiera que lea la
 * colección. Se reemplaza por la ruta en Storage, que además es la útil: una
 * vez subido, el original vive ahí.
 *
 * `error.detail` lleva salida cruda de ffmpeg con rutas locales (R10). Un
 * asset en estado `ready` no lo trae, pero si alguna vez se guardara uno
 * fallido, no puede viajar.
 */
export function paraFirestore(asset: MediaAsset, basePath: string): MediaAsset {
  const original = asset.source.storagePath.split(/[\\/]/).pop() ?? ''
  const limpio: MediaAsset = {
    ...asset,
    basePath,
    source: { ...asset.source, storagePath: `${basePath}/${original}` },
  }
  if (limpio.error) {
    limpio.error = { code: limpio.error.code, message: limpio.error.message }
  }
  return limpio
}

export interface UseMediaLibraryReturn {
  assets: Readonly<Ref<MediaAsset[]>>
  estado: Readonly<Ref<EstadoBiblioteca>>
  error: Readonly<Ref<string>>
  progreso: Readonly<Ref<Progreso | null>>
  ocupado: ComputedRef<boolean>
  cargar: (forzar?: boolean) => Promise<void>
  porId: (id: string | undefined) => MediaAsset | undefined
  filtrar: (kind?: MediaKind, texto?: string) => MediaAsset[]
  importar: (opciones?: { kind?: MediaKind }) => Promise<MediaAsset | null>
}

export function useMediaLibrary(): UseMediaLibraryReturn {
  const db = () => getFirestoreDb(import.meta.env)

  async function cargar(forzar = false): Promise<void> {
    if (!forzar && estado.value === 'listo') return
    if (cargaEnCurso) return cargaEnCurso

    estado.value = 'cargando'
    error.value = ''
    cargaEnCurso = (async () => {
      try {
        const snap = await getDocs(collection(db(), 'media'))
        assets.value = snap.docs
          .map((d) => ({ ...(d.data() as MediaAsset), id: d.id }))
          // Lo último subido primero: es lo que se acaba de procesar y lo que
          // se va a querer elegir.
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        estado.value = 'listo'
      } catch (e) {
        estado.value = 'error'
        error.value = 'No se pudo cargar la biblioteca.'
        console.warn('[media]', e)
      } finally {
        cargaEnCurso = null
      }
    })()
    return cargaEnCurso
  }

  function porId(id: string | undefined): MediaAsset | undefined {
    if (!id) return undefined
    return assets.value.find((a) => a.id === id)
  }

  function filtrar(kind?: MediaKind, texto?: string): MediaAsset[] {
    const q = (texto ?? '').trim().toLowerCase()
    return assets.value.filter((a) => {
      if (kind && a.kind !== kind) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        a.slug.includes(q) ||
        (a.alt ?? '').toLowerCase().includes(q) ||
        (a.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
    })
  }

  /** Escucha el progreso que emite Rust durante la subida. */
  async function escuchar(): Promise<void> {
    if (desuscribir) return
    const { listen } = await import('@tauri-apps/api/event')
    desuscribir = await listen<{
      file: string
      bytesSent: number
      bytesTotal: number
    }>('media:upload', (e) => {
      const { file, bytesSent, bytesTotal } = e.payload
      progreso.value = {
        paso: 'subiendo',
        archivo: file,
        porcentaje: bytesTotal ? Math.round((bytesSent / bytesTotal) * 100) : -1,
      }
    })
  }

  async function importar(opciones: { kind?: MediaKind } = {}): Promise<MediaAsset | null> {
    if (!enTauri()) {
      error.value = 'Subir archivos solo funciona en la app de escritorio.'
      return null
    }

    error.value = ''
    progreso.value = { paso: 'eligiendo', archivo: '', porcentaje: -1 }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')

      const filtros =
        opciones.kind === 'video'
          ? [{ name: 'Vídeo', extensions: ['mp4', 'mov', 'webm', 'gif'] }]
          : opciones.kind === 'image'
            ? [{ name: 'Imagen', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff'] }]
            : [
                {
                  name: 'Imagen o vídeo',
                  extensions: [
                    'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff',
                    'mp4', 'mov', 'webm', 'gif',
                  ],
                },
              ]

      const ruta = await open({ multiple: false, directory: false, filters: filtros })
      if (typeof ruta !== 'string') {
        progreso.value = null
        return null
      }

      // El título sale del nombre del archivo. Es un punto de partida editable,
      // no una decisión: pedirlo ANTES de procesar añade un paso a ciegas
      // (todavía no se ve la foto) para algo que se corrige en dos segundos
      // después.
      const nombre = ruta.split(/[\\/]/).pop() ?? 'medio'
      const title = nombre.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()

      progreso.value = { paso: 'procesando', archivo: nombre, porcentaje: -1 }
      await escuchar()

      // Paso 2 — el pipeline. Tarda: 13 s para una foto de 2400 px, 20 s para
      // un clip de 6 s. El paso se muestra para que la espera tenga nombre.
      const asset = await invoke<MediaAsset>('normalize_media', {
        path: ruta,
        title,
        alt: null,
        posterAtSec: null,
      })

      // Paso 3 — a Storage.
      const auth = getFirebaseAuth(import.meta.env)
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('sin sesión')

      const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string
      const reporte = await invoke<{ basePath: string; failed: string[] }>('upload_media', {
        bucket,
        token,
        slug: asset.slug,
      })
      if (reporte.failed.length) {
        throw new Error(`no se subieron ${reporte.failed.length} archivo(s)`)
      }

      // Paso 4 — el documento, que es lo que la web lee en el build.
      progreso.value = { paso: 'guardando', archivo: nombre, porcentaje: 100 }
      const guardado = paraFirestore(asset, reporte.basePath)
      await setDoc(doc(db(), 'media', asset.id), guardado)

      // Al principio de la lista: es lo que se acaba de subir y lo que se va a
      // elegir ahora mismo.
      assets.value = [guardado, ...assets.value.filter((a) => a.id !== asset.id)]
      estado.value = 'listo'
      return guardado
    } catch (e) {
      // Los errores del pipeline llegan con el mensaje ya escrito para la
      // usuaria (R10); el resto se traduce acá.
      const m = e as { message?: string }
      error.value =
        typeof m?.message === 'string' && m.message.length < 200
          ? m.message
          : 'No se pudo preparar el archivo.'
      console.warn('[media]', e)
      return null
    } finally {
      progreso.value = null
    }
  }

  return {
    assets: assets as Readonly<Ref<MediaAsset[]>>,
    estado,
    error,
    progreso,
    ocupado: computed(() => progreso.value !== null),
    cargar,
    porId,
    filtrar,
    importar,
  }
}
