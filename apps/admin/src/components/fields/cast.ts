/**
 * EL CAST: documento del editor ⇄ bloques tipados.
 *
 * El editor trabaja con un árbol de ProseMirror (párrafos, encabezados, listas,
 * citas, código) y Firestore guarda el arreglo de `ContentBlock` que la web sabe
 * pintar. Esta es la única pieza que conoce las dos formas.
 *
 * Es un archivo aparte y sin dependencias de Vue para poder probarlo solo: si
 * el cast se equivoca, el artículo se guarda mal y no hay forma de verlo hasta
 * que alguien lo abre publicado.
 */

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
}

export type RichText = string | TextRun[]

export interface Bloque {
  type: string
  [k: string]: unknown
}

/** Nodo de ProseMirror, con lo justo que este cast necesita. */
interface Nodo {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: Nodo[]
}

/**
 * Enlaces permitidos: http(s) y rutas internas. Se filtra AQUÍ y no al pintar
 * porque un `javascript:` pegado desde el portapapeles tiene que morir antes de
 * llegar a Firestore, no cada vez que alguien lee el artículo.
 */
function enlaceSeguro(href: unknown): string | undefined {
  const v = String(href ?? '').trim()
  if (!v) return undefined
  return /^(https?:\/\/|\/|mailto:)/i.test(v) ? v : undefined
}

// ─────────────────────────── editor → bloques ───────────────────────────

function aFragmentos(nodos: Nodo[] = []): RichText {
  const runs: TextRun[] = []

  for (const n of nodos) {
    if (n.type === 'hardBreak') {
      // Un salto manual se pega al fragmento anterior: los bloques no tienen
      // concepto de <br>, y partirlos en dos párrafos cambiaría el ritmo.
      if (runs.length) runs[runs.length - 1].text += '\n'
      continue
    }
    if (n.type !== 'text' || !n.text) continue

    const run: TextRun = { text: n.text }
    for (const marca of n.marks ?? []) {
      if (marca.type === 'bold') run.bold = true
      if (marca.type === 'italic') run.italic = true
      if (marca.type === 'code') run.code = true
      if (marca.type === 'link') {
        const href = enlaceSeguro(marca.attrs?.href)
        if (href) run.href = href
      }
    }
    // Fragmentos contiguos con las mismas marcas se funden: el editor los parte
    // por motivos internos y guardarlos sueltos hincha el documento sin aportar.
    const previo = runs[runs.length - 1]
    if (previo && mismasMarcas(previo, run)) previo.text += run.text
    else runs.push(run)
  }

  // Si no hay ni una marca, se guarda como cadena: es la forma heredada, más
  // corta de leer en la consola de Firebase y la que ya tienen los doce
  // artículos sembrados.
  return runs.every((r) => !r.bold && !r.italic && !r.code && !r.href)
    ? runs.map((r) => r.text).join('')
    : runs
}

function mismasMarcas(a: TextRun, b: TextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code && a.href === b.href
}

export function documentoABloques(doc: Nodo | null | undefined): Bloque[] {
  const bloques: Bloque[] = []

  for (const nodo of doc?.content ?? []) {
    switch (nodo.type) {
      case 'paragraph': {
        const texto = aFragmentos(nodo.content)
        // Los párrafos vacíos son el enter de más al final: no se guardan.
        if (typeof texto === 'string' && !texto.trim()) break
        bloques.push({ type: 'paragraph', text: texto })
        break
      }

      case 'heading':
        bloques.push({ type: 'heading', text: plano(nodo.content) })
        break

      case 'blockquote': {
        // Una cita puede traer varios párrafos; se juntan porque el bloque
        // `quote` de la web es uno solo.
        const parrafos = (nodo.content ?? []).map((p) => aFragmentos(p.content))
        const cita = parrafos.length === 1 ? parrafos[0] : parrafos.map(texto).join('\n\n')
        const autor = String(nodo.attrs?.cite ?? '').trim()
        // `cite` es opcional en la web: solo viaja si lo hay, para no llenar
        // Firestore de cadenas vacías.
        bloques.push({ type: 'quote', text: cita, ...(autor ? { cite: autor } : {}) })
        break
      }

      case 'bulletList':
      case 'orderedList':
        bloques.push({
          type: 'list',
          ordered: nodo.type === 'orderedList',
          items: (nodo.content ?? []).map((li) =>
            aFragmentos((li.content ?? []).flatMap((p) => p.content ?? [])),
          ),
        })
        break

      case 'codeBlock':
        bloques.push({
          type: 'code',
          code: plano(nodo.content),
          language: String(nodo.attrs?.language ?? ''),
        })
        break

      case 'image':
        bloques.push({
          type: 'image',
          // Se persiste el ID de la biblioteca, no la URL: es la referencia
          // estable. La URL que el editor tenía en `src` se vuelve a resolver
          // al abrir, así que guardarla solo crearía una copia que envejece.
          mediaId: String(nodo.attrs?.mediaId ?? ''),
          // El pie viaja en `title` porque el nodo de imagen del editor no
          // tiene campo propio para él. La web lo exige, así que se conserva.
          caption: String(nodo.attrs?.title ?? nodo.attrs?.alt ?? ''),
        })
        break
    }
  }

  return bloques
}

const texto = (t: RichText): string =>
  typeof t === 'string' ? t : t.map((r) => r.text).join('')

function plano(nodos: Nodo[] = []): string {
  return nodos.map((n) => n.text ?? '').join('')
}

// ─────────────────────────── bloques → editor ───────────────────────────

function aNodosTexto(t: RichText | undefined): Nodo[] {
  if (t == null) return []
  if (typeof t === 'string') return t ? [{ type: 'text', text: t }] : []

  return t
    .filter((r) => r.text)
    .map((r) => {
      const marks: { type: string; attrs?: Record<string, unknown> }[] = []
      if (r.bold) marks.push({ type: 'bold' })
      if (r.italic) marks.push({ type: 'italic' })
      if (r.code) marks.push({ type: 'code' })
      if (r.href) marks.push({ type: 'link', attrs: { href: r.href } })
      return { type: 'text', text: r.text, ...(marks.length ? { marks } : {}) }
    })
}

/**
 * Resuelve el ID de un medio a una URL que el editor pueda pintar.
 *
 * Se INYECTA en vez de que el cast lea la biblioteca: así el cast sigue siendo
 * una función pura y se puede probar sin Firestore ni sesión, que es lo que
 * permite que los 23 tests del cast corran en milisegundos.
 */
export type ResolverMedio = (mediaId: string) => string | undefined

export function bloquesADocumento(
  bloques: readonly Bloque[] = [],
  resolver?: ResolverMedio,
): Nodo {
  const content: Nodo[] = []

  for (const b of bloques) {
    switch (b.type) {
      case 'paragraph':
        content.push({ type: 'paragraph', content: aNodosTexto(b.text as RichText) })
        break
      case 'heading':
        content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: aNodosTexto(b.text as RichText),
        })
        break
      case 'quote':
        content.push({
          type: 'blockquote',
          attrs: { cite: b.cite ? String(b.cite) : null },
          content: [{ type: 'paragraph', content: aNodosTexto(b.text as RichText) }],
        })
        break
      case 'list':
        content.push({
          type: b.ordered ? 'orderedList' : 'bulletList',
          content: ((b.items ?? []) as RichText[]).map((item) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: aNodosTexto(item) }],
          })),
        })
        break
      case 'code':
        content.push({
          type: 'codeBlock',
          attrs: { language: b.language ?? null },
          content: b.code ? [{ type: 'text', text: String(b.code) }] : [],
        })
        break
      case 'image': {
        const mediaId = String(b.mediaId ?? '')
        content.push({
          type: 'image',
          attrs: {
            mediaId,
            // Sin resolutor —o con un id que no está en la biblioteca— queda
            // vacío y el editor muestra una imagen roto. Es lo correcto: es
            // exactamente lo que pasaría en la web, y verlo acá es mejor que
            // descubrirlo publicado.
            src: resolver?.(mediaId) ?? '',
            title: String(b.caption ?? ''),
            alt: String(b.caption ?? ''),
          },
        })
        break
      }
    }
  }

  // Un documento vacío necesita al menos un párrafo o el editor no arranca.
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}
