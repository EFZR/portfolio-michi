/**
 * IDIOMAS DEL CONTENIDO.
 *
 * El contenido se guarda en los dos; la web publica hoy solo español y el
 * inglés espera a que existan las rutas `/es` y `/en`.
 *
 * `es` es el idioma PRIMARIO, y eso tiene tres consecuencias concretas:
 *   1. Un campo localizado exige `es` y admite `en` vacío — si no, no se podría
 *      guardar nada hasta haberlo traducido todo.
 *   2. Al pintar, un `en` vacío cae a `es`. Así se puede publicar con las
 *      traducciones a medias sin que salgan huecos en blanco.
 *   3. El id del documento sale del slug en español (ver `slugEn` en los
 *      esquemas de artículo y proyecto).
 */

export const LOCALES = ['es', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const PRIMARY_LOCALE: Locale = 'es'

/** Un texto en los dos idiomas. El primario siempre; el otro puede faltar. */
export type Localized = { es: string; en?: string }

/**
 * Resuelve un texto localizado al idioma pedido, con caída al primario.
 *
 * Acepta también un `string` pelado a propósito: durante la migración conviven
 * datos ya bilingües y datos que todavía no lo son, y obligar a convertirlos
 * todos de golpe para poder pintar uno solo no compensa.
 */
export function t(value: Localized | string | undefined, locale: Locale = PRIMARY_LOCALE): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  const chosen = value[locale]
  return chosen && chosen.trim() ? chosen : (value[PRIMARY_LOCALE] ?? '')
}

/** Envuelve un texto plano como localizado. Lo usa la semilla del paso 4. */
export function onlyPrimary(text: string): Localized {
  return { es: text, en: '' }
}
