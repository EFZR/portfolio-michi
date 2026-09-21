<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ArticleStamp from './ArticleStamp.vue'
import LikeButton from './LikeButton.vue'
import { fechaCorta, haceCuanto } from '@/lib/fechas'
import type { Article } from '@/data/articulos'

interface Props {
  articulo: Article
}

const { articulo } = defineProps<Props>()
</script>

<template>
  <!--
    ARTÍCULO PRINCIPAL (priority: 'hero'). Gran formato a doble columna.

    La tarjeta NO es un enlace envolviendo todo: un <button> de like dentro de
    un <a> es HTML inválido y un lío para el teclado. En su lugar, el enlace
    está en el titular y se ESTIRA sobre la tarjeta con un pseudo-elemento
    (`after:absolute after:inset-0`). Resultado: un único enlace con nombre
    accesible correcto, toda la superficie clicable, y el botón de like por
    encima con `relative z-10`.
  -->
  <article class="group relative grid gap-8 lg:grid-cols-12 lg:gap-12">
    <!--
      Imagen panorámica con revelado a color. En reposo va en gris: el listado
      entero se lee como una página impresa y el color entra solo al señalar.
    -->
    <div class="relative overflow-hidden rounded-md bg-surface lg:col-span-7">
      <img
        :src="articulo.coverImage"
        alt=""
        aria-hidden="true"
        class="aspect-[16/10] w-full scale-[1.03] object-cover grayscale transition-[transform,filter] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:grayscale-0 group-focus-within:scale-100 group-focus-within:grayscale-0"
      />

      <!--
        Barra flotante de metadatos — el ÚNICO `backdrop-blur` de todo el
        módulo. Aquí se gana el permiso: flota sobre una foto impredecible y
        necesita legibilidad sin tapar del todo lo que hay debajo.
      -->
      <div
        class="absolute inset-x-4 bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-background/75 px-4 py-3 backdrop-blur-md sm:inset-x-6 sm:bottom-6"
      >
        <div class="flex flex-wrap items-center gap-3">
          <ArticleStamp :published-at="articulo.publishedAt" />
          <span class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            {{ fechaCorta(articulo.publishedAt) }} · {{ articulo.readTime }} min
          </span>
        </div>

        <LikeButton :id="articulo.id" :base="articulo.likesCount" class="relative z-10" />
      </div>
    </div>

    <div class="flex flex-col justify-center lg:col-span-5">
      <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">
        {{ articulo.category }}
      </p>

      <h2
        class="mt-5 font-heading text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.02] tracking-tight text-foreground"
      >
        <RouterLink
          :to="`/blog/${articulo.slug}`"
          data-cursor="grow"
          class="after:absolute after:inset-0 after:rounded-md after:content-[''] focus:outline-none focus-visible:underline focus-visible:decoration-primary focus-visible:decoration-2 focus-visible:underline-offset-8"
        >
          {{ articulo.title }}
        </RouterLink>
      </h2>

      <p class="mt-6 max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">
        {{ articulo.excerpt }}
      </p>

      <!-- Regla que se dibuja al señalar: el mismo gesto que las fichas del portafolio. -->
      <div class="relative mt-8 h-px bg-border">
        <span
          aria-hidden="true"
          class="absolute inset-0 origin-left scale-x-0 bg-primary transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100 group-focus-within:scale-x-100"
        />
      </div>

      <p class="mt-5 font-mono text-xs tracking-[0.2em] text-muted-foreground">
        {{ articulo.author.toUpperCase() }} · {{ haceCuanto(articulo.publishedAt).toUpperCase() }}
      </p>
    </div>
  </article>
</template>
