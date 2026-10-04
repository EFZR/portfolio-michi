<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ArticleStamp from './ArticleStamp.vue'
import LikeButton from './LikeButton.vue'
import { isArchived, shortDate } from '@/lib/dates'
import type { Article } from '@/data/articles'
import ResponsiveImage from '@/components/ui/ResponsiveImage.vue'

interface Props {
  article: Article
}

const { article } = defineProps<Props>()

/**
 * Tratamiento de archivo: el titular pierde peso y la imagen no recupera color
 * del todo. No se oculta nada — sigue siendo perfectamente legible — pero al
 * recorrer el listado la vista pasa antes por lo reciente, que es de lo que
 * trata la jerarquía temporal.
 */
const sobrio = computed(() => isArchived(article.publishedAt))
</script>

<template>
  <!--
    ALTA PRIORIDAD (priority: 'high'). Tarjeta mediana con imagen, entradilla y
    metadatos. Mismo patrón de enlace estirado que el destacado: el <a> vive en
    el titular y cubre la tarjeta con un pseudo-elemento.
  -->
  <article class="group relative flex flex-col">
    <div class="relative overflow-hidden rounded-md bg-surface">
      <ResponsiveImage
        :media-id="article.coverImage"
        alt=""
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 48vw, 92vw"
        :img-class="[
          'aspect-[16/10] w-full object-cover transition-[transform,filter] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          'group-hover:scale-[1.04] group-focus-within:scale-[1.04]',
          sobrio
            ? 'grayscale group-hover:grayscale-[0.4]'
            : 'grayscale-[0.55] group-hover:grayscale-0',
        ]"
      />
    </div>

    <div class="mt-5 flex flex-1 flex-col">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-[0.7rem] font-medium uppercase tracking-[0.25em] text-primary">
          {{ article.category }}
        </span>
        <ArticleStamp :published-at="article.publishedAt" />
      </div>

      <h3
        :class="[
          'mt-3 font-heading text-2xl leading-tight tracking-tight transition-colors duration-500 sm:text-3xl',
          sobrio ? 'font-normal text-foreground/80' : 'font-semibold text-foreground',
          'group-hover:text-primary group-focus-within:text-primary',
        ]"
      >
        <RouterLink
          :to="`/blog/${article.slug}`"
          data-cursor="grow"
          class="after:absolute after:inset-0 after:rounded-md after:content-[''] focus:outline-none focus-visible:underline focus-visible:decoration-primary focus-visible:decoration-2 focus-visible:underline-offset-4"
        >
          {{ article.title }}
        </RouterLink>
      </h3>

      <p class="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {{ article.excerpt }}
      </p>

      <!-- `mt-auto` clava el pie abajo: las tarjetas de una fila acaban parejas. -->
      <div class="mt-auto flex items-center justify-between gap-4 pt-6">
        <span class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
          {{ shortDate(article.publishedAt) }} · {{ article.readTime }} min
        </span>
        <LikeButton :id="article.id" :base="article.likesCount" class="relative z-10" />
      </div>
    </div>
  </article>
</template>
