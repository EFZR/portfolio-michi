/**
 * TIPOS DE LOS ESQUEMAS.
 *
 * Son el vocabulario del panel: los tipos de campo, los operadores y los tipos
 * de regla que el motor sabe renderizar y evaluar.
 *
 * AMPLIARLO CUESTA UN RELEASE del panel; usarlo no cuesta nada. Por eso está
 * completo desde la v1, aunque hoy varias entradas no tengan ni un caso de uso.
 * Ver `docs/fase-2-ui-dinamica.md` §1.4.
 */

export const FIELD_TYPES = [
  'text',
  'integer',
  'boolean',
  'enum',
  'date',
  // Referencia a un documento de la biblioteca de medios (`media/<id>`), no
  // una URL.
  //
  // Reemplazó al tipo `image`, que guardaba la dirección suelta y obligaba a
  // subir la foto antes en otra parte. `image` se quitó cuando los cuatro
  // esquemas que lo usaban pasaron a `media`: dejarlo habría obligado a
  // mantener vivo su widget y el subidor por canvas, que ya no se usan.
  'media',
  'tuple',
  'list',
  'group',
  'custom',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const OPERATORS = [
  'eq',
  'ne',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
  'lengthGt',
  'lengthLt',
  'matches',
] as const
export type Operator = (typeof OPERATORS)[number]

export const RULE_TYPES = [
  /** La suma de varios textos no puede pasar de un tope (el arco de Contacto). */
  'combinedLength',
  /** Un campo no puede repetirse en la colección (los slugs). */
  'uniqueInCollection',
  /** Suma de longitudes con tope (los labels de la navbar inline). */
  'sumMax',
  /** Un campo se vuelve obligatorio si se cumple una condición. */
  'requiredIf',
  /** Dos campos no pueden estar rellenos a la vez. */
  'mutuallyExclusive',
] as const
export type RuleType = (typeof RULE_TYPES)[number]

export type Condition =
  | { field: string; op: Operator; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
