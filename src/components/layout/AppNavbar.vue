<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { useDisclosure } from '@/composables/useDisclosure'
import { useScrollDirection } from '@/composables/useScrollDirection'
import AppNavDrawer from './AppNavDrawer.vue'
import BaseLogo from '@/components/ui/BaseLogo.vue'

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

// La animación letter-swap del CTA "Hablemos" vive ahora dentro de
// <BaseCtaButton> (registrado globalmente en main.ts). El navbar solo
// se encarga del layout responsive y del wiring del avatar como slot leading.
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
        Columna IZQUIERDA (flex-1): logo. Junto con la columna derecha (también
        flex-1) forma un layout de 3 columnas simétrico que mantiene la columna
        central en el CENTRO EXACTO del viewport, sin importar los anchos de
        logo/CTA.

        LOGO: SVG inline (<BaseLogo/>). El corazón es UV, la silueta hereda
        del token `text-foreground` del propio SVG. El hover del RouterLink
        no cambia color — el "efecto vivo" lo aporta el heartbeat interno.
      -->
      <div class="flex flex-1 justify-start">
        <RouterLink
          to="/"
          data-cursor="grow"
          aria-label="Inicio — my Princess"
          class="block h-14 shrink-0 py-1"
        >
          <BaseLogo aria-label="my Princess" />
        </RouterLink>
      </div>

      <!--
        Columna CENTRAL (shrink-0): nav inline / botón MENÚ.

        Al ser una columna de ancho natural flanqueada por dos columnas `flex-1`
        idénticas (logo izq, CTA der), queda SIEMPRE en el centro exacto del
        viewport — sin depender de los anchos de logo/CTA (que difieren). Si la
        ventana se angosta, las columnas laterales ceden espacio de forma
        simétrica hasta topar con su contenido, sin que el nav se solape con el CTA.

        En mobile la columna derecha (CTA) está `hidden`, así que solo quedan
        logo (flex-1) + esta columna: el flex-1 del logo empuja el MENÚ al borde
        derecho, preservando el patrón mobile logo-izq + MENÚ-der.

        El `<Transition mode="out-in">` hace el crossfade entre los dos estados
        sin que coexistan en el DOM — evita layout shift y duplicados de aria.
      -->
      <div class="pointer-events-none shrink-0">
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

          <!--
            Botón MENÚ como <BaseCtaButton> (sin `to`/`href` → renderiza un
            <button> nativo con `type="button"`). El `@click`, `aria-expanded`,
            `aria-controls` y la clase `pointer-events-auto` se reenvían al botón
            real vía `$attrs` (BaseCtaButton usa `inheritAttrs: false`).
            El icono burger/X va en el slot `leading`, ocupando el lugar que en
            el CTA "Hablemos" tiene el avatar — misma convención para todos los
            botones de aquí en adelante.
          -->
          <BaseCtaButton
            v-else
            key="menu"
            :text="isDrawerOpen ? 'Cerrar' : 'Menú'"
            class="pointer-events-auto"
            :aria-expanded="isDrawerOpen"
            aria-controls="nav-drawer"
            @click="toggleDrawer"
          >
            <template #leading>
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
            </template>
          </BaseCtaButton>
        </Transition>
      </div>

      <!--
        Columna DERECHA (flex-1, justify-end): CTA "Hablemos". Simétrica a la
        columna izquierda del logo → es lo que mantiene la columna central en el
        centro exacto del viewport. `justify-end` alinea el CTA al borde derecho.

        `hidden md:flex` la oculta en mobile: sin ella, solo quedan logo + nav
        central, y el flex-1 del logo empuja el MENÚ a la derecha (patrón mobile).
        El wrapper resuelve además que `BaseCtaButton` (con `inline-flex`
        hardcodeado) no se pueda ocultar pasándole `hidden` directamente, ya que
        `inline-flex` gana por orden del CSS compilado.

        Toda la animación letter-swap y el layout base los provee `<BaseCtaButton>`;
        aquí solo pasamos el avatar como slot `leading` para que el bg del
        wrapper transicione a UV en hover gracias a `group-hover:bg-primary`.
      -->
      <div class="hidden flex-1 justify-end md:flex">
        <BaseCtaButton to="/#contact" text="Hablemos">
          <template #leading>
            <span
              class="block h-8 w-8 overflow-hidden rounded-md bg-muted-foreground pt-0.5 transition-colors duration-300 group-hover:bg-primary"
            >
              <img src="/contactame.png" alt="" class="h-full w-full object-contain" />
            </span>
          </template>
        </BaseCtaButton>
      </div>
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
