/**
 * SEMILLA — pasa el contenido actual a Firestore.
 *
 *   npm run seed -- --dry-run   valida todo y enseña qué subiría, sin red
 *   npm run seed                sube de verdad
 *
 * IDEMPOTENTE: el slug es el id del documento, así que volver a correrlo
 * sobrescribe en vez de duplicar. Se puede lanzar las veces que haga falta.
 *
 * NO PISA `likesCount`. Las reglas se lo impiden a la admin (el contador es del
 * público), y además sería un error: en cuanto la web esté en vivo, el valor de
 * Firestore será más nuevo que el del archivo local. Solo se escribe al crear.
 *
 * Los datos de `src/data` son MONOLINGÜES; aquí se envuelven en `{ es, en }`.
 * Esa conversión ya está probada en `apps/web/data.test.ts` contra los 45
 * registros, así que si el test pasa, esto sube datos válidos.
 */
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore'
import { compile, metaSchema, onlyPrimary } from '@princess/content'
import type { SchemaDoc } from '@princess/content'
import { PROJECTS, CATEGORIES } from '../apps/web/src/data/projects'
import { ARTICLES } from '../apps/web/src/data/articles'
import { CATALOG } from '../apps/web/src/data/catalog'
import { openAdminSession } from './firebase-admin-session'

const SCHEMAS = 'packages/content/src/schemas/'
const schema = (id: string): SchemaDoc =>
  metaSchema.parse(JSON.parse(readFileSync(`${SCHEMAS}${id}.json`, 'utf8')))

/** Envuelve en `{ es, en }` los campos que el esquema marca como localizados. */
function localize(row: Record<string, unknown>, doc: SchemaDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of doc.fields as unknown as Record<string, unknown>[]) {
    const key = f.key as string
    const v = row[key]
    if (v === undefined) continue

    if (f.localized === true && typeof v === 'string') {
      out[key] = onlyPrimary(v)
    } else if (
      f.type === 'list' &&
      Array.isArray(v) &&
      (f.element as Record<string, unknown>)?.localized
    ) {
      out[key] = v.map((x) => (typeof x === 'string' ? onlyPrimary(x) : x))
    } else if (f.type === 'list' && Array.isArray(v) && (f.element as Record<string, unknown>)?.fields) {
      out[key] = v.map((x) => localize(x as Record<string, unknown>, {
        fields: (f.element as Record<string, unknown>).fields,
      } as unknown as SchemaDoc))
    } else {
      out[key] = v
    }
  }
  return out
}

interface Lote {
  coleccion: string
  esquema: string
  filas: { id: string; data: Record<string, unknown> }[]
}

function construir(): Lote[] {
  const project = schema('project')
  const article = schema('article')
  const category = schema('category')
  const catalog = schema('catalog')

  return [
    {
      coleccion: 'categories',
      esquema: 'category',
      filas: CATEGORIES.map((c) => ({ id: c.id, data: localize({ ...c }, category) })),
    },
    {
      coleccion: 'catalog',
      esquema: 'catalog',
      filas: CATALOG.map((g) => ({ id: g.id, data: localize({ ...g }, catalog) })),
    },
    {
      coleccion: 'projects',
      esquema: 'project',
      filas: PROJECTS.map((p, i) => ({
        id: p.id,
        data: localize({ ...p, slug: p.id, order: i, draft: false }, project),
      })),
    },
    {
      coleccion: 'articles',
      esquema: 'article',
      filas: ARTICLES.map((a) => ({
        id: a.slug,
        // `content` son los bloques tipados: viajan tal cual, sin localizar.
        // El editor del paso 9 los producirá con la misma forma.
        data: { ...localize({ ...a, draft: false }, article), content: a.content },
      })),
    },
  ]
}

function validar(lotes: Lote[]): void {
  let errores = 0
  for (const lote of lotes) {
    const zod = compile(schema(lote.esquema))
    for (const fila of lote.filas) {
      const r = zod.safeParse(fila.data)
      if (!r.success) {
        errores++
        console.error(`\n✗ ${lote.coleccion}/${fila.id}`)
        for (const i of r.error.issues) console.error(`   ${i.path.join('.')}: ${i.message}`)
      }
    }
  }

  // El micro-copy se valida grupo por grupo contra su propio esquema.
  const ui = JSON.parse(readFileSync('scripts/seed-data/ui.json', 'utf8')) as Record<string, unknown>
  for (const [grupo, valores] of Object.entries(ui)) {
    const r = compile(schema(grupo)).safeParse(valores)
    if (!r.success) {
      errores++
      console.error(`\n✗ config/ui → ${grupo}`)
      for (const i of r.error.issues) console.error(`   ${i.path.join('.')}: ${i.message}`)
    }
  }

  if (errores) {
    console.error(`\n${errores} documentos no pasan su esquema. No se subió nada.`)
    process.exit(1)
  }
}

const dryRun = process.argv.includes('-n') || process.argv.includes('--dry-run')
const lotes = construir()
const ui = JSON.parse(readFileSync('scripts/seed-data/ui.json', 'utf8'))

console.log('Validando antes de tocar la red…')
validar(lotes)
for (const l of lotes) console.log(`   ${l.filas.length.toString().padStart(3)}  ${l.coleccion}`)
console.log(`   ${Object.keys(ui).length.toString().padStart(3)}  grupos en config/ui`)

if (dryRun) {
  console.log('\nTodo válido. (-n / --dry-run: no se tocó la red)')
  process.exit(0)
}

const { db, projectId } = await openAdminSession()
console.log(`\nProyecto: ${projectId}\n`)

for (const lote of lotes) {
  // En lotes de 400: Firestore admite 500 operaciones por batch.
  for (let i = 0; i < lote.filas.length; i += 400) {
    const batch = writeBatch(db)
    for (const fila of lote.filas.slice(i, i + 400)) {
      const ref = doc(db, lote.coleccion, fila.id)
      const { likesCount, ...resto } = fila.data
      const existe = (await getDoc(ref)).exists()
      // `likesCount` solo se escribe al CREAR: si el documento ya existe, el
      // contador de Firestore es el bueno y el del archivo local está viejo.
      batch.set(ref, existe ? resto : fila.data, { merge: true })
      if (!existe && likesCount === undefined) void likesCount
    }
    await batch.commit()
  }
  console.log(`   ↑  ${lote.coleccion}  ${lote.filas.length} documentos`)
}

await setDoc(doc(db, 'config', 'ui'), { ...ui, _version: 1 }, { merge: true })
console.log(`   ↑  config/ui  ${Object.keys(ui).length} grupos`)
console.log('\nSemilla completa.')
process.exit(0)
