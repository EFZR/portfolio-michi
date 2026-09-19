<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useSlots, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { gsap } from 'gsap'
import { usePreferredReducedMotion } from '@vueuse/core'

type CtaVariant = 'solid' | 'outline'
type CtaSize = 'md' | 'lg'

interface Props {
  /**
   * Texto visible del botón. Debe ser un string (no un slot) porque internamente
   * se splittea carácter por carácter para el letter-swap animado.
   */
  text: string
  /** Navegación interna SPA (RouterLink). Tiene precedencia sobre `href`. */
  to?: RouteLocationRaw
  /** URL externa — se abre en nueva pestaña con rel de seguridad. */
  href?: string
  /** `solid` = fondo foreground (default). `outline` = borde sobre transparente. */
  variant?: CtaVariant
  /** Tamaño del padding y de la tipografía. */
  size?: CtaSize
}

const { text, to, href, variant = 'solid', size = 'md' } = defineProps<Props>()

// Desactivamos el inheritance automático: el elemento raíz cambia entre
// RouterLink / <a> / <button> y queremos aplicar attrs manualmente al correcto.
defineOptions({ inheritAttrs: false })

const slots = useSlots()

// Si el consumidor pasa un slot `leading` (avatar, icono), reducimos el
// padding izquierdo para que el elemento quede flush contra el borde interior,
// replicando el patrón del CTA "Hablemos" original.
const hasLeading = computed(() => !!slots.leading)

// Spread preserva codepoints multi-byte (ej. tildes) sin partirlos en surrogates.
// OJO: cada letra se pinta en un <span inline-block>, donde un espacio normal
// COLAPSA y las palabras quedan pegadas ("CATÁLOGOCOMPLETO"). En el template se
// sustituye por NBSP — mismo truco que el letter-swap de AppNavDrawer. El nombre
// accesible no se ve afectado: sale del `aria-label` con el texto original.
const chars = computed(() => [...text])

const aRef = ref<HTMLElement | null>(null)
const bRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

let hoverTl: gsap.core.Timeline | null = null

function lettersOf(el: HTMLElement | null): NodeListOf<HTMLElement> | null {
  return el?.querySelectorAll<HTMLElement>('.cta-letter') ?? null
}

function onEnter() {
  if (reducedMotion.value === 'reduce') return
  hoverTl?.play()
}

function onLeave() {
  if (reducedMotion.value === 'reduce') return
  hoverTl?.reverse()
}

/**
 * (Re)construye el timeline del letter-swap sobre los nodos `.cta-letter`
 * ACTUALES. Es idempotente: mata el timeline previo antes de rearmar, así que
 * puede llamarse tanto en el mount inicial como cada vez que `text` cambia
 * (ej. toggle "Menú" ⇄ "Cerrar", donde la cantidad de letras varía y GSAP
 * debe re-targetear los nodos nuevos — sino solo animarían las letras viejas).
 */
function buildTimeline() {
  hoverTl?.kill()
  hoverTl = null

  const a = lettersOf(aRef.value)
  const b = lettersOf(bRef.value)
  if (!a || !b) return

  // Estado natural: A visible, B oculta arriba del mask overflow-hidden.
  gsap.set(a, { yPercent: 0, opacity: 1 })
  gsap.set(b, { yPercent: -120 })

  if (reducedMotion.value === 'reduce') return

  // Timeline hover: A cae 0→120, B baja -120→0. Se controla con play() y reverse()
  // para que el retorno replique la animación al revés (mismo ease mirroreado).
  // Offset 0.35s entre las dos ondas = aire visible sin que se crucen en el centro.
  hoverTl = gsap
    .timeline({ paused: true, defaults: { overwrite: 'auto' } })
    .to(a, { yPercent: 120, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, 0)
    .to(b, { yPercent: 0, duration: 0.4, stagger: 0.05, ease: 'power3.out' }, 0.35)
}

onMounted(buildTimeline)

// `flush: 'post'` → el watcher corre DESPUÉS de que Vue parchea el DOM, de modo
// que `lettersOf()` ya ve los nodos re-renderizados con el texto nuevo.
watch(chars, buildTimeline, { flush: 'post' })

onUnmounted(() => {
  hoverTl?.kill()
  hoverTl = null
})

const variantClasses: Record<CtaVariant, string> = {
  solid: 'bg-foreground text-background',
  // El borde también se tiñe de UV al pasar el cursor: en `outline` el borde ES
  // el botón, así que sin esto el resplandor quedaría flotando alrededor de una
  // caja que no reacciona.
  outline: 'border border-foreground bg-transparent text-foreground hover:border-primary',
}

/**
 * RESPLANDOR ULTRAVIOLET al hover/focus.
 *
 * Dos capas de sombra sin color propio + `shadow-primary/70`: Tailwind pinta
 * ambas con el token, así que el acento sigue saliendo del design system y no de
 * un hex suelto. La capa corta y contrastada (18px) hace de halo pegado al
 * borde; la larga y difusa (46px) derrama el color sobre el fondo. Juntas leen
 * como luz encendida y no como una sombra gris teñida.
 *
 * Es la regla 60/30/10 aplicada al detalle: el CTA sigue siendo un bloque negro
 * —el morado no se convierte en fondo— y el acento aparece solo en el momento
 * de la interacción.
 *
 * Se replica en `focus-visible` para que quien navegue con teclado reciba
 * exactamente la misma señal que con el ratón.
 */
const glowClasses =
  'transition-[box-shadow,border-color] duration-300 ease-out ' +
  'hover:shadow-[0_0_18px_-2px,0_0_46px_-10px] hover:shadow-primary/70 ' +
  'focus-visible:shadow-[0_0_18px_-2px,0_0_46px_-10px] focus-visible:shadow-primary/70'

// Altura FIJA por tamaño (`h-*`) en vez de padding vertical (`py-*`): así todos
// los botones del mismo `size` miden exactamente igual sin importar el contenido
// del slot `leading` (avatar h-8 vs icono h-5). `items-center` en el wrapper
// centra el contenido dentro de esa altura.
const sizeClasses: Record<CtaSize, string> = {
  md: 'h-12 pr-5 text-base',
  lg: 'h-14 pr-6 text-lg',
}

// Padding izquierdo depende del slot leading: si hay elemento grande (avatar 32px),
// pl-2 lo mantiene pegado al borde; si no, pl-5/6 para equilibrar con el pr.
const leadingPadding = computed(() => {
  if (hasLeading.value) return size === 'lg' ? 'pl-3' : 'pl-2'
  return size === 'lg' ? 'pl-6' : 'pl-5'
})

const wrapperClasses = computed(() => [
  'group inline-flex items-center gap-3 rounded-md font-medium uppercase tracking-wider',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  glowClasses,
  variantClasses[variant],
  sizeClasses[size],
  leadingPadding.value,
])

// `<component :is>` con RouterLink resuelve las tres variantes (SPA / externo /
// button) sin duplicar el markup interno del mask + letras.
const rootTag = computed(() => (to ? RouterLink : href ? 'a' : 'button'))
const rootBindings = computed<Record<string, unknown>>(() => {
  if (to) return { to }
  if (href) return { href, target: '_blank', rel: 'noopener noreferrer' }
  return { type: 'button' }
})
</script>

<template>
  <component
    :is="rootTag"
    v-bind="{ ...rootBindings, ...$attrs }"
    :class="wrapperClasses"
    data-cursor="grow"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focus="onEnter"
    @blur="onLeave"
  >
    <!--
      Slot leading — contenido antes del texto (avatar, icono).
      El wrapper tiene `group`, así que el slot puede usar `group-hover:*`
      para reaccionar al hover del botón (ej. bg-muted-foreground → bg-primary).
    -->
    <slot name="leading" />

    <!--
      Mask del letter-swap. Dos copias splitteadas del texto:
      - A (aRef): copia visible en flujo normal.
      - B (bRef): copia absolute superpuesta, oculta arriba del mask.
      Hover ejecuta hoverTl.play(); leave ejecuta hoverTl.reverse().
    -->
    <span class="relative inline-block overflow-hidden leading-none">
      <span ref="aRef" class="block whitespace-nowrap" :aria-label="text">
        <span
          v-for="(char, i) in chars"
          :key="`a-${i}`"
          aria-hidden="true"
          class="cta-letter inline-block"
          >{{ char === ' ' ? '\u00A0' : char }}</span
        >
      </span>
      <span ref="bRef" aria-hidden="true" class="absolute left-0 top-0 block whitespace-nowrap">
        <span v-for="(char, i) in chars" :key="`b-${i}`" class="cta-letter inline-block">{{
          char === ' ' ? '\u00A0' : char
        }}</span>
      </span>
    </span>

    <!-- Slot trailing — opcional, para chevron / arrow / etc. después del texto. -->
    <slot name="trailing" />
  </component>
</template>
