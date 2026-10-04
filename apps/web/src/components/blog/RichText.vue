<script setup lang="ts">
import type { RichText } from '../../data/articles'

/**
 * Pinta un texto que puede venir plano o en fragmentos con marcas.
 *
 * SIN `v-html`, que es la norma del proyecto: cada marca sale con su propia
 * etiqueta y el contenido se interpola siempre. Un texto que traiga `<script>`
 * se ve como texto, que es lo correcto.
 *
 * Las marcas se anidan en orden fijo — `<a>` fuera, `<code>` dentro — para que
 * un fragmento con varias produzca siempre el mismo árbol. Anidarlas en el
 * orden en que llegan daría marcado distinto para el mismo contenido.
 *
 * Import relativo, no por alias: el panel monta este componente en la vista
 * previa del editor y allí `@/` apunta a otra app.
 */
const { value } = defineProps<{ value: RichText }>()

const fragmentos = Array.isArray(value)
  ? value
  : [{ text: String(value ?? '') } as { text: string }]
</script>

<template>
  <template v-for="(run, i) in fragmentos" :key="i">
    <component
      :is="run.href ? 'a' : 'span'"
      v-bind="
        run.href
          ? {
              href: run.href,
              // Los enlaces externos abren fuera y sin pasar el referer.
              ...(run.href.startsWith('http')
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {}),
              'data-cursor': 'grow',
              class:
                'underline decoration-primary decoration-2 underline-offset-4 transition-colors duration-300 hover:text-primary',
            }
          : {}
      "
    >
      <component :is="run.bold ? 'strong' : 'span'" :class="run.bold ? 'font-semibold' : ''">
        <component :is="run.italic ? 'em' : 'span'">
          <component
            :is="run.code ? 'code' : 'span'"
            :class="run.code ? 'rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.9em]' : ''"
            >{{ run.text }}</component
          >
        </component>
      </component>
    </component>
  </template>
</template>
