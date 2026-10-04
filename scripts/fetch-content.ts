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
 * SI LA RED FALLA, no rompe el build: se queda con el `content.json` que ya
 * está commiteado y lo dice en voz alta. Un despliegue con contenido de ayer es
 * infinitamente mejor que un despliegue fallido.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore, doc, getDoc, query, orderBy } from 'firebase/firestore'
import { readEnv } from './env'

const DEST = 'apps/web/src/data/content.json'

const env = readEnv()
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

  const content = {
    fetchedAt: new Date().toISOString(),
    ui,
    categories,
    catalog,
    projects: publicados(projects as { draft?: boolean }[]),
    articles: publicados(articles as { draft?: boolean }[]),
  }

  writeFileSync(DEST, JSON.stringify(content, null, 2) + '\n', 'utf8')

  console.log(`   ${content.categories.length} rubros`)
  console.log(`   ${content.catalog.length} grupos de catálogo`)
  console.log(`   ${content.projects.length} proyectos (${projects.length - content.projects.length} borradores fuera)`)
  console.log(`   ${content.articles.length} artículos (${articles.length - content.articles.length} borradores fuera)`)
  console.log(`   ${Object.keys(ui).length} grupos de micro-copy`)
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
