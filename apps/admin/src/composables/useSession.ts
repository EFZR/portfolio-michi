import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { enablePersistentSession, getFirebaseAuth } from '@princess/content'
import { readonly, ref, type Ref } from 'vue'

/**
 * SESIÓN DEL ADMINISTRADOR.
 *
 * Singleton a nivel de módulo, igual que `useLikes` en la web: el estado se crea
 * una vez al importar, no una por componente. Si se creara dentro de la función,
 * cada vista tendría su propia copia del usuario y una pantalla podría creerse
 * autenticada mientras otra no.
 *
 * `cargando` empieza en `true` a propósito. Firebase resuelve la sesión guardada
 * de forma ASÍNCRONA: durante ese primer instante `usuario` es `null`, que es
 * indistinguible de «no ha entrado». Sin este flag, el panel parpadearía a la
 * pantalla de login en cada arranque antes de restaurar la sesión.
 */
const usuario: Ref<User | null> = ref(null)
const cargando = ref(true)
const error = ref('')

let iniciado = false

/**
 * Los códigos de Firebase son para el que programa, no para quien los lee.
 * `auth/invalid-credential` no le dice nada a nadie; además Firebase lo devuelve
 * tanto si el correo no existe como si la contraseña está mal — a propósito,
 * para no revelar qué cuentas existen. El mensaje respeta esa ambigüedad.
 */
function mensajeDeError(codigo: string): string {
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.'
    case 'auth/invalid-email':
      return 'Ese correo no parece completo, revísalo.'
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.'
    case 'auth/network-request-failed':
      return 'No hay conexión con Firebase. Revisa la red y vuelve a intentarlo.'
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
      return 'La clave de Firebase del .env no es válida para este proyecto.'
    default:
      return `No se pudo entrar (${codigo}).`
  }
}

function codigoDe(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : 'desconocido'
}

export interface UseSessionReturn {
  usuario: Readonly<Ref<User | null>>
  cargando: Readonly<Ref<boolean>>
  error: Readonly<Ref<string>>
  entrar: (correo: string, clave: string) => Promise<boolean>
  salir: () => Promise<void>
}

export function useSession(): UseSessionReturn {
  // El observador se engancha UNA vez, en la primera llamada. Engancharlo en el
  // ámbito del módulo obligaría a tener credenciales válidas con solo importar
  // el archivo, y entonces la pantalla de "faltan credenciales" no llegaría a pintarse.
  if (!iniciado) {
    iniciado = true
    enablePersistentSession(import.meta.env)
      .then((auth) => {
        onAuthStateChanged(auth, (u) => {
          usuario.value = u
          cargando.value = false
        })
      })
      .catch((e) => {
        error.value = mensajeDeError(codigoDe(e))
        cargando.value = false
      })
  }

  async function entrar(correo: string, clave: string): Promise<boolean> {
    error.value = ''
    try {
      const auth = getFirebaseAuth(import.meta.env)
      await signInWithEmailAndPassword(auth, correo.trim(), clave)
      return true
    } catch (e) {
      error.value = mensajeDeError(codigoDe(e))
      return false
    }
  }

  async function salir(): Promise<void> {
    await signOut(getFirebaseAuth(import.meta.env))
  }

  return {
    usuario: readonly(usuario) as Readonly<Ref<User | null>>,
    cargando: readonly(cargando),
    error: readonly(error),
    entrar,
    salir,
  }
}
