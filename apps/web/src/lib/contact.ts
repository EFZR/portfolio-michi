/**
 * ENVÍO DEL FORMULARIO DE CONTACTO.
 *
 * Aislado en su propio módulo: es la ÚNICA pieza del formulario que depende de
 * dónde esté alojada la web. Antes iba contra Netlify Forms; desde la Fase 2 va
 * a Firestore, y ni el formulario ni la vista se enteraron del cambio.
 *
 * ── POR QUÉ EL SDK SE CARGA A DEMANDA ───────────────────────────────────────
 * El resto de la web NO usa Firebase: el contenido baja en el build y se
 * empaqueta como JSON. Si este módulo importara el SDK arriba del archivo,
 * ~200 KB de Firestore entrarían en el bundle de TODAS las rutas para servir a
 * quien nunca abre el formulario. Con `import()` dinámico, solo se descarga
 * cuando alguien pulsa Enviar.
 *
 * ── EL CONTRATO CON LAS REGLAS ──────────────────────────────────────────────
 * `firestore.rules` acepta la creación de un mensaje solo si trae EXACTAMENTE
 * estas seis claves, `read` en false y `receivedAt` igual a la hora del
 * servidor. Cualquier campo de más —incluido el honeypot— hace que Firestore
 * rechace el documento entero.
 */

export interface ContactMessage {
  name: string
  email: string
  /** Uno de los tres oficios, o "otra cosa". */
  discipline: string
  message: string
  /**
   * Trampa para bots ("honeypot"). Una persona nunca lo rellena porque está
   * oculto; un bot que rellena todo lo que encuentra, sí.
   *
   * NO viaja a Firestore —las reglas cierran el conjunto de campos— así que se
   * comprueba aquí: si viene con contenido, se finge el éxito y no se escribe
   * nada. Fingir y no avisar es deliberado: decirle al bot que lo detectamos
   * solo le enseña a rellenar menos campos la próxima vez.
   */
  'bot-field'?: string
}

export async function sendMessage(data: ContactMessage): Promise<void> {
  if (data['bot-field']?.trim()) return

  const [{ initializeApp, getApps, getApp }, { getFirestore, collection, addDoc, serverTimestamp }] =
    await Promise.all([import('firebase/app'), import('firebase/firestore')])

  const NOMBRE = 'princess-web'
  const app = getApps().some((a) => a.name === NOMBRE)
    ? getApp(NOMBRE)
    : initializeApp(
        {
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId: import.meta.env.VITE_FIREBASE_APP_ID,
        },
        NOMBRE,
      )

  await addDoc(collection(getFirestore(app), 'messages'), {
    name: data.name.trim(),
    email: data.email.trim(),
    discipline: data.discipline,
    message: data.message.trim(),
    // La fecha la pone el SERVIDOR: si la eligiera quien envía, la bandeja se
    // podría desordenar a voluntad. La regla lo exige, además.
    receivedAt: serverTimestamp(),
    read: false,
  })
}
