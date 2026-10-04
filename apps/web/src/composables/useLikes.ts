import { computed, type ComputedRef } from 'vue'
import { useStorage } from '@vueuse/core'

/**
 * Likes del blog, persistidos en el navegador.
 *
 * SINGLETON A NIVEL DE MÓDULO, y es lo importante de este archivo: el estado se
 * crea una vez al importar, no una por componente. Así el corazón de una
 * tarjeta del listado y el de la vista de detalle son el MISMO dato — si se
 * creara dentro de `useLikes()`, cada tarjeta tendría su copia y volver atrás
 * desde el artículo mostraría el like apagado.
 *
 * `useStorage` de VueUse se encarga de leer, escribir y serializar, y además
 * sincroniza entre pestañas por el evento `storage`. También sobrevive a que
 * `localStorage` no esté disponible (modo privado, cookies bloqueadas): en ese
 * caso se comporta como un `ref` normal y la sesión sigue funcionando, solo que
 * sin recordar nada.
 *
 * Es estado de ESTE navegador, no del mundo: el contador que se ve es el
 * `likesCount` del artículo más el voto propio. Cuando exista base de datos,
 * `total()` es lo único que hay que cambiar.
 */
const CLAVE = 'princess-portfolio:articulos-gustados'

const gustados = useStorage<string[]>(CLAVE, [])

export interface UseLikesReturn {
  /** Ids con like, como conjunto — lectura O(1) desde cualquier tarjeta. */
  conjunto: ComputedRef<Set<string>>
  gusta: (id: string) => boolean
  alternar: (id: string) => void
  /** Contador visible: el del artículo más el voto de quien mira. */
  total: (id: string, base: number) => number
}

export function useLikes(): UseLikesReturn {
  const conjunto = computed(() => new Set(gustados.value))

  const gusta = (id: string) => conjunto.value.has(id)

  function alternar(id: string) {
    // Se reasigna el array entero en vez de mutarlo: `useStorage` observa la
    // referencia, y un `push` no dispararía la escritura en localStorage.
    gustados.value = gusta(id) ? gustados.value.filter((x) => x !== id) : [...gustados.value, id]
  }

  const total = (id: string, base: number) => base + (gusta(id) ? 1 : 0)

  return { conjunto, gusta, alternar, total }
}
