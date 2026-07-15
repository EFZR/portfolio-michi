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

    Dot UV con soft glow + ring de contraste:
      - Núcleo sólido de 8px en UV — el "marker preciso" siempre visible.
      - `box-shadow` de cuatro capas apiladas (importante el orden):
          1. `0 0 0 1.5px rgba(250,250,250,0.85)` → anillo off-white sólido
             pegado al núcleo (spread sin blur = ring). Garantiza contraste
             cuando el fondo es UV puro (donde el núcleo se pierde) — sobre
             UV el aro blanco es el que "dibuja" el cursor.
          2, 3, 4. Halo UV difuso multi-capa (opacidades decrecientes) — la
             "aura" del cursor sobre fondos claros/oscuros. Se pierde sobre
             UV puro pero el ring blanco compensa.
      - En hover (data-cursor="grow") el composable escala a 2.5x → el
        núcleo sube a 20px, el ring blanco a ~3.75px, y el halo se estira
        proporcional al scale del elemento. Se siente como una "brasa UV
        con contorno" que respira.
  -->
  <div
    v-if="isEnabled"
    aria-hidden="true"
    class="pointer-events-none fixed left-0 top-0 z-100"
    :style="{ transform: `translate3d(${x - 4}px, ${y - 4}px, 0)` }"
  >
    <div
      class="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_1.5px_rgba(250,250,250,0.85),0_0_8px_rgba(124,0,255,0.6),0_0_20px_rgba(124,0,255,0.35),0_0_40px_rgba(124,0,255,0.15)] transition-transform duration-300 ease-out"
      :style="{ transform: `scale(${scale})` }"
    />
  </div>
</template>
