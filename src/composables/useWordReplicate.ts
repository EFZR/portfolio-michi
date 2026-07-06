import { onUnmounted, type Ref } from 'vue'
import { gsap } from 'gsap'
import { useEventListener } from '@vueuse/core'

export interface UseWordReplicateOptions {
  /** El contenedor donde se trackea el mouse y se renderizan las réplicas */
  container: Ref<HTMLElement | null>
  /** La palabra que se va a replicar */
  word: string
  /** Throttle en ms entre cada réplica nueva (default 80) */
  throttleMs?: number
  /** Cap máximo de réplicas vivas simultáneamente (default 50) */
  maxReplicas?: number
  /**
   * z-index aplicado a cada réplica dentro del stacking context del container.
   * Úsalo para posicionar las réplicas entre capas específicas (ej. detrás de
   * una imagen pero delante de un H1). Si se omite, no se setea z-index.
   */
  zIndex?: number
}

/**
 * Composable del efecto word-replicate:
 *  - Al mover el mouse dentro del `container`, "estampa" una réplica de `word`
 *    en la posición del cursor (throttled).
 *  - Cada réplica flota 1s en su posición, luego cae con gravedad realista
 *    (GSAP `ease: power3.in`) hasta el bottom del container, y se desvanece.
 *  - Cap máximo de réplicas simultáneas para evitar memory leak si el usuario
 *    obsesivo mueve el cursor sin parar.
 *  - Respeta `prefers-reduced-motion`: si el usuario tiene esa preferencia,
 *    el efecto se desactiva por completo (accesibilidad).
 *
 * Nota técnica: las réplicas se crean con `document.createElement` directamente
 * y se manipulan fuera del ciclo reactivo de Vue. Esto es deliberado:
 *  - Son nodos efímeros, no necesitan reactivity.
 *  - Renderizar 50 spans con `v-for` y refs reactivas sería overhead innecesario.
 *  - GSAP transforma directamente el DOM, no atraviesa Vue.
 */
export function useWordReplicate(options: UseWordReplicateOptions): void {
  const { container, word, throttleMs = 80, maxReplicas = 60, zIndex } = options

  // Plain array — manipulación DOM directa, sin reactividad
  const liveReplicas: HTMLSpanElement[] = []
  let lastSpawnAt = 0

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function spawnReplica(x: number, y: number) {
    if (prefersReducedMotion) return

    const now = performance.now()
    if (now - lastSpawnAt < throttleMs) return
    lastSpawnAt = now

    const containerEl = container.value
    if (!containerEl) return

    // Cap: si excede el límite, quitamos la réplica más vieja
    if (liveReplicas.length >= maxReplicas) {
      const oldest = liveReplicas.shift()
      if (oldest) {
        gsap.killTweensOf(oldest)
        oldest.remove()
      }
    }

    const rotation = (Math.random() - 0.5) * 80 // -40° a +40° (rango pronunciado, estilo Bogdan)
    const scale = 0.6 + Math.random() * 0.7 // 0.8 a 1.7 (rango amplio para variedad visual)

    // Wrapper: contiene la posición, rotación y scale base.
    // Las letras hijas viven dentro y se animan individualmente en el entry.
    const el = document.createElement('span')
    el.setAttribute('aria-hidden', 'true')
    // El texto real lo lee AT por aria-label en el wrapper (las letras hijas
    // son aria-hidden por herencia, así que un screen reader no las deletrea).
    el.setAttribute('aria-label', word)

    Object.assign(el.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
      color: 'var(--color-primary)',
      fontFamily: 'var(--font-heading)',
      fontWeight: '600',
      fontSize: 'clamp(2.5rem, 6vw, 7rem)',
      fontStyle: 'italic',
      letterSpacing: '-0.02em',
      pointerEvents: 'none',
      willChange: 'transform, opacity',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>)
    // z-index se setea aparte porque es opcional — dejarlo undefined en un
    // Object.assign lo asignaría literalmente como la string "undefined".
    if (zIndex !== undefined) el.style.zIndex = String(zIndex)

    // Split por letra: cada char en su propio span inline-block.
    // `inline-block` es obligatorio — sin él, `transform: scale()` no aplica
    // a inline elements. Iterar con `for...of` respeta surrogate pairs UTF-16
    // (importante si la palabra tuviera emojis o caracteres extendidos).
    const letterEls: HTMLSpanElement[] = []
    for (const char of word) {
      const letter = document.createElement('span')
      // Espacios colapsan en inline-block — sustituir por NBSP para preservar gap.
      letter.textContent = char === ' ' ? ' ' : char
      Object.assign(letter.style, {
        display: 'inline-block',
        willChange: 'transform, opacity',
      } satisfies Partial<CSSStyleDeclaration>)
      el.appendChild(letter)
      letterEls.push(letter)
    }

    containerEl.appendChild(el)
    liveReplicas.push(el)

    // Distancia hasta el "suelo" del container (con margen inferior de 60px)
    const containerRect = containerEl.getBoundingClientRect()
    const floor = containerRect.height - 60
    const fallDistance = floor - y

    // Timeline de 4 fases:
    //   0. Entry stagger 0.5s — cada letra emerge desde scale 0 con overshoot
    //      `back.out(2.5)` (rebote juguetón ~120% antes de aterrizar en 100%).
    //      Stagger 0.06s entre letras → la palabra completa entra en ~0.5s+(N-1)*0.06.
    //   1. Float 1s con leve subida (drift -10px) → sensación de ingravidez.
    //   2. Caída 1.5s con `power3.in` → acceleration realista.
    //   3. Fade out 0.3s solapado con el final de la caída.
    //
    // Las fases 1-3 operan sobre el wrapper (`el`) para que la palabra caiga
    // como bloque cohesivo. La fase 0 opera sobre `letterEls` individualmente.
    gsap
      .timeline({
        onComplete: () => {
          const idx = liveReplicas.indexOf(el)
          if (idx !== -1) liveReplicas.splice(idx, 1)
          el.remove()
        },
      })
      .from(letterEls, {
        scale: 0,
        opacity: 0,
        duration: 0.5,
        ease: 'back.out(2.5)',
        stagger: 0.06,
      })
      .to(el, {
        duration: 1,
        y: -10,
        ease: 'sine.inOut',
      })
      .to(el, {
        duration: 1.5,
        y: fallDistance,
        rotation: rotation + (Math.random() - 0.5) * 100, // ±50° extra durante la caída
        ease: 'power3.in',
      })
      .to(
        el,
        {
          duration: 0.3,
          opacity: 0,
          ease: 'power2.out',
        },
        '-=0.2',
      )
  }

  // Listener delegado al container: se desmonta solo con el componente.
  // useEventListener acepta un Ref<HTMLElement | null> y re-attacha si cambia.
  useEventListener(container, 'mousemove', (e: MouseEvent) => {
    const containerEl = container.value
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()
    spawnReplica(e.clientX - rect.left, e.clientY - rect.top)
  })

  onUnmounted(() => {
    // Cleanup: matamos todas las timelines vivas y limpiamos el DOM.
    liveReplicas.forEach((el) => {
      gsap.killTweensOf(el)
      el.remove()
    })
    liveReplicas.length = 0
  })
}
