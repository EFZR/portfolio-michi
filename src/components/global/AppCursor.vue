<script setup lang="ts">
import { useCustomCursor } from '@/composables/useCustomCursor'

// `scale` sigue expuesto por el composable pero ya no se consume aquí: en hover
// el indicador dejó de ser un dot que crece y pasó a ser el corazón que late.
const { x, y, isHovering, isEnabled } = useCustomCursor()
</script>

<template>
  <!--
    Un único wrapper `outer` maneja la posición (translate3d sin transition — el
    lerp del composable ya aporta el smoothness). Dentro conviven DOS capas
    superpuestas y centradas sobre el punto exacto del cursor:

      1. Dot UV (estado normal).
      2. Corazón UV que late (estado hover sobre `data-cursor="grow"`).

    El morph "círculo → corazón" es un crossfade: al entrar en hover el dot se
    encoge + desvanece mientras el corazón crece + aparece (transition-all). No
    es un morph de path real, pero se lee como una transición suave y evita
    dependencias de morphing SVG.

    aria-hidden + pointer-events-none: puramente decorativo.
  -->
  <div
    v-if="isEnabled"
    aria-hidden="true"
    class="pointer-events-none fixed left-0 top-0 z-100"
    :style="{ transform: `translate3d(${x}px, ${y}px, 0)` }"
  >
    <!--
      Dot UV — estado normal. Centrado sobre el punto con -translate-1/2.
      `box-shadow` de cuatro capas (ver revisión previa): ring off-white sólido
      pegado al núcleo (contraste sobre fondos UV) + halo UV difuso multi-capa.
    -->
    <div
      class="absolute left-0 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1.5px_rgba(250,250,250,0.85),0_0_8px_rgba(124,0,255,0.6),0_0_20px_rgba(124,0,255,0.35),0_0_40px_rgba(124,0,255,0.15)] transition-all duration-300 ease-out"
      :class="isHovering ? 'scale-0 opacity-0' : 'scale-100 opacity-100'"
    />

    <!--
      Corazón UV — estado hover. El glow (drop-shadow multi-capa) vive en el CSS
      scoped porque `filter: drop-shadow` sigue el alpha del path (a diferencia
      de box-shadow, que sería rectangular). `is-beating` dispara el latido; la
      animación respeta prefers-reduced-motion (ver bloque scoped).
    -->
    <svg
      viewBox="0 0 24 24"
      class="cursor-heart absolute left-0 top-0 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-primary transition-all duration-300 ease-out"
      :class="isHovering ? 'is-beating scale-100 opacity-100' : 'scale-50 opacity-0'"
    >
      <!--
        `stroke` off-white = el "anillo de luz" que envuelve el corazón (mismo
        rol que el ring del dot: garantiza contraste cuando el fondo es UV puro
        y el relleno se pierde). `paint-order: stroke` (en el bloque scoped)
        pinta el trazo ANTES que el fill, así el aro queda íntegro por fuera y
        el corazón UV se ve limpio encima.
      -->
      <path
        fill="currentColor"
        stroke="rgba(250,250,250,0.85)"
        stroke-width="1.2"
        stroke-linejoin="round"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  </div>
</template>

<style scoped>
/*
 * Glow UV del corazón — mismo espíritu que el halo del dot, pero vía
 * drop-shadow para que respete la silueta del corazón. `transform-origin:
 * center` + will-change para que el latido pivote sobre su propio centro.
 */
.cursor-heart {
  transform-origin: center;
  will-change: transform;
  filter: drop-shadow(0 0 6px rgba(124, 0, 255, 0.6)) drop-shadow(0 0 16px rgba(124, 0, 255, 0.4))
    drop-shadow(0 0 32px rgba(124, 0, 255, 0.2));
}

/* Trazo debajo del relleno → el aro off-white queda íntegro por fuera. */
.cursor-heart path {
  paint-order: stroke;
}

@media (prefers-reduced-motion: no-preference) {
  .cursor-heart.is-beating {
    animation: cursor-heartbeat 0.9s ease-in-out infinite;
  }
}

/*
 * Curva de latido asimétrica (sístole/diástole) con overshoot marcado — se
 * amplifica respecto al logo (hasta 1.4x) para que el "palpitar" sea evidente
 * como feedback de clickeabilidad. Misma cadencia que `heartbeat` en BaseLogo.
 */
@keyframes cursor-heartbeat {
  0%,
  100% {
    transform: scale(1);
  }
  14% {
    transform: scale(1.4);
  }
  28% {
    transform: scale(0.95);
  }
  42% {
    transform: scale(1.28);
  }
  70% {
    transform: scale(1);
  }
}
</style>
