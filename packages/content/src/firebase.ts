/**
 * CLIENTE ÚNICO DE FIREBASE.
 *
 * `initializeApp` lanza si se llama dos veces con el mismo nombre, y en un
 * monorepo donde la web y el panel comparten este módulo es fácil que pase
 * (HMR de Vite remonta módulos, y cada `import` de una vista podría reinicializar).
 * Por eso se memoiza: una app por proceso, creada la primera vez que hace falta.
 *
 * El entorno se PASA, no se lee aquí — misma razón que en `config.ts`: este
 * módulo lo importan el navegador y Node, y `import.meta.env` solo existe en uno.
 */

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { readFirebaseConfig } from './config'

type Environment = Record<string, string | undefined>

const NOMBRE_APP = 'princess'

export function getFirebase(env: Environment): FirebaseApp {
  return getApps().some((a) => a.name === NOMBRE_APP)
    ? getApp(NOMBRE_APP)
    : initializeApp(readFirebaseConfig(env), NOMBRE_APP)
}

export function getFirebaseAuth(env: Environment): Auth {
  return getAuth(getFirebase(env))
}

export function getFirestoreDb(env: Environment): Firestore {
  return getFirestore(getFirebase(env))
}

export function getFirebaseStorage(env: Environment): FirebaseStorage {
  return getStorage(getFirebase(env))
}

/**
 * Persistencia de la sesión, explícita.
 *
 * En web `browserLocalPersistence` ya es el valor por defecto, pero en el
 * webview de Tauri el origen es un esquema propio (`tauri://localhost`) y el
 * almacenamiento se comporta de forma menos predecible. Dejarlo escrito evita
 * el síntoma peor de todos: que la sesión se pierda al cerrar la ventana y
 * nadie sepa si es un fallo o «así funciona».
 */
export async function enablePersistentSession(env: Environment): Promise<Auth> {
  const auth = getFirebaseAuth(env)
  await setPersistence(auth, browserLocalPersistence)
  return auth
}
