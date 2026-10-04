/**
 * Contrato común de todos los widgets.
 *
 * `campo` es el descriptor crudo del esquema. Se tipa laxo a propósito: el
 * esquema viene de Firestore y sus `constraints`/`ui` son abiertos por diseño —
 * cada tipo de campo tiene los suyos. El meta-esquema ya garantizó la forma
 * general; el widget sabe qué buscar dentro.
 */
export interface FieldDescriptor {
  key: string
  type: string
  label: string
  help?: string
  required?: boolean
  localized?: boolean
  constraints?: Record<string, unknown>
  ui?: Record<string, unknown>
  elements?: FieldDescriptor[]
  element?: FieldDescriptor
  fields?: FieldDescriptor[]
  widget?: string
  source?: { collection: string; document?: string; path?: string; value?: string; label?: string }
}

export interface FieldProps {
  campo: FieldDescriptor
  valor: unknown
  error: string
  ruta: string
}

/**
 * Control de texto: filete inferior, sin caja ni fondo.
 *
 * El foco NO usa un anillo: engorda el campo y descuadra el ritmo vertical de
 * la página. Se marca engrosando el filete a Ultraviolet, que en esta paleta es
 * el color reservado a "mírame".
 */
export const CONTROL =
  'w-full border-0 border-b border-border bg-transparent px-0 py-2.5 text-base text-foreground ' +
  'transition-colors duration-300 placeholder:text-muted-foreground/50 ' +
  'focus:border-primary focus:outline-none aria-[invalid=true]:border-primary'

export const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
