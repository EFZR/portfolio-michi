/**
 * CATÁLOGO DE SERVICIOS — el desglose del modal de `ServicesSection`.
 *
 * Baja de Firestore en el prebuild. Aquí solo los tipos.
 */

import { RAW } from './content'

export interface CatalogItem {
  name: string
  description: string
}

export interface CatalogGroup {
  /** El mismo id que el rubro en `CATEGORIES`. */
  id: string
  title: string
  /** Kicker corto bajo el título del grupo. */
  note: string
  items: readonly CatalogItem[]
}

export const CATALOG = RAW.catalog as unknown as readonly CatalogGroup[]
