<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { gsap } from 'gsap'
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

// Refs a los <a> de cada RouterLink — necesarios para que GSAP los anime
// individualmente con stagger. Vue 3 + v-for: usar callback refs que reciben
// la ComponentPublicInstance de RouterLink y nos quedamos con `$el` (el <a>).
const itemRefs = ref<HTMLElement[]>([])
const setItemRef = (index: number) => (el: unknown) => {
  if (!el) return
  const domEl = (el as { $el?: HTMLElement }).$el ?? (el as HTMLElement)
  itemRefs.value[index] = domEl
}

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

watch(
  () => props.open,
  async (isOpen) => {
    bodyScrollLock.value = isOpen
    if (!isOpen) return

    // Esperamos a que el v-if monte los items en el DOM.
    await nextTick()

    /**
     * Stagger GSAP: cada item emerge desde y=40px / opacity 0 con `back.out(1.7)`.
     * El `delay: 0.2` espera a que el overlay haya empezado a subir antes de
     * que los items aparezcan — sino el stagger ocurre detrás del slide y se
     * pierde visualmente. El bounce `back.out` mantiene coherencia con el
     * efecto word-replicate del Hero.
     */
    gsap.from(itemRefs.value, {
      y: 40,
      opacity: 0,
      duration: 0.6,
      ease: 'back.out(1.7)',
      stagger: 0.06,
      delay: 0.2,
    })
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
            v-for="(item, index) in items"
            :key="item.to"
            :ref="setItemRef(index)"
            :to="item.to"
            data-cursor="grow"
            class="group flex items-baseline gap-3 sm:gap-4"
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
              Label MASIVO: Anton uppercase, sin line-height extra para que
              los items se apilen con tight spacing.
              Hover: leve translate-x-2 hacia la izquierda — micro-interacción
              que indica "este item es la selección activa del cursor".
            -->
            <span
              class="font-hero text-5xl uppercase leading-none text-foreground transition-transform duration-300 group-hover:-translate-x-2 sm:text-6xl md:text-7xl lg:text-8xl"
            >
              {{ item.label }}
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
