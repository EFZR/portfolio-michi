import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

export interface UseCustomCursorReturn {
  /** Posición renderizada del cursor (lerp suave de la posición real del mouse) */
  x: Ref<number>
  y: Ref<number>
  /** Escala del cursor — 1 normal, ~2.5 sobre elementos con data-cursor="grow" */
  scale: Ref<number>
  /** Solo true en dispositivos con mouse (pointer: fine). En touch queda false. */
  isEnabled: Ref<boolean>
}

/**
 * Composable global del cursor custom (puntito UV que reemplaza el cursor del sistema).
 *
 * Comportamiento:
 *  - Track de mousemove con interpolación lerp para que el cursor "siga" suavemente.
 *  - Detección de hover sobre elementos con `data-cursor="grow"` → escala 2.5x.
 *  - Solo activo en dispositivos `pointer: fine` (escritorio con mouse).
 *  - Cuando activo, oculta el cursor del sistema añadiendo `cursor-hidden` al <html>.
 *
 * Diseñado para ser instanciado una sola vez por <AppCursor> en MainLayout.
 */
export function useCustomCursor(): UseCustomCursorReturn {
  const targetX = ref(0)
  const targetY = ref(0)
  const x = ref(0)
  const y = ref(0)
  const scale = ref(1)
  const isEnabled = ref(false)

  let rafId: number | null = null

  /**
   * Loop de animación con requestAnimationFrame.
   * Lerp factor 0.18 — equilibrio entre smooth y responsive
   * (más bajo = más lento; más alto = más cercano al mouse exacto).
   */
  function tick() {
    const lerp = 0.18
    x.value += (targetX.value - x.value) * lerp
    y.value += (targetY.value - y.value) * lerp
    rafId = requestAnimationFrame(tick)
  }

  // Track mousemove en window — useEventListener limpia automáticamente al desmontar.
  useEventListener(window, 'mousemove', (e: MouseEvent) => {
    targetX.value = e.clientX
    targetY.value = e.clientY
  })

  // Detectar entrada/salida en elementos con data-cursor="grow".
  // Usamos delegación en document (sin registrar 1 listener por target).
  useEventListener(document, 'mouseover', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest?.('[data-cursor="grow"]')) {
      scale.value = 2.5
    }
  })

  useEventListener(document, 'mouseout', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest?.('[data-cursor="grow"]')) {
      scale.value = 1
    }
  })

  onMounted(() => {
    // pointer: fine indica un dispositivo apuntador preciso (mouse, trackpad).
    // En touch (coarse), no hay mouse → no encendemos el cursor custom.
    if (window.matchMedia('(pointer: fine)').matches) {
      isEnabled.value = true
      document.documentElement.classList.add('cursor-hidden')
      rafId = requestAnimationFrame(tick)
    }
  })

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    document.documentElement.classList.remove('cursor-hidden')
  })

  return { x, y, scale, isEnabled }
}
