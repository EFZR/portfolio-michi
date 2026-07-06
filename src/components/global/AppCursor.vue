<script setup lang="ts">
import { useCustomCursor } from '@/composables/useCustomCursor'

const { x, y, scale, isEnabled } = useCustomCursor()
</script>

<template>
  <!--
    Estructura de dos divs anidados:
      - outer: maneja la posición (sin transition — el lerp del composable ya da smoothness).
      - inner: maneja la escala (con transition CSS — cambia poco y queremos easing).
    Separar evita que la transition de la escala "frene" la traslación frame-a-frame.

    aria-hidden y pointer-events-none: es puramente decorativo, no debe capturar
    eventos ni anunciarse a lectores de pantalla.

    `mix-blend-mode: difference` + `bg-background` (off-white): el cursor
    invierte el color de lo que tiene atrás pixel a pixel — siempre visible
    sobre cualquier fondo (off-white → negro, negro → off-white, UV → verde
    amarillo, etc.). Es el patrón estándar de portfolios premium (Bogdan,
    Linear) y no requiere JS — el blend mode del browser hace toda la matemática.
  -->
  <div
    v-if="isEnabled"
    aria-hidden="true"
    class="pointer-events-none fixed left-0 top-0 z-100 mix-blend-difference"
    :style="{ transform: `translate3d(${x - 6}px, ${y - 6}px, 0)` }"
  >
    <div
      class="h-3 w-3 rounded-full bg-background transition-transform duration-200 ease-out"
      :style="{ transform: `scale(${scale})` }"
    />
  </div>
</template>
