/**
 * PUBLICAR Y ESPEJAR LOS ESQUEMAS.
 *
 *   npm run schemas:push        sube packages/content/src/schemas/*.json a Firestore
 *   npm run schemas:push -- -n  valida y enseña qué haría, sin tocar la red
 *   npm run schemas:pull        baja los de Firestore al espejo del repo
 *
 * DIRECCIÓN DE LA VERDAD: manda Firestore. Los archivos del repo son un ESPEJO,
 * y existen por dos cosas — que el panel arranque sin red y tener historial en
 * git de qué cambió y cuándo. Que el espejo esté atrasado es normal.
 *
 * EL `version` SE SUBE SOLO. Es la clave de caché del compilado en el panel: si
 * el contenido cambia y el número no, el panel sigue sirviendo el compilado
 * viejo y el campo nuevo no aparece. Acordarse a mano de subirlo es justo lo que
 * nadie hace, así que lo hace el script y reescribe el archivo del repo.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { metaSchema } from '@princess/content'
import { openAdminSession } from './firebase-admin-session'

const DIR = 'packages/content/src/schemas/'
const files = () => readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'))
const save = (id: string, doc: unknown) =>
  writeFileSync(`${DIR}${id}.json`, JSON.stringify(doc, null, 2) + '\n', 'utf8')

/** Compara ignorando `version`: es lo que decide si hay algo que publicar. */
const sameContent = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify({ ...a, version: 0 }) === JSON.stringify({ ...b, version: 0 })

async function push(dryRun: boolean) {
  // Validar TODO antes de subir NADA. Publicar la mitad de los esquemas deja al
  // panel con un formulario nuevo y otro viejo, que es peor que no publicar.
  const docs = files().map((f) => {
    const raw = load(f)
    const parsed = metaSchema.safeParse(raw)
    if (!parsed.success) {
      console.error(`\n✗ ${f} no es válido:`)
      for (const i of parsed.error.issues) console.error(`   ${i.path.join('.')}: ${i.message}`)
      process.exit(1)
    }
    return raw as Record<string, unknown>
  })
  console.log(`${docs.length} esquemas válidos.`)

  if (dryRun) {
    for (const d of docs) console.log(`   subiría  ${d.id}  v${d.version}`)
    console.log('\n(-n / --dry-run: no se tocó la red)')
    return
  }

  const { db, projectId } = await openAdminSession()
  console.log(`\nProyecto: ${projectId}\n`)

  let subidos = 0
  for (const d of docs) {
    const id = String(d.id)
    const ref = doc(db, 'schemas', id)
    const snap = await getDoc(ref)

    if (snap.exists()) {
      const remote = snap.data() as Record<string, unknown>
      if (sameContent(remote, d)) {
        console.log(`   =  ${id}  sin cambios (v${remote.version})`)
        continue
      }
      const next = Number(remote.version) + 1
      if (Number(d.version) <= Number(remote.version)) {
        d.version = next
        save(id, d) // el espejo del repo queda con el número publicado
      }
    }

    await setDoc(ref, d)
    console.log(`   ↑  ${id}  v${d.version}`)
    subidos++
  }

  console.log(`\n${subidos} publicados, ${docs.length - subidos} sin cambios.`)
}

async function pull() {
  const { db, projectId } = await openAdminSession()
  console.log(`\nProyecto: ${projectId}\n`)

  const snap = await getDocs(collection(db, 'schemas'))
  if (snap.empty) {
    console.log('No hay esquemas en Firestore. ¿Falta un push?')
    return
  }

  for (const d of snap.docs) {
    const data = d.data()
    const parsed = metaSchema.safeParse(data)
    if (!parsed.success) {
      // Se avisa pero se guarda igual: el espejo tiene que reflejar lo que HAY,
      // aunque lo que haya esté mal. Esconderlo haría el problema invisible.
      console.log(`   ⚠  ${d.id}  bajado pero NO es válido según el meta-esquema`)
    } else {
      console.log(`   ↓  ${d.id}  v${data.version}`)
    }
    save(d.id, data)
  }
  console.log(`\n${snap.size} esquemas en el espejo del repo.`)
}

const args = process.argv.slice(2)
const cmd = args[0]
const dryRun = args.includes('-n') || args.includes('--dry-run')

if (cmd === 'push') await push(dryRun)
else if (cmd === 'pull') await pull()
else {
  console.error('Uso: schemas.ts push [-n] | pull')
  process.exit(1)
}
process.exit(0)
