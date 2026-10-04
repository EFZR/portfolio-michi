import { ref, shallowRef, type Ref } from 'vue'
import { doc, getDoc } from 'firebase/firestore'
import { getFirestoreDb, metaSchema, type SchemaDoc } from '@princess/content'

/**
 * CARGA DE ESQUEMAS — capas ① y ② de la arquitectura.
 *
 * El espejo bundleado no es una optimización: es lo que hace que el panel
 * ARRANQUE sin red. Una app de escritorio que muestra una pantalla en blanco
 * porque el wifi va mal es una app rota.
 *
 * Dirección de la verdad: manda FIRESTORE. El espejo es una copia que se baja
 * con `npm run schemas:pull`. Que esté atrasado es lo normal.
 */
const ESPEJO = import.meta.glob('../../../../packages/content/src/schemas/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>

const PorId = Object.fromEntries(
  Object.entries(ESPEJO).map(([ruta, mod]) => [
    ruta.split('/').pop()!.replace('.json', ''),
    mod.default,
  ]),
)

export const SCHEMA_IDS = Object.keys(PorId).sort()

const cache = new Map<string, SchemaDoc>()

export type Fuente = 'remoto' | 'espejo'

export function useSchema(): {
  cargar: (id: string) => Promise<SchemaDoc | null>
  fuente: Ref<Fuente>
  error: Ref<string>
  cargando: Ref<boolean>
} {
  const fuente = ref<Fuente>('remoto')
  const error = ref('')
  const cargando = ref(false)
  const actual = shallowRef<SchemaDoc | null>(null)

  async function cargar(id: string): Promise<SchemaDoc | null> {
    if (cache.has(id)) {
      actual.value = cache.get(id)!
      return actual.value
    }

    cargando.value = true
    error.value = ''
    let crudo: unknown = null

    try {
      const snap = await getDoc(doc(getFirestoreDb(import.meta.env), 'schemas', id))
      if (snap.exists()) {
        crudo = snap.data()
        fuente.value = 'remoto'
      }
    } catch {
      // Sin red: se cae al espejo. No es un error del que haya que avisar a
      // gritos — el panel funciona igual, solo con esquemas de la última
      // sincronización.
    }

    if (!crudo) {
      crudo = PorId[id]
      fuente.value = 'espejo'
    }

    // Se valida SIEMPRE, venga de donde venga. Un esquema a medias produce un
    // formulario a medias, que es peor que no pintar nada porque parece que
    // funciona.
    const parsed = metaSchema.safeParse(crudo)
    if (!parsed.success) {
      // Si lo remoto no vale, se reintenta con el espejo antes de rendirse.
      const respaldo = metaSchema.safeParse(PorId[id])
      if (respaldo.success) {
        fuente.value = 'espejo'
        cache.set(id, respaldo.data)
        actual.value = respaldo.data
        cargando.value = false
        return actual.value
      }
      error.value = `El esquema "${id}" no es válido: ${parsed.error.issues[0]?.message ?? ''}`
      cargando.value = false
      return null
    }

    cache.set(id, parsed.data)
    actual.value = parsed.data
    cargando.value = false
    return parsed.data
  }

  return { cargar, fuente, error, cargando }
}
