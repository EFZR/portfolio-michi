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
  -->
  <div
    v-if="isEnabled"
    aria-hidden="true"
    class="pointer-events-none fixed left-0 top-0 z-[100]"
    :style="{ transform: `translate3d(${x - 6}px, ${y - 6}px, 0)` }"
  >
    <div
      class="h-3 w-3 rounded-full bg-primary transition-transform duration-200 ease-out"
      :style="{ transform: `scale(${scale})` }"
    />
  </div>
</template>
