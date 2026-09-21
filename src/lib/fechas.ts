/**
 * Utilidades de fecha del blog: antigüedad y formato legible.
 *
 * Todo sale de aquí para que "reciente" signifique lo mismo en la tarjeta, en
 * el listado y en la vista de detalle. Un umbral copiado en tres sitios es un
 * umbral que acaba valiendo tres cosas distintas.
 */

/** Un artículo es "nuevo" durante esta ventana desde su publicación. */
export const DIAS_RECIENTE = 7

/** A partir de aquí se considera archivo y se pinta en tono sobrio. */
export const DIAS_ARCHIVO = 365

const MS_POR_DIA = 86_400_000

/**
 * Convierte "2026-09-18" en una fecha LOCAL.
 *
 * `new Date('2026-09-18')` la interpretaría como medianoche UTC y, en cualquier
 * huso al oeste de Greenwich (Honduras es UTC-6), al leerla en local saldría el
 * día anterior. Un artículo publicado hoy aparecería fechado ayer y, peor, el
 * cálculo de "reciente" se desplazaría un día entero.
 */
export function aFecha(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/** Días completos transcurridos desde la publicación. Nunca negativo. */
export function diasDesde(iso: string, hoy: Date = new Date()): number {
  const publicado = aFecha(iso)
  const referencia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.floor((referencia.getTime() - publicado.getTime()) / MS_POR_DIA))
}

export function esReciente(iso: string, hoy?: Date): boolean {
  return diasDesde(iso, hoy) <= DIAS_RECIENTE
}

export function esArchivo(iso: string, hoy?: Date): boolean {
  return diasDesde(iso, hoy) >= DIAS_ARCHIVO
}

const LARGO = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' })
const CORTO = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

/** "18 de septiembre de 2026" — para la ficha del artículo. */
export function fechaLarga(iso: string): string {
  return LARGO.format(aFecha(iso))
}

/** "18 sept 2026" en mayúsculas — para las líneas de metadatos en mono. */
export function fechaCorta(iso: string): string {
  return CORTO.format(aFecha(iso)).replace(/\./g, '').toUpperCase()
}

/**
 * "hace 3 días", "hace 2 meses". Complementa a la fecha exacta, no la
 * sustituye: lo relativo se entiende de un vistazo, lo absoluto sitúa.
 */
export function haceCuanto(iso: string, hoy?: Date): string {
  const dias = diasDesde(iso, hoy)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anios = Math.floor(dias / 365)
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`
}
