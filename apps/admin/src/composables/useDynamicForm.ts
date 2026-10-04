import { computed, reactive, ref, shallowRef, type Ref } from 'vue'
import {
  buildGraph,
  compileFields,
  compileVisible,
  evaluateAffected,
  evaluateAll,
  type SchemaDoc,
  type VisibilityGraph,
} from '@princess/content'
import type { ZodType } from 'zod'

/**
 * ESTADO DE UN FORMULARIO DINÁMICO.
 *
 * Tres decisiones de rendimiento, que son las que separan un formulario de 105
 * campos fluido de uno que se arrastra:
 *
 *  1. VALIDACIÓN POR CAMPO. En cada pulsación se parsea SOLO el campo tocado.
 *     El objeto completo se valida al guardar. Con 105 campos, la diferencia es
 *     entre una validación por tecla y ciento cinco.
 *
 *  2. VISIBILIDAD INCREMENTAL. El grafo dice quién depende de quién; escribir
 *     en un campo sin dependientes cuesta cero reevaluaciones y devuelve el
 *     MISMO Map, así que Vue no invalida nada.
 *
 *  3. `shallowRef` PARA LA VISIBILIDAD. Se reemplaza entera, nunca se muta por
 *     dentro, así que la reactividad profunda sería puro coste.
 *
 * El contador de caracteres NO vive aquí: es `length` contra un número y tiene
 * que ir pegado a la tecla. Lo que conviene aplazar es la validación, no el
 * contador — confundirlos da un contador que va a rastras.
 */

export interface DynamicForm {
  data: Record<string, unknown>
  errors: Record<string, string>
  touched: Record<string, boolean>
  visible: Ref<Map<string, boolean>>
  isVisible: (key: string) => boolean
  dirty: Ref<boolean>
  change: (key: string, value: unknown) => void
  blur: (key: string) => void
  validateAll: () => boolean
  payload: () => Record<string, unknown>
  reset: (values?: Record<string, unknown>) => void
}

export function useDynamicForm(doc: SchemaDoc, initial: Record<string, unknown> = {}): DynamicForm {
  const fields = doc.fields as unknown as { key: string; visible?: never }[]

  // Se construyen UNA vez por esquema. `buildGraph` lanza si hay un ciclo de
  // visibilidad; que reviente aquí es correcto — un esquema con un ciclo no
  // puede renderizarse de ninguna forma sensata.
  const graph: VisibilityGraph = buildGraph(fields)
  const perField = compileFields(doc)

  const data = reactive<Record<string, unknown>>({ ...initial })
  const errors = reactive<Record<string, string>>({})
  const touched = reactive<Record<string, boolean>>({})
  const visible = shallowRef(evaluateAll(graph, data))
  const dirty = ref(false)

  const isVisible = (key: string) => visible.value.get(key) !== false

  function validateField(key: string): void {
    const schema: ZodType | undefined = perField.get(key)
    if (!schema) return
    const r = schema.safeParse(data[key])
    errors[key] = r.success ? '' : (r.error.issues[0]?.message ?? 'Valor no válido.')
  }

  function change(key: string, value: unknown): void {
    data[key] = value
    touched[key] = true
    dirty.value = true
    visible.value = evaluateAffected(graph, data, key, visible.value)

    // Solo se muestra error en un campo ya tocado: escribir la primera letra de
    // un campo obligatorio no debería pintarlo en rojo por estar incompleto.
    if (touched[key]) validateField(key)
  }

  /** Las reglas cruzadas corren al salir del campo, no en cada tecla. */
  function blur(key: string): void {
    touched[key] = true
    validateField(key)
    runRules()
  }

  function runRules(): void {
    const r = compileVisible(doc, visible.value).safeParse(data)
    // Se limpian solo los errores de regla; los de campo los gobierna validateField.
    for (const rule of doc.rules as { anchor?: string }[]) {
      if (rule.anchor) errors[rule.anchor] = ''
    }
    if (r.success) return
    for (const issue of r.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errors[key]) errors[key] = issue.message
    }
  }

  function validateAll(): boolean {
    for (const f of fields) touched[f.key] = true
    const r = compileVisible(doc, visible.value).safeParse(data)
    for (const f of fields) errors[f.key] = ''
    if (r.success) return true
    for (const issue of r.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errors[key]) errors[key] = issue.message
    }
    return false
  }

  /** Lo oculto no se guarda: se omite, no se escribe como cadena vacía. */
  function payload(): Record<string, unknown> {
    return Object.fromEntries(Object.entries(data).filter(([k]) => isVisible(k)))
  }

  function reset(values: Record<string, unknown> = initial): void {
    for (const key of Object.keys(data)) delete data[key]
    Object.assign(data, values)
    for (const key of Object.keys(errors)) delete errors[key]
    for (const key of Object.keys(touched)) delete touched[key]
    visible.value = evaluateAll(graph, data)
    dirty.value = false
  }

  return {
    data,
    errors,
    touched,
    visible: computed(() => visible.value) as Ref<Map<string, boolean>>,
    isVisible,
    dirty,
    change,
    blur,
    validateAll,
    payload,
    reset,
  }
}
