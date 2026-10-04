/**
 * META-ESQUEMA: el esquema de los esquemas.
 *
 * ES EL ÚNICO ARCHIVO DE TODO EL SISTEMA QUE NO SE GENERA Y QUE NO SE PUBLICA.
 * Va dentro del binario del panel y es lo que valida todo lo demás.
 *
 * Por qué existe: el JSON que baja de Firestore es entrada NO CONFIABLE. Lo
 * escribió un script que puede tener un fallo, o una mano en la consola de
 * Firebase. Si se renderiza sin validar, un esquema a medias produce un
 * formulario a medias — que es peor que no pintar nada, porque parece que
 * funciona. Aquí se para antes.
 */

import { z } from 'zod'
import { FIELD_TYPES, OPERATORS, RULE_TYPES } from './types'

// ─────────────────────────────── Condiciones ────────────────────────────────

const leafCondition = z.object({
  field: z.string().min(1),
  op: z.enum(OPERATORS),
  value: z.unknown().optional(),
})

/**
 * Recursiva, así que necesita `z.lazy`: el árbol de condiciones se anida sin
 * profundidad declarada y no puede referenciarse a sí mismo antes de existir.
 */
export const conditionSchema: z.ZodType = z.lazy(() =>
  z.union([
    leafCondition,
    z.object({ all: z.array(conditionSchema).min(1) }),
    z.object({ any: z.array(conditionSchema).min(1) }),
    z.object({ not: conditionSchema }),
  ]),
)

// ───────────────────────────────── Campos ───────────────────────────────────

/**
 * Las opciones de un `enum` pueden salir de otra colección: la categoría de un
 * artículo sale de `blog.categories`, y el rubro de un proyecto de la colección
 * `categories`. No se pueden cerrar en el esquema porque cambian con los datos.
 */
const sourceSchema = z.object({
  collection: z.string().min(1),
  /** Documento concreto, cuando el origen es una lista dentro de uno. */
  document: z.string().optional(),
  /** Ruta a la lista dentro de ese documento, p. ej. "blog.categories". */
  path: z.string().optional(),
  /** Campo del que sale el valor. Se omite si la lista ya es de cadenas. */
  value: z.string().min(1).optional(),
  /** Campo que se muestra. Se omite si la lista ya es de cadenas. */
  label: z.string().min(1).optional(),
  orderBy: z.string().optional(),
})

export const fieldSchema: z.ZodType = z.lazy(() =>
  z.object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'La clave debe ser un identificador válido.'),
    type: z.enum(FIELD_TYPES),

    // `label` y `help` son copy de la INTERFAZ del panel, así que van en
    // español — igual que el resto de textos que lee una persona.
    label: z.string().min(1).max(60),
    help: z.string().max(200).optional(),

    required: z.boolean().default(true),

    /**
     * `true` convierte el campo en `{ es, en }`. Se localizan los textos que
     * alguien lee; nunca `slug`, `id`, fechas, números ni rutas de imagen.
     */
    localized: z.boolean().default(false),

    visible: conditionSchema.optional(),
    constraints: z.record(z.string(), z.unknown()).default({}),
    ui: z.record(z.string(), z.unknown()).default({}),

    // Contenedores. Cada uno solo tiene sentido para su `type`; lo comprueba
    // el `superRefine` de abajo, no el tipo.
    elements: z.array(fieldSchema).optional(), // tuple
    element: fieldSchema.optional(), // list
    fields: z.array(fieldSchema).optional(), // group
    widget: z.string().optional(), // custom
    source: sourceSchema.optional(), // enum
  }),
)

// ───────────────────────────────── Reglas ───────────────────────────────────

const ruleSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(RULE_TYPES),
    message: z.string().min(1).max(200),
  })
  // Cada tipo de regla trae sus propios campos (`fields`, `max`, `anchor`…).
  // Se dejan pasar aquí y los valida el compilador, que es quien sabe qué
  // necesita cada uno.
  .loose()

// ──────────────────────────── Documento completo ────────────────────────────

export const metaSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(60),
    description: z.string().max(200).optional(),

    /** Sube en cada publicación. Es la clave de caché del compilado. */
    version: z.int().positive(),

    /**
     * Versión del FORMATO, no del contenido. Un esquema con `format: 2`
     * publicado por una web más nueva que el panel falla aquí y cae al espejo
     * bundleado, en vez de renderizarse a medias con los campos que el panel
     * sí entiende. El fallo es explícito y el panel sigue usable.
     */
    format: z.literal(1),

    target: z.object({
      collection: z.string().min(1),
      document: z.string().optional(),
      prefix: z.string().optional(),
    }),

    fields: z.array(fieldSchema).min(1),
    rules: z.array(ruleSchema).default([]),
    groups: z
      .array(z.object({ id: z.string(), label: z.string().max(40), order: z.int() }))
      .default([]),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>()

    function walk(field: Record<string, unknown>, path: string) {
      const key = String(field.key)
      const at = path ? `${path}.${key}` : key

      if (seen.has(at)) {
        ctx.addIssue({ code: 'custom', message: `Clave repetida: "${at}".` })
      }
      seen.add(at)

      // Cada contenedor exige lo suyo. Sin esto, un `list` sin `element` pasa
      // la validación y revienta en el compilador, lejos de la causa.
      const type = field.type
      if (type === 'tuple' && !Array.isArray(field.elements)) {
        ctx.addIssue({ code: 'custom', message: `"${at}" es tuple y no trae "elements".` })
      }
      if (type === 'list' && !field.element) {
        ctx.addIssue({ code: 'custom', message: `"${at}" es list y no trae "element".` })
      }
      if (type === 'group' && !Array.isArray(field.fields)) {
        ctx.addIssue({ code: 'custom', message: `"${at}" es group y no trae "fields".` })
      }
      if (type === 'custom' && !field.widget) {
        ctx.addIssue({ code: 'custom', message: `"${at}" es custom y no dice qué widget usa.` })
      }
      const constraints = (field.constraints ?? {}) as Record<string, unknown>
      if (type === 'enum' && !field.source && !constraints['options']) {
        ctx.addIssue({
          code: 'custom',
          message: `"${at}" es enum y no trae ni "source" ni "constraints.options".`,
        })
      }
      // Localizar un número o una imagen no significa nada y casi siempre es
      // un descuido al copiar un campo.
      if (field.localized === true && type !== 'text') {
        ctx.addIssue({
          code: 'custom',
          message: `"${at}" es ${String(type)} y no puede ser localized (solo text).`,
        })
      }

      for (const child of (field.elements as Record<string, unknown>[]) ?? []) walk(child, at)
      for (const child of (field.fields as Record<string, unknown>[]) ?? []) walk(child, at)
      if (field.element) walk(field.element as Record<string, unknown>, at)
    }

    for (const field of doc.fields as Record<string, unknown>[]) walk(field, '')

    // Una regla que apunta a un campo inexistente no falla nunca: pasa
    // desapercibida y da la falsa sensación de estar protegiendo algo.
    for (const rule of doc.rules) {
      for (const key of (rule.fields as string[] | undefined) ?? []) {
        if (!seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            message: `La regla "${rule.id}" apunta a "${key}", que no existe.`,
          })
        }
      }
    }

    // Los grupos que los campos citan tienen que estar declarados, o la
    // pantalla del panel pinta una sección sin título.
    const groups = new Set(doc.groups.map((g) => g.id))
    for (const field of doc.fields as Record<string, unknown>[]) {
      const g = (field.ui as Record<string, unknown> | undefined)?.['group']
      if (typeof g === 'string' && groups.size > 0 && !groups.has(g)) {
        ctx.addIssue({ code: 'custom', message: `El grupo "${g}" no está declarado.` })
      }
    }
  })

export type SchemaDoc = z.infer<typeof metaSchema>
