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
  /** Folio editorial dentro de la lista. */
  folio: number
}

const { article, folio } = defineProps<Props>()

const sobrio = computed(() => isArchived(article.publishedAt))
</script>

<template>
  <!--
    ESTÁNDAR (priority: 'normal'). Lista, no tarjeta.

    Para lo habitual, una fila con filete es más limpia y mucho más rápida de
    recorrer que un mosaico: el ojo baja por una sola columna de titulares en
    vez de saltar entre cajas. La miniatura es pequeña a propósito — acompaña,
    no compite con las dos jerarquías de arriba.
  -->
  <article
    class="group relative grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-t border-border py-6 sm:grid-cols-[auto_5rem_1fr_auto] sm:gap-x-6 sm:py-7"
  >
    <span
      aria-hidden="true"
      class="font-mono text-[0.65rem] tracking-[0.25em] text-muted-foreground"
    >
      {{ String(folio).padStart(2, '0') }}
    </span>

    <div
      class="col-start-2 row-span-2 hidden overflow-hidden rounded-md bg-surface sm:col-start-2 sm:row-span-1 sm:block"
    >
      <ResponsiveImage
        :media-id="article.coverImage"
        alt=""
        sizes="80px"
        :img-class="[
          'aspect-square w-20 object-cover transition-[transform,filter] duration-700 ease-out',
          'group-hover:scale-105 group-focus-within:scale-105',
          sobrio ? 'grayscale' : 'grayscale-[0.6] group-hover:grayscale-0',
        ]"
      />
    </div>

    <div class="col-start-2 sm:col-start-3">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-[0.65rem] font-medium uppercase tracking-[0.25em] text-primary">
          {{ article.category }}
        </span>
        <ArticleStamp :published-at="article.publishedAt" />
      </div>

      <h3
        :class="[
          'mt-2 font-heading text-xl leading-snug tracking-tight transition-colors duration-500 sm:text-2xl',
          sobrio ? 'font-normal text-foreground/75' : 'font-semibold text-foreground',
          'group-hover:text-primary group-focus-within:text-primary',
        ]"
      >
        <RouterLink
          :to="`/blog/${article.slug}`"
          data-cursor="grow"
          class="after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:underline focus-visible:decoration-primary focus-visible:decoration-2 focus-visible:underline-offset-4"
        >
          {{ article.title }}
        </RouterLink>
      </h3>

      <p class="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {{ article.excerpt }}
      </p>

      <p
        class="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground sm:hidden"
      >
        {{ shortDate(article.publishedAt) }} · {{ article.readTime }} min
      </p>
    </div>

    <div class="col-start-2 flex items-center gap-5 sm:col-start-4 sm:justify-end">
      <span
        class="hidden font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground sm:block"
      >
        {{ shortDate(article.publishedAt) }} · {{ article.readTime }} min
      </span>
      <LikeButton :id="article.id" :base="article.likesCount" class="relative z-10" />
    </div>
  </article>
</template>
