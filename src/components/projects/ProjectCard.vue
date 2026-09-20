<script setup lang="ts">
import { nombreCategoria, type Proyecto } from '@/data/proyectos'

interface Props {
  proyecto: Proyecto
  /** Folio visible (1-based) dentro de la selección actual. */
  folio: number
}

const { proyecto, folio } = defineProps<Props>()

const emit = defineEmits<{
  /** Pide abrir la ficha ampliada de este proyecto. */
  abrir: [proyecto: Proyecto]
}>()

/** "1" → "01". Misma numeración editorial que el folio de Servicios. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
</script>

<template>
  <!--
    Tarjeta de PROYECTO. Deliberadamente más sobria que la de rubro: aquí manda
    la imagen y el hover apenas insinúa (zoom corto, velo que se levanta, una
    regla que se dibuja). Toda la carga expresiva vive arriba, en las tarjetas
    de categoría; si las dos gritaran, la sección se leería como un catálogo de
    efectos en vez de como una revista.

    Es un <button> porque abre un diálogo, no una página. El día que exista
    `/projects/:slug` con contenido real, esto pasa a ser un RouterLink y el
    modal se queda como atajo.
  -->
  <button
    type="button"
    data-cursor="grow"
    class="group block w-full text-left focus:outline-none"
    :aria-label="`Abrir la historia de ${proyecto.titulo}`"
    @click="emit('abrir', proyecto)"
  >
    <!--
      Proporción ÚNICA para todas las fichas: 4:5, que es exactamente la de las
      imágenes de origen (1000×1250). Al coincidir, `object-cover` no recorta
      nada y la retícula queda perfectamente regular — ninguna ficha destaca
      sobre otra.
    -->
    <figure
      class="relative aspect-[4/5] overflow-hidden rounded-md bg-surface ring-1 ring-inset ring-transparent transition-[box-shadow] duration-500 group-focus-visible:ring-primary"
    >
      <img
        :src="proyecto.imagen"
        alt=""
        aria-hidden="true"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
      />

      <!-- Velo mínimo que se retira al hover: la foto "despierta" sin cambiar de color. -->
      <div
        aria-hidden="true"
        class="absolute inset-0 bg-foreground/10 transition-opacity duration-700 ease-out group-hover:opacity-0 group-focus-visible:opacity-0"
      />

      <!--
        Indicador de INSPECCIONAR. Una sola señal, en la esquina, que aparece
        con el hover: nada de overlays a pantalla completa con un "VER MÁS"
        centrado. La cruz gira 90° al entrar — el mismo gesto que el botón de
        cerrar del modal, leído al revés.
      -->
      <span
        aria-hidden="true"
        class="absolute right-3 top-3 flex h-9 w-9 translate-y-1 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 sm:right-4 sm:top-4"
      >
        <svg
          class="h-4 w-4 transition-transform duration-500 ease-out group-hover:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </figure>

    <!--
      Pie de foto. Regla superior de ancho completo con un tramo UV que se
      dibuja encima al hover: el acento aparece en la interacción y en reposo la
      tarjeta es blanco, negro y foto.
    -->
    <div class="relative mt-4 border-t border-border pt-4">
      <span
        aria-hidden="true"
        class="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-primary transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />

      <div class="flex items-baseline justify-between gap-4">
        <h3
          class="font-heading text-xl font-semibold leading-tight tracking-tight text-foreground transition-colors duration-500 group-hover:text-primary group-focus-visible:text-primary sm:text-2xl"
        >
          {{ proyecto.titulo }}
        </h3>

        <span class="shrink-0 font-mono text-[0.7rem] tracking-[0.25em] text-muted-foreground">
          {{ pad(folio) }}
        </span>
      </div>

      <p class="mt-2 text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
        {{ nombreCategoria(proyecto.categoria) }} · {{ proyecto.anio }}
      </p>

      <!-- `line-clamp-2` mantiene los pies parejos entre fichas vecinas. -->
      <p class="mt-3 line-clamp-2 max-w-md text-sm leading-relaxed text-foreground/75">
        {{ proyecto.resumen }}
      </p>
    </div>
  </button>
</template>
