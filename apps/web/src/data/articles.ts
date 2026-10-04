/**
 * BLOG — artículos y sus bloques de contenido.
 *
 * Ya NO hay datos en este archivo: bajan de Firestore en el prebuild. Quedan
 * los TIPOS de los bloques (que el editor del panel tendrá que producir con
 * esta misma forma) y los ayudantes de búsqueda.
 */

import { ACTIVE_LOCALE, RAW } from './content'
import { UI } from './ui'

// ─────────────────────────── BLOQUES DE CONTENIDO ───────────────────────────

/**
 * El contenido NO es una cadena de Markdown ni de HTML: es un arreglo de
 * bloques tipados.
 *
 * Tres razones, por orden de peso:
 *  1. No entra `v-html` en el proyecto. Hoy no hay ni uno, y cada uno que se
 *     añade es una puerta que alguien tiene que acordarse de cerrar el día que
 *     el contenido deje de ser local.
 *  2. La tipografía sale del design system. Un `<h2>` de Markdown hereda lo que
 *     pille; aquí cada bloque se pinta con las clases del sistema.
 *  3. TypeScript valida el contenido. Una cita sin texto no compila.
 *
 * El día que llegue un CMS con Markdown, convertirlo a estos bloques es una
 * función — y el renderizador no se entera.
 */
/**
 * ── TEXTO CON FORMATO ───────────────────────────────────────────────────────
 *
 * Un fragmento de texto con sus marcas. El texto de un bloque puede ser una
 * cadena pelada (como lo sembramos) o un arreglo de fragmentos (como lo produce
 * el editor del panel). Las dos formas conviven a propósito: convertir los doce
 * artículos de golpe para poder poner una negrita no compensa.
 *
 * POR QUÉ FRAGMENTOS Y NO HTML: sigue sin entrar `v-html` en el proyecto. Con
 * fragmentos, cada marca se pinta con su propia etiqueta (`<strong>`, `<em>`,
 * `<code>`, `<a>`) y el contenido nunca se interpreta como marcado — un texto
 * que traiga `<script>` se ve como texto, que es lo correcto.
 */
export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  /** Enlace. Solo http(s) y rutas internas; lo valida el cast del panel. */
  href?: string
}

/** Texto plano (heredado) o con formato (editor del panel). */
export type RichText = string | readonly TextRun[]

export interface ParagraphBlock {
  type: 'paragraph'
  text: RichText
}

export interface HeadingBlock {
  type: 'heading'
  text: string
}

export interface QuoteBlock {
  type: 'quote'
  text: RichText
  /** A quién se cita. Opcional: hay citas que son del propio texto. */
  cite?: string
}

export interface ListBlock {
  type: 'list'
  items: readonly RichText[]
  /** `true` pinta una lista numerada (pasos); por defecto va con viñetas. */
  ordered?: boolean
}

export interface CodeBlock {
  type: 'code'
  code: string
  /** Etiqueta visible del lenguaje. No hay resaltado de sintaxis, a propósito. */
  language?: string
}

export interface ImageBlock {
  type: 'image'
  /**
   * ID de un documento de la biblioteca (`media/<id>`), no una URL.
   *
   * Guardar la referencia y no la dirección es lo que permite que la misma
   * foto se use en varios artículos, y que al cambiar la escalera de anchos
   * no haya que reeditar nada.
   */
  mediaId: string
  /** Pie de foto. Obligatorio: una imagen sin pie en un artículo es decoración. */
  caption: string
}

export type ContentBlock =
  ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock | CodeBlock | ImageBlock

// ──────────────────────────────── ARTÍCULO ──────────────────────────────────

/** Jerarquía visual. Decide la forma de la tarjeta, no su posición en la lista. */
export type ArticlePriority = 'hero' | 'high' | 'normal'

export interface Article {
  /** Identificador estable. La URL acepta esto o el `slug`. */
  id: string
  title: string
  slug: string
  /** Entradilla de una o dos frases — la que se lee en el listado. */
  excerpt: string
  content: readonly ContentBlock[]
  coverImage: string
  category: string
  author: string
  /** ISO `YYYY-MM-DD`. De aquí salen la insignia "Nuevo" y el tono de archivo. */
  publishedAt: string
  /** Minutos de lectura. */
  readTime: number
  /** Likes de partida. El del visitante se suma encima (ver `useLikes`). */
  likesCount: number
  priority: ArticlePriority
  tags: readonly string[]
}

/**
 * El contenido de un artículo puede venir en dos formas:
 *
 *   - `ContentBlock[]`            — la sembrada, y la de cualquier artículo que
 *                                   nadie haya tocado desde el panel.
 *   - `{ es: [...], en: [...] }`  — la que escribe el editor del panel, con un
 *                                   documento por idioma.
 *
 * Son dos porque una traducción no parte los párrafos igual que el original, y
 * obligarla a calcar la estructura del español haría el inglés peor. Aquí se
 * escoge el idioma activo y se cae al primario si ese documento está vacío —
 * mismo criterio que `t()` para los textos sueltos.
 *
 * El resolutor genérico de `content.ts` no puede hacer esto: solo aplana
 * `{ es, en }` cuando los dos valores son CADENAS, y aquí son arreglos.
 */
function contenidoDelIdioma(raw: unknown): readonly ContentBlock[] {
  if (Array.isArray(raw)) return raw as ContentBlock[]
  const porIdioma = (raw ?? {}) as Record<string, ContentBlock[] | undefined>
  const elegido = porIdioma[ACTIVE_LOCALE]
  return elegido?.length ? elegido : (porIdioma.es ?? [])
}

export const ARTICLES: readonly Article[] = (RAW.articles as unknown as Article[]).map((a) => ({
  ...a,
  content: contenidoDelIdioma((a as unknown as { content: unknown }).content),
}))

/** Categorías del blog. Salen de `config/ui`, que es donde se editan. */
export const BLOG_CATEGORIES = UI.blog.categories

/** Busca por `slug` o, si no hay, por `id` — la URL admite los dos. */
export function articleByRoute(parametro: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === parametro) ?? ARTICLES.find((a) => a.id === parametro)
}

/**
 * Relacionados: primero los de la misma categoría, y si no llegan a `limite`
 * se completan con los que comparten alguna etiqueta. Nunca devuelve el actual
 * ni repetidos, y nunca devuelve una lista vacía habiendo otros artículos.
 */
export function relatedArticles(article: Article, limite = 3): Article[] {
  const otros = ARTICLES.filter((a) => a.id !== article.id)
  const porCategoria = otros.filter((a) => a.category === article.category)
  const porEtiqueta = otros.filter(
    (a) => !porCategoria.includes(a) && a.tags.some((t) => article.tags.includes(t)),
  )
  const resto = otros.filter((a) => !porCategoria.includes(a) && !porEtiqueta.includes(a))
  return [...porCategoria, ...porEtiqueta, ...resto].slice(0, limite)
}
