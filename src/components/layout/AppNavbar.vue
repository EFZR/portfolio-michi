<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { gsap } from 'gsap'
import { useMediaQuery, usePreferredReducedMotion } from '@vueuse/core'
import { useDisclosure } from '@/composables/useDisclosure'
import { useScrollDirection } from '@/composables/useScrollDirection'
import AppNavDrawer from './AppNavDrawer.vue'

interface NavItem {
  label: string
  to: string
}

// Items "rápidos" del estado A — los 3 destinos prioritarios.
const topItems: NavItem[] = [
  { label: 'Portafolio', to: '/#projects' },
  { label: 'Blog', to: '/blog' },
  { label: 'Sobre mí', to: '/#about' },
]

const { isAtTop, direction } = useScrollDirection({ topThreshold: 80 })
const { isOpen: isDrawerOpen, toggle: toggleDrawer, close: closeDrawer } = useDisclosure()
const route = useRoute()

// `md:` = 768px en Tailwind. Mismo breakpoint para mostrar inline nav vs MENU.
const isDesktop = useMediaQuery('(min-width: 768px)')

// Cerrar el drawer al cambiar de ruta — evita estado fantasma tras navegar.
watch(() => route.fullPath, closeDrawer)

/**
 * Visibilidad del header (hide on scroll down, show on scroll up):
 *   - En el tope (`isAtTop`) → SIEMPRE visible. Mantenemos el estado A intacto
 *     mientras el usuario está en el Hero, sin importar micro-scrolls.
 *   - Scrolleando hacia abajo → ocultar (libera espacio para que el usuario lea).
 *   - Scrolleando hacia arriba → reaparece automáticamente, ya contraído.
 *   - Drawer abierto → forzamos visible (sino el usuario perdería el botón "Cerrar").
 */
const isVisible = computed(() => isAtTop.value || direction.value !== 'down' || isDrawerOpen.value)

/**
 * Layout mode:
 *   - `false` (estado A) → nav inline + CTA. Modo "presentación" del navbar
 *     en el borde superior de la página.
 *   - `true` (estado C) → contraído: logo + botón MENÚ + CTA. Modo "navegación
 *     compacta" mientras el usuario está en medio del contenido.
 */
const isContracted = computed(() => !isAtTop.value)

/**
 * Inline nav solo se renderiza cuando: (estado A) AND (desktop).
 * En mobile NUNCA mostramos los items inline porque no caben — siempre va
 * el botón MENU, sin importar el scroll.
 */
const showInlineNav = computed(() => !isContracted.value && isDesktop.value)

// Split de "Hablemos" para el swap por letra (misma técnica que el H1 del Hero).
const hablemosChars = [...'Hablemos']
// DOS copias con las mismas letras — A es la "principal" que cae al hover,
// B es la "réplica" que baja desde arriba para reemplazarla.
const hablemosARef = ref<HTMLElement | null>(null)
const hablemosBRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

function getLettersOf(el: HTMLElement | null): NodeListOf<HTMLElement> | null {
  return el?.querySelectorAll<HTMLElement>('.hablemos-letter') ?? null
}

/**
 * Timeline reusable para hover/leave. Se construye pausado en onMounted y se
 * controla con .play() (hover in) y .reverse() (hover out). "Volver en el tiempo"
 * literalmente: reverse reproduce la animación al revés, mismos eases mirroreados.
 *
 * Estados:
 *   - Natural (t=0):     A yPercent 0    | B yPercent -120  (solo A visible)
 *   - Hover (t=final):   A yPercent 120  | B yPercent  0    (solo B visible)
 *
 * Offset de 0.25s entre A y B: A empieza a caer y B recién arranca cuando A ya
 * salió a medio camino — reduce el "cruce" en el centro del mask.
 */
let hoverTl: gsap.core.Timeline | null = null

function onHablemosEnter() {
  if (reducedMotion.value === 'reduce') return
  hoverTl?.play()
}

function onHablemosLeave() {
  if (reducedMotion.value === 'reduce') return
  hoverTl?.reverse()
}

onMounted(() => {
  const a = getLettersOf(hablemosARef.value)
  const b = getLettersOf(hablemosBRef.value)
  if (!a || !b) return

  // Estado natural: B siempre arranca oculta arriba del mask.
  gsap.set(b, { yPercent: -120 })

  if (reducedMotion.value === 'reduce') {
    // A visible en su posición final, B fuera del mask. Sin animación.
    gsap.set(a, { yPercent: 0, opacity: 1 })
    return
  }

  // Reveal inicial de A: cae desde arriba. Delay para respirar el Hero (t=0).
  gsap.fromTo(
    a,
    { yPercent: -120, opacity: 0 },
    {
      yPercent: 0,
      opacity: 1,
      duration: 0.6,
      stagger: 0.05,
      ease: 'power3.out',
      delay: 0.4,
    },
  )

  // Timeline hover: A cae 0→120, B baja -120→0. defaults.overwrite: 'auto'
  // mata cualquier tween que colisione (ej. el reveal inicial de A si el
  // usuario hace hover a los 0.5s de cargar la página).
  // Offset 0.35s → aire visible entre la salida de A y la llegada de B.
  hoverTl = gsap
    .timeline({ paused: true, defaults: { overwrite: 'auto' } })
    .to(
      a,
      {
        yPercent: 120,
        duration: 0.4,
        stagger: 0.05,
        ease: 'power2.in',
      },
      0,
    )
    .to(
      b,
      {
        yPercent: 0,
        duration: 0.4,
        stagger: 0.05,
        ease: 'power3.out',
      },
      0.35,
    )
})

onUnmounted(() => {
  hoverTl?.kill()
  hoverTl = null
})
</script>

<template>
  <header
    :class="[
      'fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out',
      isVisible ? 'translate-y-0' : '-translate-y-full',
    ]"
  >
    <nav aria-label="Principal" class="relative flex h-24 items-center px-6 sm:px-8 lg:px-12">
      <!--
        LOGO (izquierda absolute por flex natural).
        Texto plano `my Princess.` con punto final en UV — el sello cromático.
      -->
      <RouterLink
        to="/"
        data-cursor="grow"
        class="font-heading text-2xl font-medium tracking-tight text-foreground transition-colors hover:text-primary"
      >
        my Princess<span class="text-primary">.</span>
      </RouterLink>

      <!--
        Wrapper del nav inline / botón MENÚ.

        Posicionamiento responsivo:
          - Desktop (`isDesktop`): absolute centrado al viewport. Esto mantiene
            el nav inline o el MENÚ siempre al centro horizontal sin importar
            si el CTA está visible — útil porque en estado A los 3 items
            inline tienen que respirar simétricamente al centro.
          - Mobile (`!isDesktop`): flex child con `ml-auto` → empuja al borde
            derecho. Como en mobile NUNCA hay nav inline (showInlineNav = false)
            y el CTA "Hablemos" está oculto, el botón MENÚ a la derecha es el
            patrón mobile estándar (logo izq + MENÚ der).

        El `<Transition mode="out-in">` hace el crossfade entre los dos estados
        sin que coexistan en el DOM — evita layout shift y duplicados de aria.
      -->
      <div
        :class="[
          'pointer-events-none',
          isDesktop ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'ml-auto',
        ]"
      >
        <Transition
          mode="out-in"
          enter-active-class="transition-opacity duration-200 ease-out"
          leave-active-class="transition-opacity duration-100 ease-in"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <ul
            v-if="showInlineNav"
            key="inline"
            class="pointer-events-auto flex items-center gap-10"
          >
            <li v-for="item in topItems" :key="item.to">
              <RouterLink
                :to="item.to"
                data-cursor="grow"
                class="text-lg font-medium uppercase tracking-wider text-foreground transition-colors hover:text-primary"
                active-class="text-primary"
              >
                {{ item.label }}
              </RouterLink>
            </li>
          </ul>

          <button
            v-else
            key="menu"
            type="button"
            data-cursor="grow"
            :aria-expanded="isDrawerOpen"
            aria-controls="nav-drawer"
            class="pointer-events-auto flex items-center gap-3 rounded-md bg-foreground px-5 py-3 text-base font-medium uppercase tracking-wider text-background transition-colors hover:bg-primary"
            @click="toggleDrawer"
          >
            {{ isDrawerOpen ? 'Cerrar' : 'Menú' }}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="h-5 w-5"
              aria-hidden="true"
            >
              <template v-if="!isDrawerOpen">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </template>
              <template v-else>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </template>
            </svg>
          </button>
        </Transition>
      </div>

      <!--
        CTA "Hablemos" (derecha, ml-auto empuja al borde derecho).
        Oculto en mobile: el espacio es prioritario para logo + MENÚ.
        El drawer (1.6c) tendrá su propio CTA grande dentro.

        Patrón hover:
          - El wrapper de la imagen transiciona bg-foreground → bg-primary (UV).
            Como el PNG tiene transparencia, las zonas alfa dejan ver el UV → la
            imagen queda "rodeada/sustentada" por el accent color en lugar del
            negro. El efecto es localizado al avatar, no a toda la cápsula.
          - El texto "Hablemos" reproduce la cascada por letra del reveal inicial:
            cada carácter cae desde arriba (yPercent: -120 → 0) con stagger. El
            overflow-hidden del padre sirve de máscara.
          - `@mouseenter` y `@focus` disparan `onHablemosEnter` para replay.
            `group` en el <RouterLink> permite que la imagen reaccione con CSS.
      -->
      <RouterLink
        to="/#contact"
        data-cursor="grow"
        class="group ml-auto hidden items-center gap-3 rounded-md bg-foreground py-2 pl-2 pr-5 text-base font-medium uppercase tracking-wider text-background md:flex"
        @mouseenter="onHablemosEnter"
        @mouseleave="onHablemosLeave"
        @focus="onHablemosEnter"
        @blur="onHablemosLeave"
      >
        <span
          class="block h-8 w-8 overflow-hidden rounded-md bg-muted-foreground pt-0.5 transition-colors duration-300 group-hover:bg-primary"
        >
          <img src="/contactame.png" alt="" class="h-full w-full object-contain" />
        </span>
        <!--
          Wrapper mask (overflow-hidden) contiene DOS copias splitteadas de
          "Hablemos". La copia A está en flujo normal (block). La copia B se
          superpone con `absolute left-0 top-0` para ocupar el mismo lugar.
          En estado normal: A en yPercent 0 (visible), B en yPercent -120
          (oculta por encima del mask). En cada hover/leave, se hacen swap.
        -->
        <span class="relative inline-block overflow-hidden leading-none">
          <span ref="hablemosARef" class="block whitespace-nowrap">
            <span
              v-for="(char, i) in hablemosChars"
              :key="`a-${i}`"
              class="hablemos-letter inline-block"
              >{{ char }}</span
            >
          </span>
          <span
            ref="hablemosBRef"
            aria-hidden="true"
            class="absolute left-0 top-0 block whitespace-nowrap"
          >
            <span
              v-for="(char, i) in hablemosChars"
              :key="`b-${i}`"
              class="hablemos-letter inline-block"
              >{{ char }}</span
            >
          </span>
        </span>
      </RouterLink>
    </nav>
  </header>

  <!--
    Drawer fullscreen montado al lado del header. Usa Teleport internamente
    para escapar del DOM del header y vivir directamente en <body>.
    Por eso renderizamos el drawer y el header como root siblings — ambos
    son hijos del template (Vue 3 permite multi-root).
  -->
  <AppNavDrawer :open="isDrawerOpen" @close="closeDrawer" />
</template>
