import 'vue-router'

/**
 * Module augmentation: extendemos la interfaz RouteMeta de Vue Router
 * para tipar los metadatos personalizados de nuestras rutas.
 * Así `route.meta.title` deja de ser `unknown` y pasa a ser `string`.
 */
declare module 'vue-router' {
  interface RouteMeta {
    title: string
    description?: string
  }
}

export {}
