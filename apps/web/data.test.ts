/**
 * LOS DATOS QUE YA EXISTEN, CONTRA LOS ESQUEMAS.
 *
 * Es el «hecho cuando» del paso 2: si los 42 registros reales no pasan, el tope
 * está mal puesto y se corrige AHORA, antes de que exista un panel que lo imponga
 * y antes de que la semilla los suba a Firestore.
 *
 * Los datos de `src/data` son monolingües; se envuelven con `onlyPrimary()` para
 * compararlos contra el esquema bilingüe. Eso es exactamente lo que hará la
 * semilla del paso 4, así que este test también prueba esa conversión.
 */

import { describe, expect, it } from 'vitest'
import { compile, metaSchema, onlyPrimary, validateCollection } from '@princess/content'
import type { SchemaDoc } from '@princess/content'
import { PROJECTS, CATEGORIES } from './src/data/projects'
import { ARTICLES } from './src/data/articles'

/**
 * `import.meta.glob` en vez de `readFileSync`: este archivo vive bajo el
 * tsconfig de la web, que es de NAVEGADOR. Meterle los tipos de Node para un
 * test contaminaría el entorno de tipos de todo el código de la web.
 */
const CRUDOS = import.meta.glob('../../packages/content/src/schemas/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>

const POR_ID = Object.fromEntries(
  Object.entries(CRUDOS).map(([ruta, mod]) => [
    ruta.split('/').pop()!.replace('.json', ''),
    mod.default,
  ]),
)

const esquema = (id: string): SchemaDoc => metaSchema.parse(POR_ID[id])

/** Envuelve en `{ es, en }` los campos que el esquema marca como localizados. */
function bilingue(row: Record<string, unknown>, doc: SchemaDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const campos = doc.fields as unknown as Record<string, unknown>[]
  for (const f of campos) {
    const key = f.key as string
    const v = row[key]
    if (v === undefined) continue
    if (f.localized === true && typeof v === 'string') out[key] = onlyPrimary(v)
    else if (f.type === 'list' && Array.isArray(v) && (f.element as Record<string, unknown>)?.localized)
      out[key] = v.map((x) => (typeof x === 'string' ? onlyPrimary(x) : x))
    else out[key] = v
  }
  return out
}

describe('los 30 proyectos', () => {
  const doc = esquema('project')
  const zod = compile(doc)

  it.each(PROJECTS.map((p) => [p.id, p] as const))('%s pasa el esquema', (_id, p) => {
    const row = bilingue(
      { ...p, slug: p.id, order: 0, draft: false, image: p.image },
      doc,
    )
    const r = zod.safeParse(row)
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2))
    expect(r.success).toBe(true)
  })

  it('no hay slugs repetidos', () => {
    expect(validateCollection(doc, PROJECTS.map((p) => ({ slug: p.id })))).toEqual([])
  })
})

describe('los 12 artículos', () => {
  const doc = esquema('article')
  const zod = compile(doc)

  it.each(ARTICLES.map((a) => [a.slug, a] as const))('%s pasa el esquema', (_slug, a) => {
    const row = bilingue({ ...a, draft: false }, doc)
    const r = zod.safeParse(row)
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2))
    expect(r.success).toBe(true)
  })

  it('hay exactamente un artículo destacado', () => {
    expect(ARTICLES.filter((a) => a.priority === 'hero')).toHaveLength(1)
  })

  it('no hay slugs repetidos', () => {
    expect(validateCollection(doc, ARTICLES.map((a) => ({ slug: a.slug })))).toEqual([])
  })
})

describe('los 3 rubros', () => {
  const doc = esquema('category')
  const zod = compile(doc)

  it.each(CATEGORIES.map((c) => [c.id, c] as const))('%s pasa el esquema', (_id, c) => {
    const row = bilingue(
      { ...c, tagline: 'Estrategia · Marca', detail: 'Texto de la diapositiva.', order: 0 },
      doc,
    )
    const r = zod.safeParse(row)
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2))
    expect(r.success).toBe(true)
  })
})

describe('los esquemas de micro-copy compilan', () => {
  const ids = Object.keys(POR_ID)
  it.each(ids)('%s', (id) => {
    expect(() => compile(esquema(id))).not.toThrow()
  })
})

/**
 * Un compilador que devolviera `z.unknown()` para todo pasaría los 65 tests de
 * arriba sin esforzarse. Estos comprueban que RECHAZA.
 */
describe('el compilador rechaza de verdad', () => {
  const doc = esquema('project')
  const zod = compile(doc)

  const valido = () =>
    bilingue(
      {
        ...PROJECTS[0],
        slug: PROJECTS[0].id,
        order: 0,
        draft: false,
      },
      doc,
    )

  it('el caso base es válido (si no, los demás no prueban nada)', () => {
    expect(zod.safeParse(valido()).success).toBe(true)
  })

  it('un resumen de 111 caracteres', () => {
    const row = { ...valido(), summary: { es: 'x'.repeat(111), en: '' } }
    expect(zod.safeParse(row).success).toBe(false)
  })

  it('un resumen largo SOLO en inglés — el tope es por idioma', () => {
    const row = { ...valido(), summary: { es: 'Corto', en: 'x'.repeat(111) } }
    expect(zod.safeParse(row).success).toBe(false)
  })

  it('un slug con mayúsculas o espacios', () => {
    expect(zod.safeParse({ ...valido(), slug: 'Manifiesto Aurora' }).success).toBe(false)
  })

  it('un año fuera de rango', () => {
    expect(zod.safeParse({ ...valido(), year: 1887 }).success).toBe(false)
  })

  it('más de 6 etiquetas', () => {
    const row = { ...valido(), tags: Array.from({ length: 7 }, () => ({ es: 'x', en: '' })) }
    expect(zod.safeParse(row).success).toBe(false)
  })

  it('un campo localizado entregado como cadena pelada', () => {
    expect(zod.safeParse({ ...valido(), title: 'Sin envolver' }).success).toBe(false)
  })

  it('falta el español de un campo obligatorio', () => {
    const row = { ...valido(), title: { en: 'Only English' } }
    expect(zod.safeParse(row).success).toBe(false)
  })
})

describe('la regla del arco', () => {
  const doc = esquema('contact')
  const zod = compile(doc)

  const base = {
    arcTitle: { es: 'Estás listo para trabajar', en: '' },
    arcAccent: { es: 'juntos', en: '' },
    statement: { es: 'Hagamos algo que la gente', en: '' },
    statementAccent: { es: 'recuerde', en: '' },
    phrase: { es: 'Escríbeme a {email} — trabajo desde {location}.', en: '' },
  }

  it('el texto actual cabe', () => {
    expect(zod.safeParse(base).success).toBe(true)
  })

  it('pasarse del combinado falla aunque cada mitad quepa por separado', () => {
    const row = {
      ...base,
      arcTitle: { es: '¿Estás listo para trabajar', en: '' }, // 26, dentro de su tope
      arcAccent: { es: 'conmigo ya', en: '' }, // 10, dentro del suyo
    }
    // 26 + 1 + 10 = 37 > 34
    expect(zod.safeParse(row).success).toBe(false)
  })

  it('el combinado se mide por idioma, no sumando los dos', () => {
    const row = {
      ...base,
      arcTitle: { es: 'Estás listo para trabajar', en: 'Are you ready to work' },
      arcAccent: { es: 'juntos', en: 'together' },
    }
    expect(zod.safeParse(row).success).toBe(true)
  })
})
