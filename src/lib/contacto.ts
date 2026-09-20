/**
 * ENVÍO DEL FORMULARIO DE CONTACTO.
 *
 * Aislado en su propio módulo a propósito: es la ÚNICA pieza del formulario que
 * depende de dónde esté alojada la web. El día que el contacto pase a Firestore
 * (la Fase 2 del proyecto) se reescribe esta función y ni el formulario ni la
 * vista se enteran.
 *
 * Hoy va contra NETLIFY FORMS, que no necesita servidor propio. Funciona así:
 *
 *  1. Netlify rastrea el HTML PUBLICADO en busca de formularios con el atributo
 *     `netlify`. Como esto es una SPA y el formulario de verdad lo pinta Vue en
 *     tiempo de ejecución, el rastreador nunca lo vería: por eso hay una copia
 *     estática y oculta en `index.html`. Los `name` de los campos deben coincidir
 *     EXACTAMENTE con los de aquí, o Netlify descarta el envío.
 *  2. El envío es un POST a la raíz del sitio, codificado como formulario
 *     clásico, con un campo `form-name` que dice a cuál pertenece.
 *
 * EN DESARROLLO LOCAL ESTO FALLA, y es lo esperado: el servidor de Vite no
 * implementa el endpoint de Netlify. La vista trata el fallo como tal y ofrece
 * el correo directo, así que nadie se queda sin poder escribir.
 */

/** Debe coincidir con el `name` del formulario oculto de `index.html`. */
export const NOMBRE_FORMULARIO = 'contacto'

export interface MensajeContacto {
  nombre: string
  email: string
  /** Uno de los tres oficios, o "otra cosa". */
  oficio: string
  mensaje: string
  /**
   * Trampa para bots ("honeypot"). Una persona nunca lo rellena porque está
   * oculto; un bot que rellena todo lo que encuentra, sí. Netlify descarta el
   * envío si viene con contenido. Va aquí y no en el componente porque es parte
   * del contrato con el servicio, no de la interfaz.
   */
  'bot-field'?: string
}

export async function enviarMensaje(datos: MensajeContacto): Promise<void> {
  const cuerpo = new URLSearchParams({
    'form-name': NOMBRE_FORMULARIO,
    nombre: datos.nombre,
    email: datos.email,
    oficio: datos.oficio,
    mensaje: datos.mensaje,
    'bot-field': datos['bot-field'] ?? '',
  })

  const respuesta = await fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString(),
  })

  // `fetch` solo rechaza ante un fallo de red: un 404 o un 500 llegan como
  // respuesta "correcta". Sin esta comprobación, un formulario mal configurado
  // en Netlify mostraría "enviado" sin haber enviado nada.
  if (!respuesta.ok) {
    throw new Error(`El envío devolvió ${respuesta.status}`)
  }
}
