/**
 * COMPILADOR: esquema JSON → validador de Zod.
 *
 * Función pura. En el panel se memoiza por `id@version` (compilar 105 campos
 * cuesta y solo cambia al publicar); aquí se deja sin caché a propósito, para
 * que los tests compilen siempre desde cero.
 *
 * ALCANCE DE ESTA VERSIÓN: tipos, restricciones y reglas de colección. La
 * visibilidad condicional y el evaluador de operadores entran en el paso 6b,
 * cuando exista el renderizador que los necesita — hoy ningún esquema declara
 * una sola condición.
 */

import { z } from 'zod'
import type { SchemaDoc } from '../meta/metaSchema'

type Field = Record<string, unknown>
const asFields = (v: unknown) => (v ?? []) as Field[]
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

/**
 * Un campo localizado es `{ es, en }`: el primario obligatorio y el otro
 * opcional y admitiendo vacío. Si `en` fuese obligatorio no se podría guardar
 * nada hasta haberlo traducido todo.
 *
 * El tope se aplica a CADA idioma por separado, que es lo correcto: el arco
 * tiene que caber en español y en inglés, no entre los dos.
 */
function localize(base: z.ZodString, required: boolean): z.ZodTypeAny {
  const primary = required ? base : base.optional()
  // `en` reutiliza el mismo tope pero admite cadena vacía.
  const secondary = base.or(z.literal('')).optional()
  return z.object({ es: primary, en: secondary })
}

function compileText(f: Field): z.ZodString {
  const c = (f.constraints ?? {}) as Record<string, unknown>
  let s = z.string().trim()

  const min = num(c.minLength)
  const max = num(c.maxLength)
  if (min != null && min > 0) s = s.min(min, 'No puede quedar vacío.')
  if (max != null) {
    const ayuda = typeof f.help === 'string' ? ` — ${f.help}` : ''
    s = s.max(max, `Máximo ${max} caracteres${ayuda}`)
  }
  if (typeof c.pattern === 'string') s = s.regex(new RegExp(c.pattern), 'Formato no válido.')
  if (c.format === 'email') s = s.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Ese correo no está completo.')
  if (c.format === 'url') s = s.regex(/^https?:\/\/\S+$/, 'Tiene que ser una URL completa.')
  return s
}

export function compileField(f: Field): z.ZodTypeAny {
  const c = (f.constraints ?? {}) as Record<string, unknown>
  const required = f.required !== false
  let out: z.ZodTypeAny

  switch (f.type) {
    case 'text': {
      const base = compileText(f)
      out = f.localized === true ? localize(base, required) : base
      break
    }

    case 'integer': {
      let n = z.int()
      const lo = num(c.min)
      const hi = num(c.max)
      const mult = num(c.multipleOf)
      if (lo != null) n = n.min(lo)
      if (hi != null) n = n.max(hi)
      out = mult != null ? n.refine((v) => v % mult === 0, `Tiene que ser múltiplo de ${mult}.`) : n
      break
    }

    case 'boolean':
      out = z.boolean()
      break

    case 'enum':
      // Con `options` literales el enum se cierra. Con `source`, los valores
      // salen de otra colección y no se conocen al compilar: se deja pasar
      // cualquier cadena y lo comprueba el panel contra el contexto (paso 6b).
      out = Array.isArray(c.options)
        ? z.enum(c.options as [string, ...string[]])
        : z.string().min(1)
      break

    case 'date':
      out = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD.')
      break

    case 'image':
      // La proporción y el peso NO se validan aquí: se comprueban al subir,
      // sobre el File, antes de que exista una URL. Aquí solo queda la ruta.
      out = z.union([z.url(), z.string().regex(/^\/[\w\-./]+$/)])
      break

    case 'tuple':
      out = z.tuple(
        asFields(f.elements).map(compileField) as [z.ZodTypeAny, ...z.ZodTypeAny[]],
      )
      break

    case 'list': {
      let a = z.array(compileField(f.element as Field))
      const lo = num(c.minItems)
      const hi = num(c.maxItems)
      if (lo != null) a = a.min(lo)
      if (hi != null) a = a.max(hi)
      out = a
      break
    }

    case 'group':
      out = z.object(
        Object.fromEntries(asFields(f.fields).map((h) => [h.key as string, compileField(h)])),
      )
      break

    case 'custom':
      // El widget trae su propio validador. Si no está registrado, el campo
      // pasa sin validar Y el renderizador avisa — nunca al revés: un esquema
      // estricto sobre un widget que no existe bloquearía el guardado de TODO
      // el formulario por un campo que nadie puede editar.
      out = z.unknown()
      break

    default:
      out = z.unknown()
  }

  return required ? out : out.optional()
}

/** Reglas que dependen de varios campos o de la colección entera. */
function applyRules(shape: z.ZodObject, doc: SchemaDoc): z.ZodTypeAny {
  const rules = doc.rules as Record<string, unknown>[]
  if (!rules.length) return shape

  return shape.superRefine((data, ctx) => {
    const row = data as Record<string, unknown>

    for (const rule of rules) {
      switch (rule.type) {
        case 'combinedLength': {
          // Se comprueba POR IDIOMA: el arco tiene que caber en español y en
          // inglés por separado, no sumando los dos.
          const fields = (rule.fields ?? []) as string[]
          const sep = (rule.separator as string) ?? ''
          const max = rule.max as number
          for (const locale of ['es', 'en'] as const) {
            const joined = fields
              .map((k) => {
                const v = row[k]
                return typeof v === 'string' ? v : ((v as Record<string, string>)?.[locale] ?? '')
              })
              .join(sep)
            if (joined.trim() && joined.length > max) {
              ctx.addIssue({
                code: 'custom',
                path: [rule.anchor as string, locale],
                message: `${rule.message} (${locale}: ${joined.length})`,
              })
            }
          }
          break
        }

        case 'sumMax': {
          const key = (rule.fields as string[])[0]
          const path = rule.path as string | undefined
          const items = (row[key] ?? []) as Record<string, unknown>[]
          for (const locale of ['es', 'en'] as const) {
            const total = items.reduce((n, item) => {
              const v = path ? item[path] : item
              const text =
                typeof v === 'string' ? v : ((v as Record<string, string>)?.[locale] ?? '')
              return n + text.length
            }, 0)
            if (total > (rule.max as number)) {
              ctx.addIssue({ code: 'custom', path: [rule.anchor as string], message: rule.message as string })
            }
          }
          break
        }

        // `uniqueInCollection` no se puede comprobar con un documento suelto:
        // vive en `validateCollection`, que ve todos los hermanos.
        default:
          break
      }
    }
  })
}

/**
 * Validador POR CAMPO. Es lo que permite validar una pulsación sin parsear el
 * objeto entero: con 105 campos, hacerlo completo en cada tecla es la
 * diferencia entre 1 validación y 105.
 */
export function compileFields(doc: SchemaDoc): Map<string, z.ZodTypeAny> {
  return new Map(
    (doc.fields as unknown as Field[]).map((f) => [f.key as string, compileField(f)]),
  )
}

/**
 * Esquema estrechado a lo que está VISIBLE.
 *
 * Un campo oculto por una condición no puede ser obligatorio: quien pulsa
 * Guardar vería el botón no responder por un campo que nadie puede rellenar.
 * Se vuelve opcional en vez de desaparecer, para no romper a quien consuma el
 * tipo. Las reglas cruzadas que tocan un campo oculto tampoco corren.
 */
export function compileVisible(doc: SchemaDoc, visible: Map<string, boolean>): z.ZodTypeAny {
  const shape = Object.fromEntries(
    (doc.fields as unknown as Field[]).map((f) => {
      const key = f.key as string
      const compiled = compileField(f)
      return [key, visible.get(key) === false ? compiled.optional() : compiled]
    }),
  )
  const activas = (doc.rules as Record<string, unknown>[]).filter((rule) =>
    ((rule.fields ?? []) as string[]).every((k) => visible.get(k) !== false),
  )
  return applyRules(z.object(shape), { ...doc, rules: activas } as SchemaDoc)
}

export function compile(doc: SchemaDoc): z.ZodTypeAny {
  const shape = z.object(
    Object.fromEntries(
      (doc.fields as unknown as Field[]).map((f) => [f.key as string, compileField(f)]),
    ),
  )
  return applyRules(shape, doc)
}

/** Reglas que solo tienen sentido viendo la colección entera. */
export function validateCollection(doc: SchemaDoc, rows: Record<string, unknown>[]): string[] {
  const errors: string[] = []
  for (const rule of doc.rules as Record<string, unknown>[]) {
    if (rule.type !== 'uniqueInCollection') continue
    for (const key of (rule.fields ?? []) as string[]) {
      const seen = new Set<string>()
      for (const row of rows) {
        const v = String(row[key] ?? '')
        if (seen.has(v)) errors.push(`${rule.message} ("${v}")`)
        seen.add(v)
      }
    }
  }
  return errors
}

/**
 * Documento vacío a partir del esquema — lo que ve un formulario "nuevo".
 *
 * No devuelve `{}`: un campo localizado tiene que nacer como `{ es: '', en: '' }`
 * y una lista como `[]`, o el primer `v-model` sobre él escribiría sobre
 * `undefined` y el widget se rompería antes de que nadie teclee nada.
 */
export function emptyField(f: Field): unknown {
  const required = f.required !== false
  switch (f.type) {
    case 'text':
      return f.localized === true ? { es: '', en: '' } : ''
    case 'boolean':
      return false
    case 'integer':
      return required ? ((f.constraints as Record<string, unknown>)?.min ?? 0) : undefined
    case 'tuple':
      return asFields(f.elements).map(emptyField)
    case 'list':
      return []
    case 'group':
      return Object.fromEntries(asFields(f.fields).map((h) => [h.key as string, emptyField(h)]))
    case 'custom':
      return undefined
    default:
      return ''
  }
}

export function emptyDoc(doc: SchemaDoc): Record<string, unknown> {
  return Object.fromEntries(
    (doc.fields as unknown as Field[]).map((f) => [f.key as string, emptyField(f)]),
  )
}
