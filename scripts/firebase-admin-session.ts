/**
 * Sesión de administradora para los scripts.
 *
 * Usa el MISMO SDK de cliente que el panel y la web — no hay Admin SDK en este
 * proyecto, y por tanto tampoco credenciales de servicio con privilegios
 * globales. El script escribe con exactamente los mismos permisos que tendría
 * Karol desde la app: si una regla lo bloquea aquí, lo bloquearía también allí.
 * Es una ventaja, no una limitación — los scripts no pueden saltarse las reglas
 * «porque son scripts».
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { askPassword, readEnv } from './env'

export interface AdminSession {
  db: Firestore
  auth: Auth
  uid: string
  projectId: string
}

export async function openAdminSession(): Promise<AdminSession> {
  const env = readEnv()
  const email = env.FIREBASE_ADMIN_EMAIL
  const projectId = env.VITE_FIREBASE_PROJECT_ID

  if (!email || !projectId) {
    console.error('Faltan FIREBASE_ADMIN_EMAIL o VITE_FIREBASE_PROJECT_ID en .env.')
    process.exit(1)
  }

  const app = initializeApp(
    {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    },
    'scripts',
  )

  const auth = getAuth(app)
  const password = await askPassword(`Contraseña de ${email}: `)

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return { db: getFirestore(app), auth, uid: cred.user.uid, projectId }
  } catch (e) {
    const code = (e as { code?: string }).code ?? String(e)
    console.error(
      code === 'auth/invalid-credential'
        ? 'Correo o contraseña incorrectos.'
        : `No se pudo entrar (${code}).`,
    )
    process.exit(1)
  }
}
