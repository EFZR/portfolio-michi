<script setup lang="ts">
// Import RELATIVO, no por alias: el panel monta este mismo componente para la
// vista previa del editor de bloques, y allí `@/` apunta a `apps/admin/src`.
// Regla: todo componente de la web que el panel reutilice importa en relativo.
import type { ContentBlock } from '../../data/articles'
import RichText from './RichText.vue'

interface Props {
  blocks: readonly ContentBlock[]
}

const { blocks } = defineProps<Props>()
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
    <template v-for="(block, i) in blocks" :key="i">
      <p
        v-if="block.type === 'paragraph'"
        class="max-w-prose text-base leading-[1.75] text-foreground/85 sm:text-lg"
      >
        <RichText :value="block.text" />
      </p>

      <!--
        H2, no H3: el H1 es el titular del artículo y estos son sus apartados
        de primer nivel. Saltarse un nivel rompe el índice que construyen los
        lectores de pantalla para navegar un texto largo.
      -->
      <h2
        v-else-if="block.type === 'heading'"
        class="max-w-prose pt-6 font-heading text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
      >
        <RichText :value="block.text" />
      </h2>

      <figure v-else-if="block.type === 'quote'" class="max-w-prose py-2">
        <blockquote
          class="border-l-2 border-primary pl-6 font-heading text-xl italic leading-snug text-foreground sm:text-2xl"
        >
          <RichText :value="block.text" />
        </blockquote>
        <figcaption
          v-if="block.cite"
          class="mt-3 pl-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          {{ block.cite }}
        </figcaption>
      </figure>

      <component
        :is="block.ordered ? 'ol' : 'ul'"
        v-else-if="block.type === 'list'"
        :class="[
          'max-w-prose space-y-3 text-base leading-[1.75] text-foreground/85 sm:text-lg',
          block.ordered ? 'list-decimal' : 'list-disc',
          'marker:text-primary ps-6',
        ]"
      >
        <li v-for="(elemento, j) in block.items" :key="j" class="ps-1.5">
          <RichText :value="elemento" />
        </li>
      </component>

      <!--
        Código sin resaltado de sintaxis, a propósito: traer una librería de
        highlight por dos fragmentos al año pesaría más que el resto del blog
        junto. `overflow-x-auto` para que una línea larga scrollee dentro de su
        caja en vez de romper el ancho de la página.
      -->
      <figure v-else-if="block.type === 'code'" class="max-w-prose">
        <figcaption
          v-if="block.language"
          class="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
        >
          {{ block.language }}
        </figcaption>
        <pre
          class="overflow-x-auto rounded-md border border-border bg-surface p-5 font-mono text-sm leading-relaxed text-foreground"
        ><code>{{ block.code }}</code></pre>
      </figure>

      <!--
        Las imágenes del cuerpo SÍ salen de la medida de lectura: un texto
        estrecho con una imagen ancha es el ritmo de una revista. Y llevan pie
        obligatorio, así que nunca son decoración muda.
      -->
      <figure v-else-if="block.type === 'image'" class="py-4">
        <div class="overflow-hidden rounded-md bg-surface">
          <img :src="block.src" :alt="block.caption" loading="lazy" class="w-full object-cover" />
        </div>
        <figcaption class="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {{ block.caption }}
        </figcaption>
      </figure>
    </template>
  </div>
</template>
