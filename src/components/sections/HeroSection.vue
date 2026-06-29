<script setup lang="ts">
import { ref } from 'vue'
import { useWordReplicate } from '@/composables/useWordReplicate'

const heroRef = ref<HTMLElement | null>(null)

// Inyecta el efecto word-replicate sobre el contenedor.
// La palabra a replicar es la última de la frase icónica.
useWordReplicate({
  container: heroRef,
  word: 'así',
})
</script>

<template>
  <section
    ref="heroRef"
    class="relative isolate min-h-screen w-full overflow-hidden"
  >
    <!--
      Capa 1 — Foto placeholder.
      Bloque negro roto + ruido SVG inline (feTurbulence) que simula grano fotográfico.
      Cero peso, escalable. Cuando llegue la foto real → swap por <img> o <picture>.
    -->
    <div class="absolute inset-0 -z-10 bg-foreground">
      <svg
        class="h-full w-full opacity-20"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <filter id="hero-noise">
            <feTurbulence
              type="fractalNoise"
              base-frequency="0.65"
              num-octaves="2"
              stitch-tiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#hero-noise)" />
      </svg>
    </div>

    <!-- Capa 2 — Gradient sutil hacia abajo (mejor legibilidad del scroll indicator) -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-foreground/70 to-transparent"
    />

    <!--
      Capa 3 — Tipografía (Opción C: bloque continuo).
      Fluid typography con clamp() para que el H1 escale sin breakpoints duros.
      leading 0.95 + tracking -0.03em = vibra editorial Bogdan.
    -->
    <div
      class="relative z-10 flex min-h-screen flex-col justify-center px-6 sm:px-12 lg:px-20"
    >
      <h1
        class="max-w-[88rem] font-heading text-[clamp(2.5rem,8vw,8.5rem)] font-medium leading-[0.95] tracking-[-0.03em] text-background"
      >
        Transformar visiones en realidades que inspiran. Es<span
          class="text-primary"
        >
          así</span
        >.
      </h1>
    </div>

    <!-- Capa 4 — Scroll indicator sutil -->
    <div
      aria-hidden="true"
      class="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-background/50"
    >
      <span class="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
      <span class="h-12 w-px animate-pulse bg-background/30" />
    </div>
  </section>
</template>
