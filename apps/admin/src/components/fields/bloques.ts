import type { FieldDescriptor } from './tipos'

/**
 * LOS SEIS TIPOS DE BLOQUE, descritos con los MISMOS descriptores de campo que
 * usa el motor de formularios.
 *
 * Así el editor de bloques no tiene formularios propios: monta `CampoDinamico`
 * con estos descriptores y hereda contadores, validación visual, pestañas de
 * idioma y accesibilidad sin reimplementar nada.
 *
 * Reflejan 1:1 los tipos de `apps/web/src/data/articles.ts`, que es lo que
 * `ArticleContent.vue` sabe pintar. Si aquí aparece un bloque que allí no
 * existe, el artículo se guarda y no se ve.
 */

const texto = (
  key: string,
  label: string,
  max: number,
  extra: Partial<FieldDescriptor> = {},
): FieldDescriptor => ({
  key,
  type: 'text',
  label,
  localized: true,
  constraints: { minLength: 1, maxLength: max },
  ui: { control: 'input' },
  ...extra,
})

export interface TipoBloque {
  /** Etiqueta del botón que lo añade. */
  label: string
  /** Marca corta para el índice del editor. */
  marca: string
  campos: FieldDescriptor[]
}

export const BLOQUES: Record<string, TipoBloque> = {
  paragraph: {
    label: 'Párrafo',
    marca: '¶',
    campos: [texto('text', 'Texto', 2000, { ui: { control: 'textarea', rows: 5 } })],
  },

  heading: {
    label: 'Subtítulo',
    marca: 'H',
    campos: [
      texto('text', 'Subtítulo', 100, {
        help: 'Es un H2 dentro del artículo, no un título de página.',
      }),
    ],
  },

  quote: {
    label: 'Cita',
    marca: '“',
    campos: [
      texto('text', 'Cita', 400, { ui: { control: 'textarea', rows: 3 } }),
      // A quién se cita es un nombre propio: no se traduce.
      {
        key: 'cite',
        type: 'text',
        label: 'A quién se cita',
        required: false,
        constraints: { maxLength: 60 },
        ui: { control: 'input' },
      },
    ],
  },

  list: {
    label: 'Lista',
    marca: '—',
    campos: [
      {
        key: 'items',
        type: 'list',
        label: 'Puntos',
        constraints: { minItems: 1, maxItems: 20 },
        ui: { control: 'container', sortable: true },
        element: texto('item', 'Punto', 200),
      },
      {
        key: 'ordered',
        type: 'boolean',
        label: 'Numerada',
        required: false,
        ui: { control: 'switch' },
      },
    ],
  },

  code: {
    label: 'Código',
    marca: '{ }',
    campos: [
      // El código NO se localiza: un `const` no tiene versión en español.
      {
        key: 'code',
        type: 'text',
        label: 'Código',
        constraints: { minLength: 1, maxLength: 4000 },
        ui: { control: 'textarea', rows: 8 },
      },
      {
        key: 'language',
        type: 'text',
        label: 'Lenguaje',
        required: false,
        help: 'Solo la etiqueta visible; no hay resaltado de sintaxis, a propósito.',
        constraints: { maxLength: 20 },
        ui: { control: 'input' },
      },
    ],
  },

  image: {
    label: 'Imagen',
    marca: '▣',
    campos: [
      {
        key: 'src',
        type: 'image',
        label: 'Imagen',
        constraints: { maxSizeMB: 5 },
        ui: { control: 'uploader' },
      },
      // Obligatorio a propósito: una imagen sin pie en un artículo es decoración.
      texto('caption', 'Pie de foto', 160, { help: 'Obligatorio.' }),
    ],
  },
}

export const ORDEN_BLOQUES = ['paragraph', 'heading', 'quote', 'list', 'code', 'image'] as const

/**
 * Los artículos sembrados guardan el texto como cadena plana; los que se editen
 * desde aquí lo guardarán como `{ es, en }`. Conviven a propósito —convertir
 * los doce de golpe no compensa— así que el editor normaliza al abrir.
 */
export function normalizar(bloque: Record<string, unknown>): Record<string, unknown> {
  const tipo = BLOQUES[String(bloque.type)]
  if (!tipo) return bloque

  const salida: Record<string, unknown> = { type: bloque.type }
  for (const campo of tipo.campos) {
    const v = bloque[campo.key]
    if (campo.localized && typeof v === 'string') salida[campo.key] = { es: v, en: '' }
    else if (campo.type === 'list' && Array.isArray(v))
      salida[campo.key] = v.map((x) => (typeof x === 'string' ? { es: x, en: '' } : x))
    else salida[campo.key] = v
  }
  return salida
}

/** Bloque recién creado, con sus campos ya inicializados. */
export function nuevoBloque(type: string): Record<string, unknown> {
  const tipo = BLOQUES[type]
  const salida: Record<string, unknown> = { type }
  for (const campo of tipo.campos) {
    if (campo.type === 'list') salida[campo.key] = [{ es: '', en: '' }]
    else if (campo.type === 'boolean') salida[campo.key] = false
    else if (campo.localized) salida[campo.key] = { es: '', en: '' }
    else salida[campo.key] = ''
  }
  return salida
}
