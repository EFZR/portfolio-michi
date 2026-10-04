/**
 * EL CONTENIDO, RESUELTO.
 *
 * `content.json` lo escribe `scripts/fetch-content.ts` en el prebuild, leyendo
 * Firestore. Este módulo lo carga, resuelve el idioma y lo entrega tipado.
 *
 * Está COMMITEADO a propósito: es la red de seguridad del build. Si Firestore
 * no responde el día del despliegue, el script avisa y se usa esta copia — un
 * despliegue con contenido de ayer es mejor que un despliegue fallido.
 *
 * ── SOBRE EL IDIOMA ──────────────────────────────────────────────────────────
 * Firestore guarda `{ es, en }`; aquí se aplana a una cadena según
 * `ACTIVE_LOCALE`. Hoy es fijo porque la web publica solo español y las rutas
 * `/es` y `/en` todavía no existen.
 *
 * El día que existan, esto es lo ÚNICO que cambia: `ACTIVE_LOCALE` pasa de
 * constante a algo derivado de la ruta, y los módulos de abajo pasan de
 * constantes a funciones. Ni un componente se entera, porque todos consumen
 * cadenas ya resueltas.
 */

/*
  Subruta `/locales`, lo más estrecha posible. Aquí el bundle importa:
    - el barrel raíz → arrastra el SDK de Firebase (~780 KB)
    - `/meta`        → arrastra Zod (~140 KB)
    - `/locales`     → nada, son treinta líneas sin dependencias

  La web solo necesita resolver `{ es, en }` a una cadena. Todo lo demás del
  paquete es para el panel y para los scripts.
*/
import { PRIMARY_LOCALE, t, type Locale } from '@princess/content/locales'
import crudo from './content.json'

export const ACTIVE_LOCALE: Locale = PRIMARY_LOCALE

/** Un `{ es, en }` sin resolver, tal y como viene de Firestore. */
type Bilingue = { es?: string; en?: string }

function esBilingue(v: unknown): v is Bilingue {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const claves = Object.keys(v)
  return (
    claves.length > 0 &&
    claves.every((k) => k === 'es' || k === 'en') &&
    Object.values(v).every((x) => typeof x === 'string')
  )
}

/**
 * Aplana en profundidad todos los `{ es, en }` del árbol.
 *
 * Recorre arrays y objetos anidados porque el contenido los tiene: las 5
 * palabras del Hero son una tupla de localizados, los pasos de Contacto son
 * una lista de grupos, y cada ítem del catálogo lleva dos.
 */
function resolver<T>(valor: unknown, locale: Locale): T {
  if (esBilingue(valor)) return t(valor as { es: string; en?: string }, locale) as T
  if (Array.isArray(valor)) return valor.map((v) => resolver(v, locale)) as T
  if (typeof valor === 'object' && valor !== null) {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, resolver(v, locale)]),
    ) as T
  }
  return valor as T
}

interface ContenidoCrudo {
  fetchedAt: string
  ui: Record<string, unknown>
  categories: unknown[]
  catalog: unknown[]
  projects: unknown[]
  articles: unknown[]
  media?: unknown[]
}

const fuente = crudo as unknown as ContenidoCrudo

/** Cuándo se bajó este contenido. Útil para depurar un despliegue raro. */
export const FETCHED_AT = fuente.fetchedAt

export const RAW = {
  ui: resolver<Record<string, never>>(fuente.ui, ACTIVE_LOCALE),
  categories: resolver<unknown[]>(fuente.categories, ACTIVE_LOCALE),
  catalog: resolver<unknown[]>(fuente.catalog, ACTIVE_LOCALE),
  projects: resolver<unknown[]>(fuente.projects, ACTIVE_LOCALE),
  articles: resolver<unknown[]>(fuente.articles, ACTIVE_LOCALE),
  /**
   * La biblioteca NO pasa por `resolver`, y es deliberado: un registro de medio
   * no tiene ningún campo `{ es, en }`, así que recorrerlo solo clonaría 46
   * objetos grandes al cargar el módulo para no cambiar nada.
   *
   * Si algún día el `alt` se traduce —y debería, cuando existan `/es` y
   * `/en`— esto pasa a ser una llamada a `resolver` como las demás.
   */
  media: (fuente.media ?? []) as unknown[],
}
