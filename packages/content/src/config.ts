/**
 * CREDENCIALES DE FIREBASE — lectura y validación.
 *
 * Vive en el paquete compartido porque las leen TRES consumidores, cada uno con
 * una forma distinta de llegar al entorno:
 *
 *   - la web (Vite)          → `import.meta.env`, solo variables `VITE_*`
 *   - el panel (Vite/Tauri)  → `import.meta.env`, solo variables `VITE_*`
 *   - los scripts (Node)     → `process.env`, todas
 *
 * Por eso la función RECIBE el entorno en vez de leerlo: un módulo compartido
 * que tocara `import.meta.env` reventaría al importarlo desde un script de Node,
 * y uno que tocara `process.env` no existiría en el navegador. Quien llama sabe
 * en qué mundo está; este archivo no necesita saberlo.
 *
 * SOBRE EL SECRETO QUE NO LO ES: la `apiKey` de una app web de Firebase viaja en
 * texto plano dentro del bundle, y es correcto. Identifica al proyecto, no es una
 * credencial: lo que protege los datos son las reglas de seguridad. Quien la
 * extraiga puede hablar con Firestore igual que el navegador de cualquier
 * visitante — leer lo público y nada más.
 */

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

type Environment = Record<string, string | undefined>

/** Nombre de la variable de entorno para cada clave de la configuración. */
const VARIABLES = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const satisfies Record<keyof FirebaseConfig, string>

export class IncompleteConfigError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Missing Firebase environment variables: ${missing.join(', ')}.\n` +
        `Copy .env.example to .env at the repo root and fill them in from the ` +
        `Firebase console (Project settings → Your apps → Web).`,
    )
    this.name = 'IncompleteConfigError'
  }
}

/**
 * Valida y devuelve la configuración. Falla RUIDOSAMENTE y nombrando lo que
 * falta: una configuración a medias produce errores de red genéricos de Firebase
 * que no dicen nada, y se pierden horas buscando en el sitio equivocado.
 */
export function readFirebaseConfig(env: Environment): FirebaseConfig {
  const missing: string[] = []
  const out = {} as FirebaseConfig

  for (const [key, variable] of Object.entries(VARIABLES) as [keyof FirebaseConfig, string][]) {
    const value = env[variable]?.trim()
    if (!value) {
      missing.push(variable)
      continue
    }
    out[key] = value
  }

  if (missing.length) throw new IncompleteConfigError(missing)
  return out
}

/** `true` si el entorno tiene todo lo necesario. Nunca lanza. */
export function hasFirebaseConfig(env: Environment): boolean {
  return Object.values(VARIABLES).every((v) => Boolean(env[v]?.trim()))
}
