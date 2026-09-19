<script setup lang="ts">
import { nextTick, onUnmounted, ref, useId, watch } from 'vue'
import { onKeyStroke, useScrollLock } from '@vueuse/core'

type ModalSize = 'default' | 'wide'

interface Props {
  /** Controla la visibilidad. El padre es dueño del estado (ver `useDisclosure`). */
  open: boolean
  /** Título visible del diálogo — también es su nombre accesible. */
  title: string
  /** Kicker editorial opcional, encima del título. */
  eyebrow?: string
  /** Ancho máximo de la hoja. `wide` para catálogos/grids de varias columnas. */
  size?: ModalSize
}

const { open, title, eyebrow = '', size = 'default' } = defineProps<Props>()

const emit = defineEmits<{
  /** El diálogo pide cerrarse (Esc, click fuera, botón cerrar). */
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)

/**
 * `aria-labelledby` necesita un id ÚNICO en todo el documento. `useId()` (Vue
 * 3.5) lo genera por instancia — mismo patrón que el `<textPath>` de Contacto.
 */
const uid = useId()
const titleId = `modal-title-${uid}`

/**
 * Bloquea el scroll del body mientras el diálogo está abierto: sin esto, la
 * rueda del ratón seguiría moviendo la página detrás del overlay (y, con las
 * secciones pinneadas por ScrollTrigger, el fondo se desplazaría solo).
 */
const bodyScrollLock = useScrollLock(document.body)

/** Elemento que tenía el foco al abrir — se lo devolvemos al cerrar. */
let lastFocused: HTMLElement | null = null

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(): HTMLElement[] {
  const panel = panelRef.value
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

// Esc → cerrar. onKeyStroke se auto-limpia en onUnmounted.
onKeyStroke('Escape', () => {
  if (open) emit('close')
})

/**
 * Focus trap mínimo: el Tab circula DENTRO del panel. Sin esto el foco se
 * escapa al contenido de atrás (que está oculto para el ratón pero no para el
 * teclado) y el diálogo deja de ser modal de verdad.
 */
onKeyStroke('Tab', (e: KeyboardEvent) => {
  if (!open) return
  const items = focusables()
  if (!items.length) return

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  const inside = !!panelRef.value?.contains(active)

  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
})

watch(
  () => open,
  async (isOpen) => {
    bodyScrollLock.value = isOpen

    if (isOpen) {
      lastFocused = document.activeElement as HTMLElement | null
      // El panel se monta con el `v-if`; esperamos el patch de Vue para poder
      // enfocar su primer control (el botón "Cerrar").
      await nextTick()
      focusables()[0]?.focus()
    } else {
      lastFocused?.focus()
      lastFocused = null
    }
  },
)

// Red de seguridad: si el diálogo se desmonta abierto, el body queda bloqueado.
onUnmounted(() => {
  bodyScrollLock.value = false
})

const sizeClasses: Record<ModalSize, string> = {
  default: 'max-w-3xl',
  wide: 'max-w-6xl',
}
</script>

<template>
  <!--
    Teleport a body — mismo patrón que AppNavDrawer: el diálogo escapa del
    stacking context de la sección y de cualquier `overflow-hidden` ancestral
    (Servicios recorta su escenario pinneado, así que sin esto quedaría cortado).
  -->
  <Teleport to="body">
    <!-- Fade del conjunto (backdrop + hoja). -->
    <Transition
      enter-active-class="transition-opacity duration-300 ease-out"
      leave-active-class="transition-opacity duration-200 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      >
        <!-- Backdrop: click fuera → cerrar. Decorativo para lectores de pantalla. -->
        <div
          aria-hidden="true"
          class="absolute inset-0 bg-foreground/70 backdrop-blur-[2px]"
          @click="emit('close')"
        />

        <!--
          Hoja del diálogo. `appear` dispara el slide-up en el mismo mount del
          v-if padre. Cabecera fija + cuerpo con scroll propio: el catálogo puede
          crecer sin romper el alto máximo.
        -->
        <Transition
          appear
          enter-active-class="transition duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]"
          leave-active-class="transition duration-200 ease-in"
          enter-from-class="translate-y-8 opacity-0 sm:translate-y-4"
          leave-to-class="translate-y-4 opacity-0"
        >
          <div
            ref="panelRef"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            :class="[
              'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-md bg-background',
              'shadow-[0_30px_90px_-30px_rgba(10,10,10,0.65)] sm:max-h-[86vh]',
              sizeClasses[size],
            ]"
          >
            <header
              class="flex items-start justify-between gap-6 border-b border-border px-6 py-6 sm:px-10 sm:py-8"
            >
              <div>
                <p
                  v-if="eyebrow"
                  class="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-primary"
                >
                  {{ eyebrow }}
                </p>
                <h2
                  :id="titleId"
                  class="font-heading text-3xl font-semibold leading-none tracking-tight text-foreground sm:text-5xl"
                >
                  {{ title }}
                </h2>
              </div>

              <!--
                Cerrar: mismo botón del sistema (letter-swap + glow UV) en
                variante `outline` para que no compita con el contenido.
                Es el primer focusable del panel → recibe el foco al abrir.
              -->
              <button
                type="button"
                data-cursor="grow"
                aria-label="Cerrar catálogo"
                class="group -mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors duration-300 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                @click="emit('close')"
              >
                <svg
                  class="h-4 w-4 transition-transform duration-300 group-hover:rotate-90"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div class="overflow-y-auto px-6 py-8 sm:px-10 sm:py-10">
              <slot />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
