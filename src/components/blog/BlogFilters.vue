<script setup lang="ts">
import { BLOG_CATEGORIES } from '@/data/articulos'

interface Props {
  /** Texto del buscador (v-model:busqueda). */
  busqueda: string
  /** Categoría activa, o cadena vacía para "todas" (v-model:categoria). */
  categoria: string
  /** Cuántos artículos quedan tras filtrar — se anuncia al cambiar. */
  resultados: number
}

const { busqueda, categoria, resultados } = defineProps<Props>()

const emit = defineEmits<{
  'update:busqueda': [valor: string]
  'update:categoria': [valor: string]
}>()

function alternarCategoria(valor: string) {
  emit('update:categoria', categoria === valor ? '' : valor)
}
</script>

<template>
  <div class="border-y border-border py-6">
    <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <!--
        Buscador. `type="search"` y `role="search"` en el contenedor: los
        lectores de pantalla ofrecen saltar directamente a las zonas de búsqueda
        de una página, y sin el rol esta no aparece en esa lista.
      -->
      <form role="search" class="relative w-full lg:max-w-sm" @submit.prevent>
        <label for="buscar-articulos" class="sr-only">Buscar en el blog</label>
        <svg
          aria-hidden="true"
          class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="buscar-articulos"
          :value="busqueda"
          type="search"
          placeholder="Buscar por título, tema o etiqueta"
          class="w-full rounded-md border border-border bg-surface py-3 pl-11 pr-4 text-sm text-foreground transition-colors duration-300 placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          @input="emit('update:busqueda', ($event.target as HTMLInputElement).value)"
        />
      </form>

      <!--
        Categorías. Botones con `aria-pressed`, no enlaces: no navegan, filtran
        lo de abajo. Pulsar la activa la desactiva, así que el mismo control
        pone y quita y no hace falta un botón extra de "todas".
      -->
      <div role="group" aria-label="Filtrar por categoría" class="flex flex-wrap gap-2">
        <button
          v-for="cat in BLOG_CATEGORIES"
          :key="cat"
          type="button"
          data-cursor="grow"
          :aria-pressed="categoria === cat"
          :class="[
            'rounded-md border px-3.5 py-2 text-xs font-medium uppercase tracking-[0.15em] transition-[color,border-color,background-color,box-shadow] duration-300',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            categoria === cat
              ? 'border-primary bg-primary text-background shadow-[0_0_16px_-4px] shadow-primary/60'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
          ]"
          @click="alternarCategoria(cat)"
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <!--
      Recuento en directo. Sin esto, filtrar con lector de pantalla no produce
      ninguna señal: la lista cambia en silencio y no hay forma de saber si
      quedó algo.
    -->
    <p aria-live="polite" class="mt-5 font-mono text-xs tracking-[0.2em] text-muted-foreground">
      <span class="text-foreground">{{ String(resultados).padStart(2, '0') }}</span>
      {{ resultados === 1 ? 'nota' : 'notas' }}
      <template v-if="categoria || busqueda">· filtrando</template>
      <template v-else>· todo el archivo</template>
    </p>
  </div>
</template>
