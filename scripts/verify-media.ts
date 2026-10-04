/**
 * VERIFICA EL TRANSPORTE DE LA BIBLIOTECA DE MEDIOS CONTRA FIREBASE REAL.
 *
 *   npm run verify:media
 *
 * Prueba EXACTAMENTE el diseño que usa `src-tauri/src/media/upload.rs`: la API
 * v0 de Storage con `Authorization: Firebase <idToken>`. No reimplementa el
 * pipeline — comprueba las cuatro cosas que, si están mal, hacen que la
 * biblioteca no funcione y el síntoma sea «no se ve la imagen»:
 *
 *   1. que el endpoint de subida acepte el esquema de autorización
 *   2. que la URL pública se lea SIN token (lo que permite servirla en la web)
 *   3. que las reglas rechacen un tipo que no debería pasar
 *   4. que un anónimo no pueda subir nada
 *
 * Deja el bucket como lo encontró: borra lo que sube, incluso si algo falla.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { openAdminSession } from './firebase-admin-session'
import { readEnv } from './env'

const API = 'https://firebasestorage.googleapis.com/v0/b'

/** Un PNG de 1x1 válido. Pequeño a propósito: esto prueba rutas, no pesos. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Prefijo de los archivos de prueba.
 *
 * NO usa `__verificacion__`: Firestore reserva los ids de documento que
 * coinciden con `__.*__` y responde
 * `INVALID_ARGUMENT: Resource id is invalid because it is reserved`.
 * Storage no tiene esa restricción, pero conviene el mismo nombre en los dos
 * sitios. (El id real de un asset es un sha256 en hexadecimal, así que nunca
 * puede chocar con la regla.)
 */
const PRUEBA = 'zz-verificacion'

const objeto = (n: string) => `media/${PRUEBA}/${n}`
const url = (bucket: string, o: string) => `${API}/${bucket}/o/${encodeURIComponent(o)}?alt=media`
const subida = (bucket: string, o: string) =>
  `${API}/${bucket}/o?uploadType=media&name=${encodeURIComponent(o)}`

let fallos = 0
function ok(etiqueta: string, bien: boolean, detalle = '') {
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta}${detalle ? ` — ${detalle}` : ''}`)
  if (!bien) fallos++
}

const { auth, db } = await openAdminSession()
const env = readEnv()
const bucket = env.VITE_FIREBASE_STORAGE_BUCKET
if (!bucket) {
  console.error('Falta VITE_FIREBASE_STORAGE_BUCKET en .env.')
  process.exit(1)
}

const token = await auth.currentUser!.getIdToken()
const limpiar: string[] = []

async function borrar(o: string) {
  await fetch(`${API}/${bucket}/o/${encodeURIComponent(o)}`, {
    method: 'DELETE',
    headers: { Authorization: `Firebase ${token}` },
  }).catch(() => {})
}

try {
  console.log(`\nBucket: ${bucket}\n`)

  // ── 1. Subida con el esquema de autorización que usa Rust
  console.log('1. Subida autenticada')
  const o1 = objeto('prueba.png')
  const r1 = await fetch(subida(bucket, o1), {
    method: 'POST',
    // `Firebase <token>`, NO `Bearer`: es el esquema propio de esta API.
    headers: { Authorization: `Firebase ${token}`, 'Content-Type': 'image/png' },
    body: PNG,
  })
  ok('acepta `Authorization: Firebase <idToken>`', r1.ok, `HTTP ${r1.status}`)
  if (r1.ok) limpiar.push(o1)
  else console.log(`      ${(await r1.text()).trim().slice(0, 300)}`)

  // ── 2. Lectura pública sin token: es lo que hace posible servirla en la web
  console.log('\n2. Lectura pública')
  const r2 = await fetch(url(bucket, o1))
  ok('se lee SIN token', r2.ok, `HTTP ${r2.status}`)
  if (r2.ok) {
    const bytes = Buffer.from(await r2.arrayBuffer())
    ok('devuelve los mismos bytes', bytes.equals(PNG), `${bytes.length} B`)
    ok(
      'con el Content-Type correcto',
      r2.headers.get('content-type')?.startsWith('image/png') === true,
      r2.headers.get('content-type') ?? 'sin cabecera',
    )
  }

  // La forma «limpia» de GCS: debe fallar. Si funcionara, la URL sería más
  // corta y convendría usarla; las reglas de Firebase no otorgan ACLs de GCS.
  const r2b = await fetch(`https://storage.googleapis.com/${bucket}/${o1}`)
  ok(
    'la forma storage.googleapis.com NO sirve (esperado)',
    !r2b.ok,
    `HTTP ${r2b.status}`,
  )

  // ── 3. Las reglas acotan el tipo
  console.log('\n3. Las reglas rechazan lo que no corresponde')
  const o3 = objeto('prueba.txt')
  const r3 = await fetch(subida(bucket, o3), {
    method: 'POST',
    headers: { Authorization: `Firebase ${token}`, 'Content-Type': 'text/plain' },
    body: Buffer.from('esto no es un medio'),
  })
  ok('un text/plain se rechaza', !r3.ok, `HTTP ${r3.status}`)
  if (r3.ok) limpiar.push(o3)

  // El JSON del registro SÍ tiene que pasar: se sube junto al medio.
  const o3b = objeto('asset.json')
  const r3b = await fetch(subida(bucket, o3b), {
    method: 'POST',
    headers: { Authorization: `Firebase ${token}`, 'Content-Type': 'application/json' },
    body: Buffer.from('{"id":"x"}'),
  })
  ok('un application/json se acepta', r3b.ok, `HTTP ${r3b.status}`)
  if (r3b.ok) limpiar.push(o3b)

  // ── 4. Sin sesión no se sube
  console.log('\n4. Sin sesión')
  const r4 = await fetch(subida(bucket, objeto('anonimo.png')), {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: PNG,
  })
  ok('un anónimo no puede subir', !r4.ok, `HTTP ${r4.status}`)

  // ── 5. La colección de Firestore
  console.log('\n5. La colección `media` en Firestore')
  const ref = doc(db, `media/${PRUEBA}`)
  try {
    await setDoc(ref, { slug: 'verificacion', kind: 'image', status: 'ready' })
    ok('la admin escribe un documento', true)
    const snap = await getDoc(ref)
    ok('y se vuelve a leer', snap.exists())
    await deleteDoc(ref)
    ok('y se borra', true)
  } catch (e) {
    ok('la admin escribe un documento', false, (e as Error).message)
  }
} finally {
  for (const o of limpiar) await borrar(o)
  console.log(`\n${limpiar.length} archivo(s) de prueba borrados.`)
}

console.log(
  fallos === 0
    ? '\n✓ El transporte funciona como lo implementa Rust.\n'
    : `\n✗ ${fallos} comprobación(es) fallaron.\n`,
)
process.exit(fallos === 0 ? 0 : 1)
