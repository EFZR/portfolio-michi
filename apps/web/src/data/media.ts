/**
 * LA BIBLIOTECA DE MEDIOS, INDEXADA.
 *
 * Los proyectos y artículos guardan un ID; esto lo resuelve al registro
 * completo, que es lo que `<ResponsiveImage>` necesita para armar el
 * `<picture>`.
 *
 * El índice se construye UNA vez al cargar el módulo. Un `find` por cada
 * tarjeta de la galería sería O(n·m) sobre arrays que crecen juntos: con 46
 * medios y 30 proyectos no se nota, con 500 fotos sí.
 */
import { RAW } from './content'
import type { MediaAsset } from '@princess/content/media'

/**
 * El bucket sale del entorno y no del registro: es la misma constante para
 * todos los medios, y guardarla 46 veces en `content.json` solo crearía 46
 * sitios donde puede quedar desactualizada.
 */
export const MEDIA_BUCKET = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '') as string

const INDICE = new Map<string, MediaAsset>(
  (RAW.media as MediaAsset[]).map((a) => [a.id, a]),
)

/** Todos los medios, por si hace falta listarlos. */
export const MEDIA: readonly MediaAsset[] = RAW.media as MediaAsset[]

/**
 * Resuelve un ID.
 *
 * Devuelve `undefined` para un id que no está —un medio borrado de la
 * biblioteca pero todavía referenciado— en vez de lanzar: que falte una foto
 * no puede tumbar la página entera.
 */
export function medio(id: string | undefined): MediaAsset | undefined {
  if (!id) return undefined
  return INDICE.get(id)
}
