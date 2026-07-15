<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink } from 'vue-router'
import { onKeyStroke, useScrollLock } from '@vueuse/core'

interface DrawerItem {
  /** Número editorial "01", "02", … que aparece chico al lado del label */
  index: string
  /** Texto MASIVO que se muestra (uppercase, font-hero) */
  label: string
  /** Ruta o anchor de destino */
  to: string
}

const props = defineProps<{
  /** Controla la visibilidad del drawer desde el navbar padre */
  open: boolean
}>()

const emit = defineEmits<{
  /** El drawer pide cerrarse — el padre debe actualizar `open` a false */
  close: []
}>()

/**
 * Set de items del drawer. Versión "completa" de la navegación:
 *   - Top inline del navbar tiene 3 (Portafolio, Blog, Sobre mí).
 *   - El drawer es superset: añade Inicio, Proceso, Contacto.
 * La numeración "01..06" agrega vibra editorial estilo Bogdan.
 */
const items: DrawerItem[] = [
  { index: '01', label: 'Inicio', to: '/' },
  { index: '02', label: 'Portafolio', to: '/#projects' },
  { index: '03', label: 'Blog', to: '/blog' },
  { index: '04', label: 'Proceso', to: '/#process' },
  { index: '05', label: 'Sobre mí', to: '/#about' },
  { index: '06', label: 'Contacto', to: '/#contact' },
]

/**
 * Bloquea el scroll del body mientras el drawer está abierto.
 * useScrollLock devuelve un ref booleano; lo sincronizamos con `props.open`.
 * Sin esto, el usuario podría scrollear el contenido detrás del overlay UV.
 */
const bodyScrollLock = useScrollLock(document.body)

// Tecla Esc → cerrar. onKeyStroke se auto-cleanupea con onUnmounted.
onKeyStroke('Escape', () => {
  if (props.open) emit('close')
})

// La entrada de los items ya NO usa GSAP: cada label ejecuta el mismo drop-in de
// letras del hover, disparado por una @keyframes que corre sola al montarse (el
// `v-if` remonta los items en cada apertura). Aquí solo sincronizamos el scroll
// lock con la visibilidad del drawer.
watch(
  () => props.open,
  (isOpen) => {
    bodyScrollLock.value = isOpen
  },
)
</script>

<template>
  <!--
    Teleport a body: el drawer escapa del stacking context del <header> y de
    cualquier `overflow-hidden` ancestral. Garantiza que el `fixed inset-0`
    cubra el viewport entero sin ser clipeado por padres.
  -->
  <Teleport to="body">
    <!--
      Vue Transition para el slide-up del overlay completo.
      - Enter: viene desde translate-y-full (fuera de pantalla abajo) a 0.
      - Leave: regresa a translate-y-full.
      Duración asimétrica: enter 500ms (más dramático), leave 400ms (snappy).
    -->
    <Transition
      enter-active-class="transition-transform duration-500 ease-out"
      leave-active-class="transition-transform duration-400 ease-in"
      enter-from-class="translate-y-full"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="open"
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        class="fixed inset-0 z-40 flex flex-col bg-primary"
      >
        <!-- Lista de items: centrada vertical y horizontalmente -->
        <nav
          aria-label="Navegación principal"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-6"
        >
          <RouterLink
            v-for="item in items"
            :key="item.to"
            :to="item.to"
            data-cursor="grow"
            class="group flex items-baseline gap-3 transition-opacity duration-300 sm:gap-4"
            @click="emit('close')"
          >
            <!--
              Número editorial: Fraunces italic, chico y semi-translúcido.
              Aporta jerarquía y el "sello de editorial" que vibra Bogdan.
            -->
            <span
              class="font-heading text-base italic text-foreground/60 sm:text-lg"
              aria-hidden="true"
            >
              {{ item.index }}
            </span>
            <!--
              Label MASIVO con letter-swap 100% CSS (mismo efecto que el CTA
              "Hablemos", pero sin GSAP para que sea infalible en hover):
              mask overflow-hidden con dos copias del texto splitteado en letras.
              - swap-a: copia visible en flujo. Su `aria-label` da el nombre
                accesible del link (las letras van aria-hidden).
              - swap-b: copia absolute superpuesta, oculta arriba del mask.
              El `--i` por letra genera el stagger vía transition-delay (ver CSS).
            -->
            <span
              class="relative inline-block overflow-hidden font-hero text-5xl uppercase leading-none text-foreground sm:text-6xl md:text-7xl lg:text-8xl"
            >
              <span class="swap-a block whitespace-nowrap" :aria-label="item.label">
                <span
                  v-for="(char, i) in [...item.label]"
                  :key="`a-${i}`"
                  aria-hidden="true"
                  class="swap-letter inline-block"
                  :style="{ '--i': i }"
                  >{{ char === ' ' ? ' ' : char }}</span
                >
              </span>
              <span
                aria-hidden="true"
                class="swap-b absolute left-0 top-0 block whitespace-nowrap"
              >
                <span
                  v-for="(char, i) in [...item.label]"
                  :key="`b-${i}`"
                  class="swap-letter inline-block"
                  :style="{ '--i': i }"
                  >{{ char === ' ' ? ' ' : char }}</span
                >
              </span>
            </span>
          </RouterLink>
        </nav>

        <!--
          Footer: copyright izquierda + email derecha.
          border-t con foreground/20 = línea negra muy sutil sobre UV —
          separa visualmente el footer sin ser invasiva.
        -->
        <footer
          class="flex items-center justify-between border-t border-foreground/20 px-6 py-6 text-sm text-foreground sm:px-8 lg:px-12"
        >
          <span>©2026 my Princess.</span>
          <a
            href="mailto:hola@myprincess.com"
            data-cursor="grow"
            class="transition-opacity hover:opacity-70"
          >
            hola@myprincess.com
          </a>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/*
  ── Letter-swap (100% CSS) ──────────────────────────────────────────────────
  Réplica del efecto de <BaseCtaButton>: la copia A (swap-a) cae y la copia B
  (swap-b) baja desde arriba, letra por letra. El stagger sale de `--i` (índice
  de la letra, seteado inline) multiplicado por un paso fijo en el delay.

  Se hace en CSS puro a propósito: no depende de refs/timelines/timing de Vue,
  así que dispara siempre en hover sin poder romper la apertura del drawer.
*/
.swap-letter {
  transition: transform 0.4s cubic-bezier(0.5, 0, 0.2, 1);
  transition-delay: calc(var(--i, 0) * 30ms);
  will-change: transform;
}

/*
  ── Entrada ─────────────────────────────────────────────────────────────────
  Al abrir el drawer (el `v-if` remonta los items), cada letra de la copia A cae
  a su lugar desde arriba — el MISMO gesto del hover, pero como animación de
  entrada. Corre sola en el mount, sin delay global (arranca "en el momento");
  solo el stagger por letra (`--i`) le da el escalonado. `backwards` mantiene la
  letra oculta arriba durante su delay; termina en translateY(0) = estado base.
*/
@keyframes drawer-letter-in {
  from {
    transform: translateY(-110%);
  }
  to {
    transform: translateY(0);
  }
}
.swap-a .swap-letter {
  animation: drawer-letter-in 0.45s cubic-bezier(0.5, 0, 0.2, 1) backwards;
  animation-delay: calc(var(--i, 0) * 30ms);
}

/* B arranca oculta 120% arriba del mask overflow-hidden. */
.swap-b .swap-letter {
  transform: translateY(-120%);
}

/* Hover: A sale por abajo, B entra a su lugar (con un pelín más de delay = onda). */
.group:hover .swap-a .swap-letter {
  transform: translateY(120%);
}
.group:hover .swap-b .swap-letter {
  transform: translateY(0);
  transition-delay: calc(var(--i, 0) * 30ms + 120ms);
}

/*
  Sibling-dim: al hoverear un item, los demás "pierden color" bajando su opacity.
  `:has(a:hover)` detecta que algún link está hovereado; `:not(:hover)` excluye
  al activo. El <a> del footer está FUERA del <nav>, así que no se ve afectado.
*/
nav:has(a:hover) a:not(:hover) {
  opacity: 0.35;
}

/* Accesibilidad: sin swap si el usuario pide reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .swap-letter {
    transition: none;
  }
  .swap-a .swap-letter {
    animation: none;
  }
  .group:hover .swap-a .swap-letter {
    transform: none;
  }
  .group:hover .swap-b .swap-letter {
    transform: translateY(-120%);
  }
}
</style>
