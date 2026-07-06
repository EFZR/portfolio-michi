import { computed, readonly, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useScroll, useThrottleFn } from '@vueuse/core'

export type ScrollDirection = 'up' | 'down' | null

export interface UseScrollDirectionOptions {
  /**
   * Píxeles desde el tope para considerar que estamos "en el borde superior".
   * Por debajo de este valor, `isAtTop` es true → el navbar muestra el layout
   * completo (logo + items inline + CTA). Default 80.
   */
  topThreshold?: number
  /**
   * Mínimo delta de scroll (px) antes de actualizar la dirección.
   * Filtra micro-movimientos del trackpad que harían parpadear el navbar.
   * Default 8.
   */
  jitterThreshold?: number
}

export interface UseScrollDirectionReturn {
  /** Posición vertical actual del scroll en px. */
  scrollY: Readonly<Ref<number>>
  /**
   * Dirección del último movimiento significativo:
   *   'down' → el usuario scrolleó hacia abajo (navbar se oculta)
   *   'up'   → scrolleó hacia arriba (navbar reaparece contraído)
   *   null   → aún no ha habido scroll significativo
   */
  direction: Readonly<Ref<ScrollDirection>>
  /** True mientras `scrollY ≤ topThreshold` — usar para el estado "en el Hero". */
  isAtTop: ComputedRef<boolean>
}

/**
 * Composable que expone la posición y dirección del scroll de la ventana,
 * pensado para impulsar comportamientos tipo "hide on scroll down, show on
 * scroll up" (estilo Bogdan / Linear / Vercel).
 *
 * Decisiones técnicas:
 *  - Usa `useScroll` de @vueuse para auto-cleanup del listener al desmontar.
 *  - Usa `useThrottleFn` (50 ms) para no recalcular dirección en cada frame:
 *    con scroll suave el `scroll` event puede dispararse 60 veces/seg.
 *  - El `jitterThreshold` evita que un microscroll de 1-2 px (típico del
 *    trackpad de Mac al hacer hover sobre un link) flipee la dirección.
 *  - Devuelve refs `readonly` para que el caller no pueda mutarlas — la única
 *    fuente de verdad es el evento de scroll real.
 */
export function useScrollDirection(
  options: UseScrollDirectionOptions = {},
): UseScrollDirectionReturn {
  const { topThreshold = 80, jitterThreshold = 8 } = options

  const { y } = useScroll(window)

  const direction = ref<ScrollDirection>(null)
  // Cacheamos el último y "comprometido" (el que ya pasó el jitter filter)
  // — comparar contra él garantiza que pequeños tirones no acumulen sesgo.
  let lastCommittedY = 0

  const updateDirection = useThrottleFn((current: number) => {
    const delta = current - lastCommittedY
    if (Math.abs(delta) < jitterThreshold) return
    direction.value = delta > 0 ? 'down' : 'up'
    lastCommittedY = current
  }, 50)

  watch(y, (newY) => updateDirection(newY))

  const isAtTop = computed(() => y.value <= topThreshold)

  return {
    scrollY: readonly(y),
    direction: readonly(direction),
    isAtTop,
  }
}
