/**
 * Utilidades de fecha del blog: antigüedad y formato legible.
 *
 * Todo sale de aquí para que "reciente" signifique lo mismo en la tarjeta, en
 * el listado y en la vista de detalle. Un umbral copiado en tres sitios es un
 * umbral que acaba valiendo tres cosas distintas.
 */

import { UI } from '@/data/ui'

/**
 * Umbrales de antigüedad. Salen de `config/ui` porque son PARÁMETROS
 * editoriales, no constantes de código: qué significa "nuevo" lo decide quien
 * escribe, no quien programa.
 */

/** Un artículo es "nuevo" durante esta ventana desde su publicación. */
export const RECENT_DAYS = UI.blog.recentDays

/** A partir de aquí se considera archivo y se pinta en tono sobrio. */
export const ARCHIVE_DAYS = UI.blog.archiveDays

const MS_PER_DAY = 86_400_000

/**
 * Convierte "2026-09-18" en una fecha LOCAL.
 *
 * `new Date('2026-09-18')` la interpretaría como medianoche UTC y, en cualquier
 * huso al oeste de Greenwich (Honduras es UTC-6), al leerla en local saldría el
 * día anterior. Un artículo publicado hoy aparecería fechado ayer y, peor, el
 * cálculo de "reciente" se desplazaría un día entero.
 */
export function toDate(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/** Días completos transcurridos desde la publicación. Nunca negativo. */
export function daysSince(iso: string, hoy: Date = new Date()): number {
  const publicado = toDate(iso)
  const referencia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.floor((referencia.getTime() - publicado.getTime()) / MS_PER_DAY))
}

export function isRecent(iso: string, hoy?: Date): boolean {
  return daysSince(iso, hoy) <= RECENT_DAYS
}

export function isArchived(iso: string, hoy?: Date): boolean {
  return daysSince(iso, hoy) >= ARCHIVE_DAYS
}

const LARGO = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' })
const CORTO = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

/** "18 de septiembre de 2026" — para la ficha del artículo. */
export function longDate(iso: string): string {
  return LARGO.format(toDate(iso))
}

/** "18 sept 2026" en mayúsculas — para las líneas de metadatos en mono. */
export function shortDate(iso: string): string {
  return CORTO.format(toDate(iso)).replace(/\./g, '').toUpperCase()
}

/**
 * "hace 3 días", "hace 2 meses". Complementa a la fecha exacta, no la
 * sustituye: lo relativo se entiende de un vistazo, lo absoluto sitúa.
 */
export function timeAgo(iso: string, hoy?: Date): string {
  const dias = daysSince(iso, hoy)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anios = Math.floor(dias / 365)
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`
}
