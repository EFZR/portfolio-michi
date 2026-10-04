/**
 * BAJA EL CONTENIDO DE FIRESTORE AL REPO — corre en el prebuild.
 *
 *   npm run fetch:content
 *
 * POR QUÉ EN TIEMPO DE BUILD Y NO EN RUNTIME:
 * el Hero es el LCP de la web y su H1 son cinco palabras con reveal por letra.
 * Si esas palabras vienen de un `getDoc()`, o el Hero se pinta vacío y salta, o
 * el preloader se alarga lo que tarde la red. Las dos cosas rompen justo lo que
 * hace reconocible al sitio. Con el contenido resuelto en el build, la web
 * publicada NO CARGA el SDK de Firebase: cero KB añadidos, cero round-trips.
 *
 * NO SE AUTENTICA, y es a propósito: lee exactamente lo que ve un visitante.
 * Si una regla ocultara algo que la web necesita, el fallo saldría AQUÍ, en el
 * build, y no en producción con la página a medio pintar.
 *
 * DOS FALLOS QUE NO SE MEZCLAN:
 *
 *   - LA RED falla, o Firestore no responde → no rompe el build: se queda con
 *     el `content.json` commiteado y lo dice en voz alta. Un despliegue con
 *     contenido de ayer es infinitamente mejor que un despliegue fallido, y
 *     mañana funciona solo.
 *
 *   - FALTAN LAS CREDENCIALES → rompe el build, diciendo cuáles. Esto no se
 *     arregla solo: es una configuración que alguien tiene que poner. Dejarlo
 *     pasar publicaría el contenido de la semana pasada en silencio, lo que
 *     vacía de sentido el botón «Publicar» del panel. Mejor un build rojo con
 *     el nombre de las seis variables.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore, doc, getDoc, query, orderBy } from 'firebase/firestore'
import { readEnv } from './env'

const DEST = 'apps/web/src/data/content.json'

/** Serializa con las claves de cada objeto en orden alfabético. */
function estable(valor: unknown): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, ordenar((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return JSON.stringify(ordenar(valor), null, 2)
}

const env = readEnv()

const VARIABLES = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const faltan = VARIABLES.filter((v) => !env[v])
if (faltan.length) {
  console.error('\n✗ Faltan las credenciales de Firebase para bajar el contenido:\n')
  for (const v of faltan) console.error(`    ${v}`)
  console.error(
    '\n  En tu máquina: copiá .env.example a .env y rellenalas.' +
      '\n  En Netlify:    Site configuration → Environment variables.\n' +
      '\n  No son secretas: viajan en el bundle igual (ver .env.example).\n',
  )
  process.exit(1)
}

const app = initializeApp(
  {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  },
  'fetch-content',
)
const db = getFirestore(app)

async function lista(nombre: string, campoOrden?: string) {
  const ref = collection(db, nombre)
  const snap = await getDocs(campoOrden ? query(ref, orderBy(campoOrden)) : ref)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

try {
  console.log(`Bajando de "${env.VITE_FIREBASE_PROJECT_ID}"…`)

  const [ui, categories, catalog, projects, articles] = await Promise.all([
    getDoc(doc(db, 'config', 'ui')).then((s) => {
      if (!s.exists()) throw new Error('config/ui no existe. ¿Falta la semilla?')
      return s.data()
    }),
    lista('categories', 'order'),
    lista('catalog'),
    lista('projects', 'order'),
    lista('articles'),
  ])

  // Los borradores no se publican. Se filtran AQUÍ y no en el componente: lo
  // que no entra en el bundle no se puede filtrar mal más adelante.
  const publicados = <T extends { draft?: boolean }>(xs: T[]) => xs.filter((x) => !x.draft)

  // ── LA BIBLIOTECA DE MEDIOS, SOLO LO REFERENCIADO ──────────────────────────
  //
  // Se piden los medios UNO POR UNO en vez de listar la colección, y no es un
  // detalle: las reglas cierran el `list` a la admin justamente para que no se
  // pueda enumerar la biblioteca. Lo que protege es a los borradores — el id
  // de una foto subida para un proyecto sin publicar no aparece en ningún
  // sitio público, y 16 hexadecimales son 64 bits.
  //
  // Cuesta lo mismo: Firestore factura por documento leído, no por consulta.
  // Y tiene dos ventajas: `content.json` solo lleva lo que se usa, y un medio
  // de un borrador NUNCA entra en el bundle publicado.
  const referencias = new Set<string>()
  const anotar = (v: unknown) => {
    if (typeof v === 'string' && /^[0-9a-f]{8,64}$/.test(v)) referencias.add(v)
  }

  for (const p of publicados(projects as { draft?: boolean }[]) as Record<string, unknown>[]) {
    anotar(p.image)
  }
  for (const c of categories as Record<string, unknown>[]) anotar(c.image)
  anotar(((ui as Record<string, unknown>).site as Record<string, unknown>)?.ogImage)

  for (const a of publicados(articles as { draft?: boolean }[]) as Record<string, unknown>[]) {
    anotar(a.coverImage)
    // El contenido es una lista plana en los artículos sembrados y un
    // `{ es, en }` en los que se editen desde el panel. Conviven a propósito.
    const bloques = Array.isArray(a.content)
      ? a.content
      : Object.values((a.content ?? {}) as Record<string, unknown[]>).flat()
    for (const b of bloques as Record<string, unknown>[]) {
      if (b?.type === 'image') anotar(b.mediaId)
    }
  }

  const medios = await Promise.all(
    [...referencias].map(async (id) => {
      const snap = await getDoc(doc(db, 'media', id))
      return snap.exists() ? { id, ...snap.data() } : null
    }),
  )
  const huerfanos = [...referencias].filter((_, i) => medios[i] === null)
  const media = medios.filter((m): m is Record<string, unknown> => m !== null)

  const content = {
    fetchedAt: new Date().toISOString(),
    ui,
    categories,
    catalog,
    projects: publicados(projects as { draft?: boolean }[]),
    articles: publicados(articles as { draft?: boolean }[]),
    // Los medios NO se filtran por `draft`: no tienen ese campo. Lo que decide
    // si uno se puede usar es tener `alt` y `basePath`, y eso lo comprueba el
    // componente al pintar — un medio sin `alt` referenciado desde un
    // proyecto publicado tiene que ser visible como problema, no desaparecer.
    media,
  }

  // Claves ORDENADAS al escribir, y no es cosmética.
  //
  // Firestore devuelve los campos de un documento en un orden que no es
  // estable, así que `JSON.stringify` tal cual producía un diff de 7180 líneas
  // cada vez que se bajaba el contenido, aunque no hubiera cambiado nada. Un
  // archivo generado que se commitea tiene que dar diffs LEGIBLES, o deja de
  // poder revisarse y se commitea a ciegas.
  //
  // Los arrays NO se ordenan: ahí el orden es contenido (la secuencia de
  // bloques de un artículo, el orden de los proyectos en la galería).
  writeFileSync(DEST, estable(content) + '\n', 'utf8')

  console.log(`   ${content.categories.length} rubros`)
  console.log(`   ${content.catalog.length} grupos de catálogo`)
  console.log(`   ${content.projects.length} proyectos (${projects.length - content.projects.length} borradores fuera)`)
  console.log(`   ${content.articles.length} artículos (${articles.length - content.articles.length} borradores fuera)`)
  console.log(`   ${Object.keys(ui).length} grupos de micro-copy`)
  console.log(`   ${content.media.length} medios referenciados`)
  if (huerfanos.length) {
    // Una referencia a un medio que ya no existe. No rompe el build —la web
    // pinta el hueco vacío— pero es una imagen que falta en el sitio
    // publicado, y eso tiene que decirse en voz alta.
    console.warn(`\n⚠  ${huerfanos.length} referencia(s) a medios que no existen:`)
    for (const id of huerfanos) console.warn(`     ${id}`)
    console.warn('')
  }
  console.log(`\n→ ${DEST}`)
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  if (existsSync(DEST)) {
    const previo = JSON.parse(readFileSync(DEST, 'utf8')) as { fetchedAt?: string }
    console.warn(`\n⚠  No se pudo bajar el contenido: ${msg}`)
    console.warn(`   Se usa el content.json commiteado (bajado el ${previo.fetchedAt ?? '¿?'}).`)
    console.warn(`   El build SIGUE, pero con contenido que puede estar viejo.\n`)
  } else {
    console.error(`\n✗ No se pudo bajar el contenido y no hay copia local: ${msg}\n`)
    process.exit(1)
  }
}
process.exit(0)
