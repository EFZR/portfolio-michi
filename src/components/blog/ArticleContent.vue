<script setup lang="ts">
import type { ContentBlock } from '@/data/articulos'

interface Props {
  bloques: readonly ContentBlock[]
}

const { bloques } = defineProps<Props>()
</script>

<template>
  <!--
    Renderizador de bloques. Un `v-if` por tipo en vez de `v-html`: cada bloque
    sale con las clases del design system y TypeScript garantiza que las
    propiedades existen (el tipo es una unión discriminada por `type`, así que
    dentro de cada rama conoce sus campos).

    La medida de lectura va acotada a `max-w-prose` (~65 caracteres). A sangre
    completa, una línea de 1800px es ilegible por muy bonita que sea la
    tipografía.
  -->
  <div class="space-y-7">
    <template v-for="(bloque, i) in bloques" :key="i">
      <p
        v-if="bloque.type === 'paragraph'"
        class="max-w-prose text-base leading-[1.75] text-foreground/85 sm:text-lg"
      >
        {{ bloque.text }}
      </p>

      <!--
        H2, no H3: el H1 es el titular del artículo y estos son sus apartados
        de primer nivel. Saltarse un nivel rompe el índice que construyen los
        lectores de pantalla para navegar un texto largo.
      -->
      <h2
        v-else-if="bloque.type === 'heading'"
        class="max-w-prose pt-6 font-heading text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
      >
        {{ bloque.text }}
      </h2>

      <figure v-else-if="bloque.type === 'quote'" class="max-w-prose py-2">
        <blockquote
          class="border-l-2 border-primary pl-6 font-heading text-xl italic leading-snug text-foreground sm:text-2xl"
        >
          {{ bloque.text }}
        </blockquote>
        <figcaption
          v-if="bloque.cite"
          class="mt-3 pl-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          {{ bloque.cite }}
        </figcaption>
      </figure>

      <component
        :is="bloque.ordered ? 'ol' : 'ul'"
        v-else-if="bloque.type === 'list'"
        :class="[
          'max-w-prose space-y-3 text-base leading-[1.75] text-foreground/85 sm:text-lg',
          bloque.ordered ? 'list-decimal' : 'list-disc',
          'marker:text-primary ps-6',
        ]"
      >
        <li v-for="(elemento, j) in bloque.items" :key="j" class="ps-1.5">{{ elemento }}</li>
      </component>

      <!--
        Código sin resaltado de sintaxis, a propósito: traer una librería de
        highlight por dos fragmentos al año pesaría más que el resto del blog
        junto. `overflow-x-auto` para que una línea larga scrollee dentro de su
        caja en vez de romper el ancho de la página.
      -->
      <figure v-else-if="bloque.type === 'code'" class="max-w-prose">
        <figcaption
          v-if="bloque.language"
          class="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
        >
          {{ bloque.language }}
        </figcaption>
        <pre
          class="overflow-x-auto rounded-md border border-border bg-surface p-5 font-mono text-sm leading-relaxed text-foreground"
        ><code>{{ bloque.code }}</code></pre>
      </figure>

      <!--
        Las imágenes del cuerpo SÍ salen de la medida de lectura: un texto
        estrecho con una imagen ancha es el ritmo de una revista. Y llevan pie
        obligatorio, así que nunca son decoración muda.
      -->
      <figure v-else-if="bloque.type === 'image'" class="py-4">
        <div class="overflow-hidden rounded-md bg-surface">
          <img :src="bloque.src" :alt="bloque.caption" loading="lazy" class="w-full object-cover" />
        </div>
        <figcaption class="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {{ bloque.caption }}
        </figcaption>
      </figure>
    </template>
  </div>
</template>
