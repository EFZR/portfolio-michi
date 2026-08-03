<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { usePreferredReducedMotion } from '@vueuse/core'
import { useAppReady } from '@/composables/useAppReady'
import BaseLogo from '@/components/ui/BaseLogo.vue'

const { markReady } = useAppReady()
const reducedMotion = usePreferredReducedMotion()
const beating = computed(() => reducedMotion.value !== 'reduce')

const baseRef = ref<HTMLElement | null>(null)
const ringRef = ref<HTMLElement | null>(null)

const visible = ref(true)
// Progreso 0→100. Lo anima GSAP (avance "vivo") y se completa al terminar la
// descarga real. En el template se muestra redondeado.
const progress = ref(0)

let progressTween: gsap.core.Tween | null = null

/**
 * Precarga los recursos críticos:
 *  - `document.fonts.ready` → todas las @font-face (Anton, Fraunces, etc.).
 *  - El retrato del Hero → un `new Image()` calienta la caché para que su
 *    decodificación sea instantánea cuando el <img> real se renderice.
 * Con un timeout de seguridad para nunca dejar la web colgada si la red falla.
 */
function preloadAssets(): Promise<unknown> {
  const tasks: Promise<unknown>[] = []

  if (document.fonts?.ready) tasks.push(document.fonts.ready)

  tasks.push(
    new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => resolve() // no bloquear si el asset falla
      img.src = '/hero-img.png'
    }),
  )

  const safety = new Promise((resolve) => setTimeout(resolve, 6000))
  return Promise.race([Promise.all(tasks), safety])
}

function finish() {
  // reduced-motion: sin animaciones — completar y liberar la web de una.
  if (reducedMotion.value === 'reduce') {
    progress.value = 100
    markReady()
    visible.value = false
    return
  }

  progressTween?.kill()

  // Salida "iris desde el corazón": abrimos un agujero circular CRECIENTE en la
  // capa base (vía `mask: radial-gradient`) centrado EXACTAMENTE en el corazón
  // del logo. Como el Hero vive detrás del overlay, "brota" desde el corazón a
  // medida que el círculo crece. Un anillo UV cabalga el borde para darle firma.

  const vw = window.innerWidth
  const vh = window.innerHeight

  // Centro del iris = centro del corazón del logo DEL PRELOADER (fallback:
  // centro-superior). Ojo: acotamos la búsqueda a `baseRef` porque también hay
  // un BaseLogo en la navbar; un `document.querySelector` global agarraría ese.
  let cx = vw / 2
  let cy = vh * 0.45
  const heart = baseRef.value?.querySelector('.logo__heart')
  if (heart) {
    const rect = heart.getBoundingClientRect()
    cx = rect.left + rect.width / 2
    cy = rect.top + rect.height / 2
  }

  // Radio final = distancia a la esquina más lejana (+ margen) → cubre todo.
  const maxRadius = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) * 1.08

  // Aplica el agujero circular en la base y sincroniza el tamaño del anillo UV.
  const applyIris = (r: number) => {
    const feather = 1.5 // borde apenas suavizado (el anillo tapa el aliasing)
    const mask = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, #000 ${r + feather}px)`
    const base = baseRef.value
    if (base) {
      base.style.webkitMaskImage = mask
      base.style.maskImage = mask
    }
    const ring = ringRef.value
    if (ring) {
      const d = r * 2
      ring.style.width = `${d}px`
      ring.style.height = `${d}px`
    }
  }

  gsap.set(ringRef.value, { left: cx, top: cy, autoAlpha: 1 })
  applyIris(0)

  // Proxy tweenizado: GSAP anima `r` y en cada frame repintamos máscara + anillo.
  const iris = { r: 0 }
  gsap
    .timeline({ onComplete: () => (visible.value = false) })
    .to(progress, { value: 100, duration: 0.3, ease: 'power2.out' })
    // El Hero arranca su entrada por detrás justo antes de brotar.
    .add(markReady)
    .to(iris, {
      r: maxRadius,
      duration: 0.95,
      ease: 'power2.inOut',
      onUpdate: () => applyIris(iris.r),
    })
    // El anillo UV se desvanece al final, cuando ya llenó la pantalla.
    .to(ringRef.value, { autoAlpha: 0, duration: 0.35, ease: 'power1.out' }, '-=0.35')
}

onMounted(() => {
  const startedAt = performance.now()

  if (reducedMotion.value !== 'reduce') {
    // Avance perceptual hasta 90% mientras descargan los assets (sensación de
    // progreso aunque solo tengamos 2 señales reales). El salto a 100 lo da finish().
    progressTween = gsap.to(progress, { value: 90, duration: 1.6, ease: 'power1.out' })
  }

  preloadAssets().then(() => {
    // Mínimo ~600ms en pantalla: evita un parpadeo brusco cuando todo está cacheado.
    const elapsed = performance.now() - startedAt
    window.setTimeout(finish, Math.max(0, 600 - elapsed))
  })
})

onUnmounted(() => {
  progressTween?.kill()
})
</script>

<template>
  <!--
    Teleport a body para escapar de cualquier stacking context / overflow del
    layout y cubrir el viewport completo por encima de la navbar fija.
    overflow-hidden recorta el anillo UV cuando crece más allá del viewport.
  -->
  <Teleport to="body">
    <div
      v-if="visible"
      role="status"
      aria-label="Cargando el sitio"
      class="fixed inset-0 z-[999] overflow-hidden"
    >
      <!-- Capa base: fondo claro + logo latiendo + rótulos + barra.
           finish() le aplica una máscara circular creciente para revelar el Hero. -->
      <div ref="baseRef" class="absolute inset-0 bg-background">
        <!--
          Logo protagonista, centrado, con el corazón UV latiendo.
          El tamaño va en el WRAPPER, no en BaseLogo: el svg ya trae `h-full
          w-auto` internamente, así que pasarle clases de alto choca con ese
          h-full (que gana y lo estira al alto del viewport → inmenso en móvil).
          Un wrapper con altura fija + responsive lo controla limpiamente.
        -->
        <div class="flex h-full items-center justify-center px-6">
          <div class="h-20 sm:h-28 lg:h-36">
            <BaseLogo :beating="beating" aria-label="Cargando" />
          </div>
        </div>

        <!--
          Rótulos en las esquinas inferiores — eco de los del Hero
          ("(Scroll para ver más)"). Fuente del sistema a propósito: el
          preloader existe mientras las fuentes de marca aún cargan, así que su
          texto no debe depender de ellas. tabular-nums fija el ancho de los
          dígitos para que el contador no tiemble.
        -->
        <div
          class="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between sm:inset-x-6 sm:bottom-5"
          style="font-family: system-ui, -apple-system, sans-serif"
        >
          <span class="text-[0.7rem] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            Cargando
          </span>
          <span
            aria-hidden="true"
            class="text-base font-semibold text-foreground sm:text-lg"
            style="font-variant-numeric: tabular-nums"
          >
            {{ Math.round(progress) }}<span class="text-primary">%</span>
          </span>
        </div>

        <!-- Barra de progreso edge-to-edge: track discreto + relleno UV -->
        <div class="absolute inset-x-0 bottom-0 h-[3px] bg-border">
          <div class="h-full bg-primary" :style="{ width: `${progress}%` }" />
        </div>
      </div>

      <!--
        Anillo UV que cabalga el borde del iris. Su tamaño lo controla finish()
        en cada frame. Centro transparente (solo borde) → no tapa el Hero que
        brota. `rounded-full` es intencional (circular por naturaleza, como el
        cursor). Oculto hasta que finish() lo posiciona (autoAlpha inicial 0).
      -->
      <div
        ref="ringRef"
        aria-hidden="true"
        class="pointer-events-none invisible absolute rounded-full border-2 border-primary shadow-[0_0_28px_rgba(124,0,255,0.55)]"
        style="transform: translate(-50%, -50%)"
      />
    </div>
  </Teleport>
</template>
