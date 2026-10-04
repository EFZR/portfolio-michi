import { ref, shallowRef, type Ref } from 'vue'
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, writeBatch } from 'firebase/firestore'
import { getFirestoreDb } from '@princess/content'

/**
 * CRUD de una colección de Firestore.
 *
 * Escribe con el SDK de cliente y la sesión de la administradora: las mismas
 * reglas que se aplican a la web se aplican aquí. Si algo se rechaza, se
 * rechazaría igual desde cualquier otro sitio — el panel no tiene un camino
 * privilegiado.
 */

export interface Fila extends Record<string, unknown> {
  id: string
}

export function useCollection(nombre: string, campoOrden?: string) {
  const filas = shallowRef<Fila[]>([])
  const cargando = ref(false)
  const error = ref('')

  const db = () => getFirestoreDb(import.meta.env)

  async function cargar(): Promise<void> {
    cargando.value = true
    error.value = ''
    try {
      const ref_ = collection(db(), nombre)
      const snap = await getDocs(campoOrden ? query(ref_, orderBy(campoOrden)) : ref_)
      filas.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    } catch (e) {
      error.value = mensaje(e)
    } finally {
      cargando.value = false
    }
  }

  /**
   * Guarda. El slug ES el id del documento, así que cambiarlo no es un update:
   * es crear uno nuevo y borrar el viejo. Se hace explícito porque rompe los
   * enlaces publicados y quien guarda tiene que enterarse.
   */
  async function guardar(id: string, datos: Record<string, unknown>, idAnterior?: string): Promise<void> {
    await setDoc(doc(db(), nombre, id), datos, { merge: false })
    if (idAnterior && idAnterior !== id) await deleteDoc(doc(db(), nombre, idAnterior))
    await cargar()
  }

  async function borrar(id: string): Promise<void> {
    await deleteDoc(doc(db(), nombre, id))
    await cargar()
  }

  /**
   * Reordena reescribiendo el campo de orden de TODAS las filas en un lote.
   * Renumerar entero en vez de intercambiar dos valores evita que el orden se
   * degrade con el uso (huecos, empates) hasta volverse impredecible.
   */
  async function reordenar(ids: readonly string[], campo = 'order'): Promise<void> {
    const batch = writeBatch(db())
    ids.forEach((id, i) => batch.update(doc(db(), nombre, id), { [campo]: i }))
    await batch.commit()
    await cargar()
  }

  return { filas: filas as Ref<Fila[]>, cargando, error, cargar, guardar, borrar, reordenar }
}

function mensaje(e: unknown): string {
  const code = (e as { code?: string }).code ?? String(e)
  if (code === 'permission-denied') return 'Firestore rechazó la lectura. ¿La sesión sigue abierta?'
  if (code === 'unavailable') return 'Sin conexión con Firestore.'
  return `No se pudo cargar (${code}).`
}
