/**
 * TESTS DE LAS REGLAS DE SEGURIDAD.
 *
 * Con SDK de cliente, las reglas SON el backend. Sin tests, «están bien» es una
 * suposición sobre el único archivo del proyecto que separa a los datos de
 * internet.
 *
 * Corren contra el emulador, nunca contra el proyecto real: el `projectId`
 * empieza por `demo-`, y Firebase garantiza que esos ids no salen a la red.
 * Se lanzan con `npm run test:rules`, que levanta y apaga el emulador solo.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const ADMIN_UID = 'P6sA78EI10QVrPDbg0CAxEL1f8o2'
const OTRO_UID = 'intruso-con-cuenta-valida'

let env: RulesTestEnvironment

/** Contexto de la administradora. */
const admin = () => env.authenticatedContext(ADMIN_UID).firestore()
/** Alguien autenticado que NO es la admin — el caso que más se olvida probar. */
const otro = () => env.authenticatedContext(OTRO_UID).firestore()
/** Un visitante cualquiera. */
const anon = () => env.unauthenticatedContext().firestore()

const ARTICULO = {
  title: 'Prueba',
  slug: 'prueba',
  likesCount: 10,
  priority: 'normal',
  borrador: false,
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-princess-rules',
    firestore: {
      rules: readFileSync(fileURLToPath(new URL('./firestore.rules', import.meta.url)), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  // Semilla sin reglas: prepara el estado del que parten los tests de update.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'articles/prueba'), ARTICULO)
    await setDoc(doc(db, 'projects/prueba'), { title: 'Proyecto' })
    await setDoc(doc(db, 'schemas/contact'), { version: 1 })
    await setDoc(doc(db, 'messages/uno'), { name: 'X' })
  })
})

describe('lectura pública', () => {
  it('cualquiera lee artículos, proyectos y configuración', async () => {
    const db = anon()
    await assertSucceeds(getDoc(doc(db, 'articles/prueba')))
    await assertSucceeds(getDoc(doc(db, 'projects/prueba')))
    await assertSucceeds(getDoc(doc(db, 'config/ui')))
  })

  it('los esquemas NO son públicos', async () => {
    await assertFails(getDoc(doc(anon(), 'schemas/contact')))
  })

  it('los mensajes NO son públicos — llevan el correo de quien escribe', async () => {
    await assertFails(getDoc(doc(anon(), 'messages/uno')))
  })
})

describe('escritura de contenido', () => {
  it('un anónimo no escribe nada', async () => {
    await assertFails(setDoc(doc(anon(), 'projects/nuevo'), { title: 'x' }))
    await assertFails(setDoc(doc(anon(), 'config/ui'), { x: 1 }))
    await assertFails(deleteDoc(doc(anon(), 'articles/prueba')))
  })

  it('estar autenticado NO basta: solo el UID de la admin', async () => {
    await assertFails(setDoc(doc(otro(), 'projects/nuevo'), { title: 'x' }))
    await assertFails(setDoc(doc(otro(), 'schemas/contact'), { version: 2 }))
  })

  it('la admin escribe contenido y esquemas', async () => {
    const db = admin()
    await assertSucceeds(setDoc(doc(db, 'projects/nuevo'), { title: 'x' }))
    await assertSucceeds(setDoc(doc(db, 'config/ui'), { hero: {} }))
    await assertSucceeds(setDoc(doc(db, 'schemas/contact'), { version: 2 }))
  })
})

describe('el contador de likes', () => {
  it('un anónimo puede sumar exactamente 1', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'articles/prueba'), { likesCount: 11 }))
  })

  it('pero no 2, ni restar, ni fijar un número inventado', async () => {
    await assertFails(updateDoc(doc(anon(), 'articles/prueba'), { likesCount: 12 }))
    await assertFails(updateDoc(doc(anon(), 'articles/prueba'), { likesCount: 9 }))
    await assertFails(updateDoc(doc(anon(), 'articles/prueba'), { likesCount: 5000 }))
  })

  it('ni colar otro campo aprovechando el +1', async () => {
    await assertFails(
      updateDoc(doc(anon(), 'articles/prueba'), { likesCount: 11, title: 'Secuestrado' }),
    )
  })

  it('la admin edita el artículo pero NO el contador', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'articles/prueba'), { title: 'Otro' }))
    await assertFails(updateDoc(doc(admin(), 'articles/prueba'), { likesCount: 999 }))
  })
})

describe('el formulario de contacto', () => {
  const valido = {
    name: 'Karol',
    email: 'k@example.com',
    discipline: 'fotografia',
    message: 'Hola, quiero una sesión editorial para la marca.',
    receivedAt: serverTimestamp(),
    read: false,
  }

  it('cualquiera puede enviar un mensaje válido', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'messages/nuevo'), valido))
  })

  it('no se aceptan campos de más', async () => {
    await assertFails(setDoc(doc(anon(), 'messages/x'), { ...valido, isAdmin: true }))
  })

  it('no se aceptan mensajes de dos palabras ni campos vacíos', async () => {
    await assertFails(setDoc(doc(anon(), 'messages/x'), { ...valido, message: 'hola' }))
    await assertFails(setDoc(doc(anon(), 'messages/x'), { ...valido, name: '' }))
  })

  it('no se puede marcar como leído al crearlo', async () => {
    await assertFails(setDoc(doc(anon(), 'messages/x'), { ...valido, read: true }))
  })

  it('la fecha la pone el servidor, no quien envía', async () => {
    await assertFails(
      setDoc(doc(anon(), 'messages/x'), { ...valido, receivedAt: new Date('2020-01-01') }),
    )
  })

  it('quien envía no puede releer ni borrar lo enviado; la admin sí', async () => {
    await assertFails(getDoc(doc(anon(), 'messages/uno')))
    await assertFails(deleteDoc(doc(anon(), 'messages/uno')))
    await assertSucceeds(getDoc(doc(admin(), 'messages/uno')))
  })
})

describe('el cierre', () => {
  it('una colección no declarada está prohibida hasta para la admin', async () => {
    await assertFails(getDoc(doc(anon(), 'inventada/x')))
    await assertFails(setDoc(doc(admin(), 'inventada/x'), { a: 1 }))
  })
})
