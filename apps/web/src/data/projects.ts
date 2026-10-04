/**
 * PORTAFOLIO — rubros y proyectos.
 *
 * Ya NO hay datos en este archivo. El contenido vive en Firestore y baja en el
 * prebuild a `content.json` (ver `scripts/fetch-content.ts`); aquí solo quedan
 * los TIPOS y los ayudantes, que son código y no contenido.
 *
 * Los nombres exportados son los mismos de antes a propósito: ningún componente
 * ha tenido que cambiar para pasar de literales a base de datos.
 */

import { RAW } from './content'

/** Los tres rubros. Son también los tres servicios — mismo orden y mismos ids. */
export type CategoryId = 'marketing' | 'fotografia' | 'modelaje'

/** Estado del filtro: un rubro concreto o la vista completa. */
export type FilterId = CategoryId | 'todos'

export interface Category {
  id: CategoryId
  /** Nombre visible — encabezado de la tarjeta de rubro. */
  name: string
  /** Kicker corto en mayúsculas, sobre el nombre. */
  kicker: string
  /** Una línea que explica el rubro; se revela al hover de la tarjeta. */
  description: string
  /**
   * Imagen del rubro. Son las MISMAS fotos de `ServicesSection`, servidas desde
   * `public/`: el rubro y el servicio son la misma cosa, así que reutilizarlas
   * refuerza la lectura y no añade ni un byte de descarga nueva.
   */
  image: string
  /** Los tres oficios · dos puntos · que resumen el rubro en la diapositiva. */
  tagline: string
  /** La frase bajo el titular de la diapositiva de Servicios. */
  detail: string
  /** El orden ES jerarquía, no alfabético: marketing, fotografía, modelaje. */
  order: number
}

export interface Project {
  /** Slug único — clave de `v-for` y futura ruta `/projects/:slug`. */
  id: string
  title: string
  category: CategoryId
  /** Marca ficticia para la que se hizo el trabajo. */
  client: string
  year: number
  /** Rol desempeñado en el proyecto. */
  role: string
  /** Dónde se produjo — da contexto de escala en la ficha. */
  location: string
  /** Una línea para la tarjeta del grid. */
  summary: string
  /** Párrafo de la ficha ampliada (modal). */
  description: string
  tags: readonly string[]
  image: string
}

export const CATEGORIES = RAW.categories as unknown as readonly Category[]

/** Etiqueta legible de un rubro — la usan la tarjeta del grid y la ficha. */
export function categoryName(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? id
}

export const PROJECTS = RAW.projects as unknown as readonly Project[]

/** Proyectos de un rubro, o todos si el filtro está en `todos`. */
export function projectsByFilter(filtro: FilterId): readonly Project[] {
  if (filtro === 'todos') return PROJECTS
  return PROJECTS.filter((p) => p.category === filtro)
}

/** Cuántos proyectos hay en un rubro — el contador de la tarjeta de categoría. */
export function projectCountByCategory(id: CategoryId): number {
  return PROJECTS.filter((p) => p.category === id).length
}
