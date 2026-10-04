<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import ArticleSpotlight from '@/components/blog/ArticleSpotlight.vue'
import ArticleCard from '@/components/blog/ArticleCard.vue'
import ArticleRow from '@/components/blog/ArticleRow.vue'
import BlogFilters from '@/components/blog/BlogFilters.vue'
import { ARTICLES } from '@/data/articles'
import { UI } from '@/data/ui'
import { toDate } from '@/lib/dates'

// ScrollTrigger vive dentro del paquete `gsap`. Registro idempotente a nivel módulo.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()
const noMotion = computed(() => reducedMotion.value === 'reduce')

// ──────────────────────────────── FILTROS ────────────────────────────────

const search = ref('')
const category = ref('')

/**
 * Orden base: del más reciente al más antiguo. La PRIORIDAD decide la forma de
 * la pieza, no su sitio en el tiempo — un destacado de hace un año no debería
 * adelantar a la nota de ayer.
 */
const byDate = computed(() =>
  [...ARTICLES].sort((a, b) => toDate(b.publishedAt).getTime() - toDate(a.publishedAt).getTime()),
)

/**
 * La búsqueda mira título, entradilla, categoría y etiquetas. Se normaliza con
 * `NFD` + quitar diacríticos para que "direccion" encuentre "Dirección": exigir
 * la tilde exacta convierte el buscador en un examen de ortografía.
 */
function normalizar(texto: string): string {
  // \u0300-\u036f es el bloque de marcas diacríticas combinantes, que es lo
  // que `NFD` separa de la letra. Va escapado y no con los caracteres
  // literales: en el editor serían invisibles y cualquiera los borraría.
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const filtered = computed(() => {
  const termino = normalizar(search.value.trim())

  return byDate.value.filter((a) => {
    if (category.value && a.category !== category.value) return false
    if (!termino) return true

    const heno = normalizar([a.title, a.excerpt, a.category, ...a.tags].join(' '))
    return heno.includes(termino)
  })
})

/**
 * El destacado solo ocupa el gran formato cuando se está viendo el archivo
 * ENTERO. Con un filtro puesto, la lista es una respuesta a una búsqueda y
 * ascender una pieza por su prioridad editorial estorbaría en vez de ayudar:
 * baja a tarjeta como el resto.
 */
const sinFiltro = computed(() => !search.value.trim() && !category.value)

const destacado = computed(() =>
  sinFiltro.value ? (filtered.value.find((a) => a.priority === 'hero') ?? null) : null,
)

const cards = computed(() =>
  filtered.value.filter(
    (a) => a.id !== destacado.value?.id && (a.priority === 'high' || a.priority === 'hero'),
  ),
)

const rows = computed(() => filtered.value.filter((a) => a.priority === 'normal'))

function clearFilters() {
  search.value = ''
  category.value = ''
}

function delay(i: number): string {
  return `${Math.min(i, 5) * 60}ms`
}

// ─────────────────────────────── REVELADO ───────────────────────────────

const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []

onMounted(() => {
  const section = sectionRef.value
  if (!section || noMotion.value) return

  const kicker = section.querySelector<HTMLElement>('.reveal-kicker')
  const title = section.querySelectorAll<HTMLElement>('.reveal-titulo')
  const body = section.querySelectorAll<HTMLElement>('.reveal-cuerpo')

  // Mismo reveal que Portafolio y Contacto: una sola forma de entrar en una página.
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 75%', toggleActions: 'play none none reverse' },
  })

  if (kicker) tl.from(kicker, { y: 20, opacity: 0, duration: 0.5 })
  tl.from(title, { yPercent: 110, duration: 0.9, stagger: 0.12, ease: 'power4.out' }, '-=0.25')
  tl.from(body, { y: 32, opacity: 0, duration: 0.7, stagger: 0.1 }, '-=0.5')

  timelines.push(tl)
  if (tl.scrollTrigger) triggers.push(tl.scrollTrigger)
})

onUnmounted(() => {
  triggers.forEach((t) => t.kill())
  timelines.forEach((tl) => tl.kill())
  triggers.length = 0
  timelines.length = 0
})
</script>

<template>
  <!--
    Página /blog — listado editorial con tres jerarquías de presentación.

    Mismo esqueleto que Portafolio y Contacto: `pt` corto porque el `pt-24` del
    <main> ya despeja la navbar, `pb` propio porque el footer abre con un borde
    a todo el ancho, y `BaseContainer` a sangre para compartir gutter con la
    navbar.
  -->
  <section ref="sectionRef" class="pt-10 pb-24 sm:pt-14 sm:pb-32">
    <BaseContainer size="bleed">
      <header class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="reveal-kicker text-xs font-medium uppercase tracking-[0.3em] text-primary">
            {{ UI.blog.kicker }}
          </p>

          <h1 class="mt-4 text-4xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
            <span class="block overflow-hidden py-[0.1em]">
              <span class="reveal-titulo block">Notas</span>
            </span>
            <span class="block overflow-hidden py-[0.1em]">
              <span class="reveal-titulo block font-heading italic">de taller</span>
            </span>
          </h1>
        </div>

        <p
          class="reveal-cuerpo max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base"
        >
          Lo que voy aprendiendo mientras trabajo. Sin fórmulas ni listas de diez pasos: solo lo que
          me funcionó y lo que no.
        </p>
      </header>

      <div class="reveal-cuerpo mt-12 sm:mt-16">
        <BlogFilters
          v-model:search="search"
          v-model:category="category"
          :results="filtered.length"
        />
      </div>

      <!-- Sin resultados: una salida, no un callejón. -->
      <div v-if="!filtered.length" class="py-24 text-center sm:py-32">
        <p class="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {{ UI.blog.emptyTitle }}
        </p>
        <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {{ UI.blog.emptyDetail }}
        </p>
        <div class="mt-8 flex justify-center">
          <BaseCtaButton :text="UI.blog.ctaShowAll" variant="outline" @click="clearFilters" />
        </div>
      </div>

      <template v-else>
        <!-- 1 · DESTACADO -->
        <div v-if="destacado" class="reveal-cuerpo mt-14 sm:mt-20">
          <ArticleSpotlight :article="destacado" />
        </div>

        <!-- 2 · ALTA PRIORIDAD -->
        <TransitionGroup
          v-if="cards.length"
          tag="div"
          class="mt-16 grid gap-10 sm:mt-24 sm:grid-cols-2 sm:gap-12 lg:gap-16"
          :enter-active-class="
            noMotion
              ? ''
              : 'transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] delay-200'
          "
          :enter-from-class="noMotion ? '' : 'translate-y-8 opacity-0'"
          :leave-active-class="noMotion ? '' : 'transition duration-200 ease-in'"
          :leave-to-class="noMotion ? '' : 'opacity-0'"
          :move-class="noMotion ? '' : 'transition-transform duration-500 ease-out'"
        >
          <ArticleCard
            v-for="(article, i) in cards"
            :key="article.id"
            :style="noMotion ? undefined : { transitionDelay: delay(i) }"
            :article="article"
          />
        </TransitionGroup>

        <!-- 3 · ESTÁNDAR -->
        <section v-if="rows.length" class="mt-20 sm:mt-28">
          <h2 class="text-xs font-medium uppercase tracking-[0.3em] text-primary">
            {{ sinFiltro ? 'Todo lo demás' : 'Más results' }}
          </h2>

          <TransitionGroup
            tag="div"
            class="mt-8 border-b border-border"
            :enter-active-class="noMotion ? '' : 'transition duration-500 ease-out delay-200'"
            :enter-from-class="noMotion ? '' : 'translate-y-6 opacity-0'"
            :leave-active-class="noMotion ? '' : 'transition duration-200 ease-in'"
            :leave-to-class="noMotion ? '' : 'opacity-0'"
            :move-class="noMotion ? '' : 'transition-transform duration-500 ease-out'"
          >
            <ArticleRow
              v-for="(article, i) in rows"
              :key="article.id"
              :style="noMotion ? undefined : { transitionDelay: delay(i) }"
              :article="article"
              :folio="i + 1"
            />
          </TransitionGroup>
        </section>
      </template>
    </BaseContainer>
  </section>
</template>
