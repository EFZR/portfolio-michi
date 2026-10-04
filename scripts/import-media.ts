/**
 * IMPORTA A LA BIBLIOTECA LAS IMÁGENES QUE QUEDARON DE LA FASE ANTERIOR.
 *
 *   npm run media:import          # muestra qué haría, sin tocar nada
 *   npm run media:import -- --apply
 *
 * De las 46 referencias a imágenes que hay en los datos, 43 son placeholders
 * de picsum y 3 son fotos reales en `apps/web/public/`. Este script las pasa
 * por el pipeline, las sube a Storage, crea el documento en `media` y después
 * REEMPLAZA la URL por el ID en el documento que la referenciaba.
 *
 * ── POR QUÉ NO ESCRIBE POR DEFECTO ───────────────────────────────────────────
 * Modifica 46 documentos de producción. Un `--apply` explícito es la
 * diferencia entre una migración y un accidente.
 *
 * ── IDEMPOTENTE ──────────────────────────────────────────────────────────────
 * El id de un asset es el sha256 del original, así que se puede calcular ANTES
 * de procesar: si el documento ya existe en `media`, se salta el pipeline
 * entero y solo se corrige la referencia. Correrlo dos veces no duplica nada
 * ni repite 13 segundos de ffmpeg por imagen.
 *
 * ── EL REPARTO CON RUST ──────────────────────────────────────────────────────
 * Los medios y Storage los hace `media-cli`, que reutiliza el mismo módulo que
 * el panel. Node se queda con Firestore, donde ya vive la sesión autenticada.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { openAdminSession } from './firebase-admin-session'
import { readEnv } from './env'

const APLICAR = process.argv.includes('--apply')
const CLI =
  process.env.MEDIA_CLI ??
  'apps/admin/src-tauri/target/release/media-cli'
const CLI_DEBUG = 'apps/admin/src-tauri/target/debug/media-cli'
const TMP = join(tmpdir(), 'princess-import-media')

/** Un sitio donde hay una imagen que hay que migrar. */
interface Referencia {
  /** Qué documento y qué campo, para el informe y para el parcheo. */
  coleccion: string
  documento: string
  campo: string
  /** Índice del bloque, cuando la imagen está dentro del contenido de un artículo. */
  bloque?: number
  /** El valor actual: una URL o una ruta de `/public`. */
  valor: string
  /** Título sugerido para la biblioteca. */
  titulo: string
  /** `provisional` para los placeholders. */
  tags: string[]
}

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8,64}$/.test(v)

function binario(): string {
  for (const c of [CLI, CLI_DEBUG]) if (existsSync(c)) return c
  console.error(
    `\n✗ No se encontró media-cli.\n\n` +
      `  Compilalo con:\n` +
      `    cd apps/admin/src-tauri && cargo build --release --bin media-cli\n`,
  )
  process.exit(1)
}

/** Recoge todas las referencias a imágenes que todavía no son IDs. */
async function recoger(db: Firestore): Promise<Referencia[]> {
  const out: Referencia[] = []

  const simple = async (coleccion: string, campo: string) => {
    const snap = await getDocs(collection(db, coleccion))
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>
      const valor = data[campo]
      if (typeof valor !== 'string' || !valor || esId(valor)) continue
      out.push({
        coleccion,
        documento: d.id,
        campo,
        valor,
        titulo: String(data.title ?? data.name ?? d.id),
        // Las de picsum son relleno; las de `/public` son fotos de verdad que
        // ya estaban en el sitio.
        tags: valor.startsWith('/') ? [] : ['provisional'],
      })
    }
  }

  await simple('projects', 'image')
  await simple('categories', 'image')
  await simple('articles', 'coverImage')

  // Las imágenes dentro del cuerpo de un artículo.
  const arts = await getDocs(collection(db, 'articles'))
  for (const d of arts.docs) {
    const data = d.data() as { content?: unknown; title?: string }
    const bloques = Array.isArray(data.content) ? data.content : []
    bloques.forEach((b, i) => {
      if (typeof b !== 'object' || b === null) return
      const bloque = b as Record<string, unknown>
      if (bloque.type !== 'image') return
      const valor = bloque.src ?? bloque.mediaId
      if (typeof valor !== 'string' || !valor || esId(valor)) return
      out.push({
        coleccion: 'articles',
        documento: d.id,
        campo: 'content',
        bloque: i,
        valor,
        titulo: String(bloque.caption ?? `${data.title ?? d.id} — imagen`).slice(0, 70),
        tags: valor.startsWith('/') ? [] : ['provisional'],
      })
    })
  }

  // `config/ui` → site.ogImage
  const ui = await getDoc(doc(db, 'config', 'ui'))
  const site = (ui.data()?.site ?? {}) as Record<string, unknown>
  if (typeof site.ogImage === 'string' && site.ogImage && !esId(site.ogImage)) {
    out.push({
      coleccion: 'config',
      documento: 'ui',
      campo: 'site.ogImage',
      valor: site.ogImage,
      titulo: 'Imagen al compartir',
      tags: site.ogImage.startsWith('/') ? [] : ['provisional'],
    })
  }

  return out
}

/** Deja el archivo en local y devuelve su ruta y su sha256. */
async function traer(valor: string): Promise<{ ruta: string; sha: string }> {
  mkdirSync(TMP, { recursive: true })

  let bytes: Buffer
  let nombre: string

  if (valor.startsWith('/')) {
    // Una ruta de `apps/web/public`: la foto ya está en el repo.
    const local = join('apps/web/public', valor.slice(1))
    if (!existsSync(local)) throw new Error(`no existe ${local}`)
    bytes = readFileSync(local)
    nombre = valor.slice(1)
  } else {
    const r = await fetch(valor, { redirect: 'follow' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    bytes = Buffer.from(await r.arrayBuffer())
    // picsum sirve JPEG; el nombre solo decide la extensión del temporal.
    const tipo = r.headers.get('content-type') ?? 'image/jpeg'
    const ext = tipo.includes('png') ? 'png' : tipo.includes('webp') ? 'webp' : 'jpg'
    nombre = `${createHash('sha1').update(valor).digest('hex').slice(0, 12)}.${ext}`
  }

  const ruta = join(TMP, nombre.replace(/[\\/]/g, '-'))
  writeFileSync(ruta, bytes)
  // El id del asset es el sha256 del original recortado a 16 — igual que en
  // Rust. Calcularlo acá permite saber si ya está sin procesar nada.
  return { ruta, sha: createHash('sha256').update(bytes).digest('hex') }
}

/** Escribe el valor nuevo en el documento que lo referenciaba. */
async function parchear(db: Firestore, r: Referencia, id: string): Promise<void> {
  if (r.campo === 'content' && r.bloque !== undefined) {
    const ref = doc(db, 'articles', r.documento)
    const snap = await getDoc(ref)
    const bloques = [...((snap.data()?.content ?? []) as Record<string, unknown>[])]
    const b = { ...bloques[r.bloque] }
    delete b.src
    b.mediaId = id
    bloques[r.bloque] = b
    await updateDoc(ref, { content: bloques })
    return
  }

  if (r.coleccion === 'config') {
    // `site.ogImage` vive anidado. `updateDoc` con ruta de puntos actualiza
    // solo esa clave y no pisa el resto del grupo.
    await updateDoc(doc(db, 'config', r.documento), { [r.campo]: id })
    return
  }

  await updateDoc(doc(db, r.coleccion, r.documento), { [r.campo]: id })
}

// ─────────────────────────────────────────────────────────────────────────────

const cli = binario()
const { db, auth } = await openAdminSession()
const env = readEnv()
const bucket = env.VITE_FIREBASE_STORAGE_BUCKET
if (!bucket) {
  console.error('Falta VITE_FIREBASE_STORAGE_BUCKET en .env.')
  process.exit(1)
}

const referencias = await recoger(db)
console.log(`\n${referencias.length} referencia(s) por migrar.`)
if (!referencias.length) {
  console.log('Nada que hacer.\n')
  process.exit(0)
}

const porValor = new Map<string, Referencia[]>()
for (const r of referencias) {
  const lista = porValor.get(r.valor) ?? []
  lista.push(r)
  porValor.set(r.valor, lista)
}
console.log(`${porValor.size} imagen(es) distinta(s).`)

if (!APLICAR) {
  console.log('\nMODO PRUEBA — no se escribe nada. Añadí --apply para aplicar.\n')
  for (const [valor, rs] of porValor) {
    const sitios = rs.map((r) => `${r.coleccion}/${r.documento}.${r.campo}`).join(', ')
    console.log(`  ${rs[0].tags.includes('provisional') ? '◇' : '◆'} ${valor.slice(0, 64)}`)
    console.log(`      → ${sitios}`)
  }
  console.log('\n◆ foto real   ◇ placeholder (se marcará como provisional)\n')
  process.exit(0)
}

/**
 * El token se pide POR IMAGEN, no una vez antes del bucle.
 *
 * `getIdToken()` devuelve el que ya tiene en caché y solo va a la red cuando
 * está por caducar, así que no cuesta nada. Pedirlo una vez funcionaría para
 * estas 46 (son unos tres minutos) pero un lote grande —o un re-derivado de
 * toda la biblioteca, que es para lo que existe `media-cli`— pasaría de la
 * hora de vida del token y fallaría a mitad, dejando parte migrada y parte no.
 */
const token = () => auth.currentUser!.getIdToken()

let hechas = 0
let saltadas = 0
const fallos: string[] = []

try {
  let n = 0
  for (const [valor, rs] of porValor) {
    n++
    const etiqueta = `[${n}/${porValor.size}] ${valor.slice(0, 56)}`
    try {
      const { ruta, sha } = await traer(valor)
      const id = sha.slice(0, 16)

      const ya = await getDoc(doc(db, 'media', id))
      if (ya.exists()) {
        console.log(`${etiqueta}\n  ya está en la biblioteca (${id}), solo se corrigen las referencias`)
        saltadas++
      } else {
        console.log(etiqueta)
        const salida = execFileSync(
          cli,
          [
            'import',
            '--path', ruta,
            '--out', TMP,
            '--bucket', bucket,
            '--token', await token(),
            '--title', rs[0].titulo,
            // El `alt` NO se inventa. Sin él el asset no se publica (R12), y
            // eso es correcto: una descripción automática sería peor que la
            // ausencia, porque pareceria revisada.
            ...(rs[0].tags.length ? ['--tags', rs[0].tags.join(',')] : []),
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 },
        )
        const asset = JSON.parse(salida.trim()) as { id: string }
        if (asset.id !== id) {
          throw new Error(`el id no coincide: esperado ${id}, dado ${asset.id}`)
        }
        await setDoc(doc(db, 'media', id), asset)
        hechas++
      }

      for (const r of rs) await parchear(db, r, id)
      console.log(`  ✓ ${rs.length} referencia(s) apuntando a ${id}`)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${m}`)
      fallos.push(`${valor.slice(0, 50)}: ${m}`)
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true })
}

console.log(
  `\n${hechas} importada(s), ${saltadas} ya estaba(n), ${fallos.length} con fallo.\n` +
    (fallos.length ? fallos.map((f) => `  ✗ ${f}`).join('\n') + '\n' : ''),
)
console.log(
  hechas + saltadas > 0
    ? 'Siguiente: `npm run fetch:content` para bajar la biblioteca al repo.\n'
    : '',
)
process.exit(fallos.length ? 1 : 0)
