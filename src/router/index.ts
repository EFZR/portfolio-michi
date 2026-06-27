import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterScrollBehavior,
} from 'vue-router'

/**
 * Rutas declaradas con `RouteRecordRaw[]` para tipado explícito.
 * Cada componente se carga con `() => import(...)` para que Vite haga
 * code splitting automático: el bundle inicial solo contiene el código
 * de la ruta activa, lo demás se descarga on-demand.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Princess Portfolio — Inicio' },
  },
  {
    path: '/projects/:slug',
    name: 'project-detail',
    component: () => import('@/views/ProjectDetailView.vue'),
    meta: { title: 'Proyecto · Princess Portfolio' },
  },
  {
    path: '/blog',
    name: 'blog',
    component: () => import('@/views/BlogView.vue'),
    meta: { title: 'Blog · Princess Portfolio' },
  },
  {
    path: '/blog/:slug',
    name: 'blog-post',
    component: () => import('@/views/BlogPostView.vue'),
    meta: { title: 'Artículo · Princess Portfolio' },
  },
  {
    // Catch-all 404. `pathMatch(.*)*` captura cualquier URL no resuelta antes.
    // Debe ir SIEMPRE al final del array para que las rutas concretas tengan prioridad.
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '404 · Página no encontrada' },
  },
]

/**
 * scrollBehavior es clave en una arquitectura híbrida (Home con scroll + rutas internas):
 *   1. `savedPosition` → al usar back/forward del navegador, restaura el scroll previo.
 *   2. `to.hash` → links como `/#projects` hacen scroll suave a esa sección,
 *      con offset `top: 80` para compensar la navbar fija que añadiremos en 1.3b.
 *   3. Default → cualquier cambio de ruta normal vuelve al tope.
 */
const scrollBehavior: RouterScrollBehavior = (to, _from, savedPosition) => {
  if (savedPosition) return savedPosition
  if (to.hash) return { el: to.hash, behavior: 'smooth', top: 80 }
  return { top: 0 }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior,
})

/**
 * Guard global: actualiza `document.title` con el meta.title de la ruta.
 * Lo hacemos en `afterEach` (no `beforeEach`) porque el cambio ya está confirmado;
 * no queremos cambiar el título si la navegación termina cancelándose.
 */
router.afterEach((to) => {
  document.title = to.meta.title
})

export default router
