<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { gsap } from 'gsap'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import ArticleContent from '@/components/blog/ArticleContent.vue'
import ArticleStamp from '@/components/blog/ArticleStamp.vue'
import ArticleCard from '@/components/blog/ArticleCard.vue'
import LikeButton from '@/components/blog/LikeButton.vue'
import { articlePorRuta, relacionados } from '@/data/articulos'
import { fechaLarga, haceCuanto } from '@/lib/fechas'

const route = useRoute()
const reducedMotion = usePreferredReducedMotion()
const articuloRef = ref<HTMLElement | null>(null)

/**
 * La URL admite el `slug` o el `id` (`/blog/el-encuadre…` y `/blog/1861864`
 * llevan al mismo sitio). Es un `computed` sobre el parámetro, no una lectura
 * de una vez: al navegar entre relacionados Vue Router REUTILIZA el componente
 * —misma ruta, distinto parámetro— y una constante se quedaría congelada en el
 * primer artículo.
 */
const articulo = computed(() => articlePorRuta(String(route.params.slug)))

const otros = computed(() => (articulo.value ? relacionados(articulo.value, 3) : []))

/**
 * Título del documento. El `router.afterEach` global ya escribió el
 * `meta.title` genérico de la ruta; esto corre después (el componente se monta
 * tras la navegación) y lo sustituye por el del artículo concreto.
 */
watchEffect(() => {
  if (articulo.value) document.title = `${articulo.value.title} · Princess Portfolio`
})

// Navegar a un relacionado reutiliza el componente y NO vuelve a montarlo: sin
// esto, el artículo nuevo se abriría a media página, donde quedó el scroll.
watch(
  () => route.params.slug,
  () => window.scrollTo({ top: 0, behavior: 'auto' }),
)

const timelines: gsap.core.Timeline[] = []

onMounted(() => {
  const raiz = articuloRef.value
  if (!raiz || reducedMotion.value === 'reduce') return

  // Sin ScrollTrigger: al abrir un artículo se está mirando la cabecera, así
  // que la entrada se reproduce una vez al montar y no al entrar en viewport.
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
  tl.from(raiz.querySelectorAll('.post-reveal'), {
    y: 28,
    opacity: 0,
    duration: 0.7,
    stagger: 0.09,
  })
  const portada = raiz.querySelector<HTMLElement>('.post-portada')
  if (portada) tl.from(portada, { scale: 1.05, duration: 1.1, ease: 'power2.out' }, 0.15)

  timelines.push(tl)
})

onUnmounted(() => {
  timelines.forEach((tl) => tl.kill())
  timelines.length = 0
})
</script>

<template>
  <!--
    La vista de artículo es la ÚNICA del sitio que no va a sangre. El resto
    —Portafolio, Contacto, el listado del blog— son páginas de exploración y
    ganan ocupando el ancho; una de lectura, no: con el contenedor a sangre, la
    medida de lectura quedaba pegada al borde izquierdo y los dos tercios
    derechos de la pantalla se quedaban vacíos. `default` (máx. 1024px) centra
    la página entera y la columna de texto vuelve a tener márgenes a los lados.
  -->
  <section class="pt-10 pb-24 sm:pt-14 sm:pb-32">
    <BaseContainer size="default">
      <!-- Artículo inexistente: se explica y se ofrece salida, sin un 404 seco. -->
      <div v-if="!articulo" class="py-24 text-center sm:py-32">
        <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">No encontrado</p>
        <h1 class="mt-4 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Esta nota no existe
        </h1>
        <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Puede que la haya movido o que el enlace venga cortado.
        </p>
        <div class="mt-8 flex justify-center">
          <BaseCtaButton to="/blog" text="Ver todas las notas" variant="outline" />
        </div>
      </div>

      <article v-else ref="articuloRef">
        <!-- Volver: primero en el orden de tabulación, antes que el titular. -->
        <RouterLink
          to="/blog"
          data-cursor="grow"
          class="post-reveal group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-300 hover:text-primary focus:outline-none focus-visible:text-primary"
        >
          <svg
            class="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Todas las notas
        </RouterLink>

        <header class="mt-10 max-w-4xl">
          <div class="post-reveal flex flex-wrap items-center gap-3">
            <span class="text-xs font-medium uppercase tracking-[0.3em] text-primary">
              {{ articulo.category }}
            </span>
            <ArticleStamp :published-at="articulo.publishedAt" />
          </div>

          <h1
            class="post-reveal mt-6 font-heading text-[clamp(2.25rem,5.5vw,4.5rem)] font-semibold leading-[1.02] tracking-tight text-foreground"
          >
            {{ articulo.title }}
          </h1>

          <p
            class="post-reveal mt-6 max-w-prose text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            {{ articulo.excerpt }}
          </p>

          <!--
            Barra de metadatos. La fecha va en un <time> con `datetime`: legible
            para quien lee y procesable para buscadores y lectores de pantalla,
            que anuncian la fecha completa en vez de deletrear "18 SEP 2026".
          -->
          <div
            class="post-reveal mt-10 flex flex-wrap items-center justify-between gap-6 border-y border-border py-5"
          >
            <p class="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {{ articulo.author }}
              <span class="mx-2 text-border">·</span>
              <time :datetime="articulo.publishedAt">{{ fechaLarga(articulo.publishedAt) }}</time>
              <span class="mx-2 text-border">·</span>
              {{ articulo.readTime }} min de lectura
            </p>

            <LikeButton :id="articulo.id" :base="articulo.likesCount" tamano="lg" />
          </div>
        </header>

        <!-- Portada. `post-portada` recibe el zoom de entrada, separado del <img>. -->
        <div class="post-reveal mt-12 overflow-hidden rounded-md bg-surface sm:mt-16">
          <img
            :src="articulo.coverImage"
            :alt="`Imagen de portada de ${articulo.title}`"
            class="post-portada aspect-[16/9] w-full object-cover"
          />
        </div>

        <div class="mt-14 sm:mt-20">
          <ArticleContent :bloques="articulo.content" />
        </div>

        <!-- Cierre: etiquetas, like de salida y la fecha en relativo. -->
        <footer class="mt-16 max-w-prose border-t border-border pt-8 sm:mt-20">
          <ul class="flex flex-wrap gap-2">
            <li v-for="tag in articulo.tags" :key="tag">
              <BaseBadge variant="mono">#{{ tag }}</BaseBadge>
            </li>
          </ul>

          <div class="mt-8 flex flex-wrap items-center justify-between gap-6">
            <p class="text-sm leading-relaxed text-muted-foreground">
              Publicado {{ haceCuanto(articulo.publishedAt) }}. ¿Te sirvió?
            </p>
            <LikeButton :id="articulo.id" :base="articulo.likesCount" tamano="lg" />
          </div>
        </footer>

        <!-- RELACIONADOS. Reutiliza la tarjeta de alta prioridad del listado. -->
        <section v-if="otros.length" class="mt-24 border-t border-border pt-14 sm:mt-32 sm:pt-20">
          <h2 class="text-xs font-medium uppercase tracking-[0.3em] text-primary">Sigue leyendo</h2>

          <div class="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-12 lg:grid-cols-3 lg:gap-10">
            <ArticleCard v-for="otro in otros" :key="otro.id" :articulo="otro" />
          </div>
        </section>
      </article>
    </BaseContainer>
  </section>
</template>
