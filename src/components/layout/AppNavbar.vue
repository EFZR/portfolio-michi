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
        LOGO: SVG inline (<BaseLogo/>). El corazón es UV, la silueta hereda
        del token `text-foreground` del propio SVG. El hover del RouterLink
        no cambia color — el "efecto vivo" lo aporta el heartbeat interno.
      -->
      <RouterLink
        to="/"
        data-cursor="grow"
        aria-label="Inicio — my Princess"
        class="block h-14 shrink-0 py-1"
      >
        <BaseLogo aria-label="my Princess" />
      </RouterLink>

      <!--
        Wrapper del nav inline / botón MENÚ.

        Columna central flexible (`flex-1`) que vive ENTRE el logo (izq) y el
        CTA (der). Al ser flex-1 absorbe todo el espacio sobrante, con lo que:
          - Desktop: `justify-center` centra el nav inline dentro del hueco
            disponible entre logo y CTA. A diferencia del centrado al viewport
            anterior, aquí el nav NUNCA se solapa con "Hablemos" al angostar la
            ventana — el CTA reserva su propio ancho (`shrink-0`) y la columna
            central se contrae con él manteniendo los items respirando al medio.
          - Mobile: `justify-end` empuja el botón MENÚ al borde derecho (el CTA
            está oculto), preservando el patrón mobile logo-izq + MENÚ-der.

        El `<Transition mode="out-in">` hace el crossfade entre los dos estados
        sin que coexistan en el DOM — evita layout shift y duplicados de aria.
      -->
      <div class="pointer-events-none flex flex-1 justify-end md:justify-center">
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
        CTA "Hablemos" (derecha). La columna central `flex-1` lo empuja al
        borde derecho — no necesita `ml-auto`. `shrink-0` garantiza que el CTA
        conserve su ancho y no invada el espacio del nav central.
        Oculto en mobile — el espacio es prioritario para logo + MENÚ.

        Delegamos la responsividad al wrapper (`hidden md:block`) en lugar
        del propio CTA. Motivo: `BaseCtaButton` tiene `inline-flex` hardcoded
        en su root; y en Tailwind `inline-flex` gana sobre `hidden` por
        orden del CSS compilado — pasar `class="hidden md:inline-flex"` al
        CTA no lo ocultaba en mobile. El wrapper resuelve el conflicto sin
        tocar la API del componente.

        Toda la animación letter-swap y el layout base los provee `<BaseCtaButton>`;
        aquí solo pasamos el avatar como slot `leading` para que el bg del
        wrapper transicione a UV en hover gracias a `group-hover:bg-primary`.
      -->
      <div class="hidden shrink-0 md:block">
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
