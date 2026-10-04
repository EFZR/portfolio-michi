/**
 * EVALUADOR DE CONDICIONES Y GRAFO DE DEPENDENCIAS.
 *
 * Trece operadores y tres combinadores. CERRADOS: no hay forma de meter una
 * expresión arbitraria en un esquema.
 *
 * Por qué importa que sea cerrado: un `visible: "datos.x > 3 && …"` resuelto con
 * `eval` o `new Function` convertiría la base de datos en superficie de
 * ejecución de código, rompería la CSP que el panel necesita igualmente para
 * hablar con Firestore, y haría indepurable cualquier error. Con un conjunto
 * cerrado, TypeScript comprueba el `switch` de forma exhaustiva: si se añade un
 * operador al meta-esquema y no aquí, `vue-tsc` falla.
 */

import type { Condition, Operator } from '../meta/types'

type Row = Record<string, unknown>

/**
 * Los campos localizados son `{ es, en }`. Para comparar hay que quedarse con
 * algo: se usa el primario, que es el único siempre presente. Comparar contra
 * el inglés cuando puede estar vacío daría condiciones que cambian de resultado
 * según cuánto se haya traducido, que es justo lo que nadie espera.
 */
function scalar(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if ('es' in o || 'en' in o) return o.es ?? ''
  }
  return value
}

function isEmpty(value: unknown): boolean {
  const v = scalar(value)
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

function length(value: unknown): number {
  const v = scalar(value)
  if (typeof v === 'string') return v.length
  if (Array.isArray(v)) return v.length
  return 0
}

export function evaluate(condition: Condition, row: Row): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluate(c, row))
  if ('any' in condition) return condition.any.some((c) => evaluate(c, row))
  if ('not' in condition) return !evaluate(condition.not, row)

  const raw = row[condition.field]
  const v = scalar(raw)
  const target = condition.value
  const op: Operator = condition.op

  switch (op) {
    case 'eq':
      return v === target
    case 'ne':
      return v !== target
    case 'in':
      return Array.isArray(target) && target.includes(v)
    case 'notIn':
      return Array.isArray(target) && !target.includes(v)
    case 'gt':
      return Number(v) > Number(target)
    case 'gte':
      return Number(v) >= Number(target)
    case 'lt':
      return Number(v) < Number(target)
    case 'lte':
      return Number(v) <= Number(target)
    case 'empty':
      return isEmpty(raw)
    case 'notEmpty':
      return !isEmpty(raw)
    case 'lengthGt':
      return length(raw) > Number(target)
    case 'lengthLt':
      return length(raw) < Number(target)
    case 'matches':
      return new RegExp(String(target)).test(String(v ?? ''))
  }
}

/** Claves que una condición consulta. Alimenta el grafo de dependencias. */
export function conditionKeys(condition: Condition, into = new Set<string>()): Set<string> {
  if ('all' in condition) condition.all.forEach((c) => conditionKeys(c, into))
  else if ('any' in condition) condition.any.forEach((c) => conditionKeys(c, into))
  else if ('not' in condition) conditionKeys(condition.not, into)
  else into.add(condition.field)
  return into
}

export class SchemaCycleError extends Error {
  constructor(path: string[]) {
    super(
      `Ciclo de visibilidad: ${path.join(' → ')}. ` +
        `Ninguno de esos campos podría decidir si se muestra.`,
    )
    this.name = 'SchemaCycleError'
  }
}

export interface VisibilityGraph {
  /** clave → claves cuya visibilidad depende de ella. */
  dependents: Map<string, string[]>
  /** clave → su condición, si tiene. */
  conditions: Map<string, Condition>
}

/**
 * Construye el grafo UNA vez, al compilar.
 *
 * Sin esto, cada pulsación reevaluaría la visibilidad de los 105 campos y
 * obligaría a Vue a comparar 105 booleanos. Con él, escribir en un campo del
 * que no depende nadie cuesta CERO reevaluaciones.
 *
 * Los ciclos se detectan aquí, en el build de los esquemas, no en el panel: un
 * esquema con un ciclo no llega a publicarse.
 */
export function buildGraph(fields: { key: string; visible?: Condition }[]): VisibilityGraph {
  const dependents = new Map<string, string[]>()
  const conditions = new Map<string, Condition>()

  for (const field of fields) {
    if (!field.visible) continue
    conditions.set(field.key, field.visible)
    for (const dep of conditionKeys(field.visible)) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), field.key])
    }
  }

  // Detección de ciclos sobre el grafo "depende de".
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (key: string, path: string[]) => {
    if (state.get(key) === 'done') return
    if (state.get(key) === 'visiting') throw new SchemaCycleError([...path, key])
    state.set(key, 'visiting')
    for (const dep of conditions.has(key) ? conditionKeys(conditions.get(key)!) : []) {
      visit(dep, [...path, key])
    }
    state.set(key, 'done')
  }
  for (const key of conditions.keys()) visit(key, [])

  return { dependents, conditions }
}

/** Visibilidad de todos los campos con condición. Los demás son visibles. */
export function evaluateAll(graph: VisibilityGraph, row: Row): Map<string, boolean> {
  const out = new Map<string, boolean>()
  for (const [key, condition] of graph.conditions) out.set(key, evaluate(condition, row))
  return out
}

/** Reevalúa solo lo que depende de `changedKey`. */
export function evaluateAffected(
  graph: VisibilityGraph,
  row: Row,
  changedKey: string,
  previous: Map<string, boolean>,
): Map<string, boolean> {
  const affected = graph.dependents.get(changedKey)
  if (!affected?.length) return previous

  const next = new Map(previous)
  for (const key of affected) {
    const condition = graph.conditions.get(key)
    if (condition) next.set(key, evaluate(condition, row))
  }
  return next
}
