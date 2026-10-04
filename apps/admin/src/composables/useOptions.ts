import { onMounted, ref, type Ref } from 'vue'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { getFirestoreDb, PRIMARY_LOCALE } from '@princess/content'
import type { FieldDescriptor } from '@/components/fields/tipos'

export interface Option {
  value: string
  label: string
}

/**
 * Resuelve las opciones de un `enum`.
 *
 * Tres orígenes posibles, y los tres existen en este proyecto:
 *   1. `constraints.options` — literales del esquema (la prioridad de un artículo).
 *   2. `source.collection` — otra colección (el rubro sale de `categories`).
 *   3. `source.document` + `source.path` — una lista DENTRO de un documento
 *      (las categorías del blog viven en `config/ui → blog.categories`).
 *
 * Se cachea a nivel de módulo: una pantalla con diez selects del mismo rubro no
 * debe hacer diez lecturas de Firestore.
 */
const cache = new Map<string, Option[]>()

function localized(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, string>
    return o[PRIMARY_LOCALE] ?? o.es ?? ''
  }
  return String(v ?? '')
}

export function useOptions(campo: FieldDescriptor): {
  options: Ref<Option[]>
  loading: Ref<boolean>
} {
  const literales = campo.constraints?.options
  const options = ref<Option[]>(
    Array.isArray(literales) ? literales.map((v) => ({ value: String(v), label: String(v) })) : [],
  )
  const loading = ref(false)

  const source = campo.source
  if (!source || Array.isArray(literales)) return { options, loading }

  const clave = `${source.collection}/${source.document ?? ''}/${source.path ?? ''}`

  onMounted(async () => {
    if (cache.has(clave)) {
      options.value = cache.get(clave)!
      return
    }
    loading.value = true
    try {
      const db = getFirestoreDb(import.meta.env)
      let resultado: Option[]

      if (source.document && source.path) {
        const snap = await getDoc(doc(db, source.collection, source.document))
        const lista = source.path
          .split('.')
          .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], snap.data())
        resultado = (Array.isArray(lista) ? lista : []).map((v) => {
          const label = localized(v)
          return { value: label, label }
        })
      } else {
        const snap = await getDocs(collection(db, source.collection))
        resultado = snap.docs.map((d) => ({
          value: source.value ? String(d.data()[source.value] ?? d.id) : d.id,
          label: localized(source.label ? d.data()[source.label] : d.id),
        }))
      }

      cache.set(clave, resultado)
      options.value = resultado
    } finally {
      loading.value = false
    }
  })

  return { options, loading }
}
