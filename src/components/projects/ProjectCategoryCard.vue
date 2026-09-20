<script setup lang="ts">
import type { Categoria } from '@/data/proyectos'

interface Props {
  categoria: Categoria
  /** Rubro seleccionado actualmente — deja la tarjeta en su estado revelado. */
  activa: boolean
  /** Cuántos proyectos tiene el rubro; folio de la esquina. */
  total: number
  /** Posición (1-based) para la numeración editorial. */
  indice: number
}

const { categoria, activa, total, indice } = defineProps<Props>()

const emit = defineEmits<{
  /** Pide filtrar por este rubro (o volver a "todos" si ya estaba activo). */
  toggle: [id: Categoria['id']]
}>()
</script>

<template>
  <!--
    Tarjeta de RUBRO — botón de filtro, no un link: no navega, cambia el
    contenido del grid de abajo. `aria-pressed` comunica ese estado de dos
    posiciones (un link no podría expresarlo).

    EL REVELADO de todas las capas se dispara con TRES variantes que valen
    exactamente lo mismo y por eso van siempre juntas:

      group-hover:*              → ratón
      group-focus-visible:*      → teclado (paridad real, no un outline de consuelo)
      group-data-[activa=true]:* → el rubro filtrado se queda revelado

    Están escritas literalmente en cada elemento a propósito: Tailwind v4
    detecta clases ESCANEANDO EL TEXTO del archivo, así que cualquier intento de
    componerlas en runtime (un helper que concatene `group-hover:` + utilidad)
    compila a la nada. Verboso pero correcto; no lo "simplifiques" a un computed.
  -->
  <button
    type="button"
    data-cursor="grow"
    :data-activa="activa"
    :aria-pressed="activa"
    class="group relative block aspect-[4/5] w-full overflow-hidden rounded-md bg-surface text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:aspect-[3/4]"
    @click="emit('toggle', categoria.id)"
  >
    <!--
      Capa 1 — FOTO. Arranca desaturada y con micro-zoom ya aplicado; al
      revelarse recupera el color y se ASIENTA (1.08 → 1). El movimiento va
      hacia el reposo, no hacia el ruido: es la diferencia entre "revista" y
      "banner". Ease largo (900ms) para que se lea como un enfoque.
    -->
    <img
      :src="categoria.imagen"
      alt=""
      aria-hidden="true"
      loading="lazy"
      class="absolute inset-0 h-full w-full scale-[1.08] object-cover grayscale transition-[transform,filter] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:grayscale-0 group-focus-visible:scale-100 group-focus-visible:grayscale-0 group-data-[activa=true]:scale-100 group-data-[activa=true]:grayscale-0"
    />

    <!--
      Capa 2 — velo neutro: asegura contraste del texto sobre cualquier foto.
      En reposo tapa bastante (la tarjeta es tipografía); al revelarse se retira
      casi del todo para que la foto sea la protagonista.
    -->
    <div
      aria-hidden="true"
      class="absolute inset-0 bg-foreground/60 transition-colors duration-700 ease-out group-hover:bg-foreground/20 group-focus-visible:bg-foreground/20 group-data-[activa=true]:bg-foreground/20"
    />

    <!--
      Capa 3 — LAVADO ULTRAVIOLET. Sube desde el pie (origin-bottom, scale-y
      0 → 1) como una marea de color. Es el 10% de la regla 60/30/10 apareciendo
      solo en el momento de la interacción, nunca en reposo.

      Opacidades DELIBERADAMENTE bajas (45% abajo, 8% a media altura): el morado
      tiñe la foto, no la sustituye. Con valores más altos la imagen se volvía
      una silueta morada y las tres tarjetas se parecían entre sí — el sentido
      del revelado es justo el contrario, que se vea lo que hay debajo.
    -->
    <div
      aria-hidden="true"
      class="absolute inset-0 origin-bottom scale-y-0 bg-gradient-to-t from-primary/45 via-primary/8 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-y-100 group-focus-visible:scale-y-100 group-data-[activa=true]:scale-y-100"
    />

    <!--
      Sombra de pie, neutra y por ENCIMA del lavado UV. Al bajar el morado, el
      texto blanco se quedaba sin suelo sobre las fotos claras; esto le devuelve
      contraste sin devolver saturación.
    -->
    <div
      aria-hidden="true"
      class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-foreground/70 to-transparent"
    />

    <!-- Folio editorial, esquina superior. -->
    <div class="absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-6">
      <span class="font-mono text-[0.7rem] tracking-[0.25em] text-background/70">
        0{{ indice }}
      </span>
      <span class="font-mono text-[0.7rem] tracking-[0.25em] text-background/70">
        {{ total }} historias
      </span>
    </div>

    <!-- Bloque tipográfico al pie — la "doble página" en miniatura. -->
    <div class="absolute inset-x-0 bottom-0 p-5 sm:p-6">
      <p
        class="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-background/70 transition-colors duration-500 ease-out group-hover:text-background group-focus-visible:text-background group-data-[activa=true]:text-background"
      >
        {{ categoria.kicker }}
      </p>

      <!--
        El título SUBE un par de píxeles al revelarse. Movimiento mínimo y con
        el mismo ease que la foto: tipografía e imagen se mueven como una sola
        pieza, que es lo que hace que se sienta fluido y no "animado".
      -->
      <h3
        class="mt-2 font-heading text-3xl font-semibold leading-none tracking-tight text-background transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-focus-visible:-translate-y-1 group-data-[activa=true]:-translate-y-1 sm:text-4xl"
      >
        {{ categoria.nombre }}
      </h3>

      <!-- Regla que se dibuja de izquierda a derecha bajo el título. -->
      <div
        aria-hidden="true"
        class="mt-4 h-px origin-left scale-x-0 bg-background/80 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100 group-data-[activa=true]:scale-x-100"
      />

      <!--
        La bajada SOLO existe en el revelado: en reposo la tarjeta es tipografía
        y foto, sin ruido. `max-h` acompaña a la opacidad para que el bloque no
        reserve el hueco mientras está oculto (el pie no "salta" al entrar).
      -->
      <p
        class="max-h-0 translate-y-2 overflow-hidden text-sm leading-relaxed text-background/85 opacity-0 transition-[max-height,opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:max-h-24 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:max-h-24 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-data-[activa=true]:max-h-24 group-data-[activa=true]:translate-y-0 group-data-[activa=true]:opacity-100"
      >
        <span class="mt-3 block">{{ categoria.descripcion }}</span>
      </p>
    </div>

    <!-- Marco UV persistente del rubro activo — señal de "filtro puesto". -->
    <div
      aria-hidden="true"
      :class="[
        'pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset transition-colors duration-500',
        activa ? 'ring-primary' : 'ring-transparent',
      ]"
    />
  </button>
</template>
