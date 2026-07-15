<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { usePreferredReducedMotion } from '@vueuse/core'
import { useWordReplicate } from '@/composables/useWordReplicate'

const heroRef = ref<HTMLElement | null>(null)
const gradientRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const copyRef = ref<HTMLElement | null>(null)
const scrollCueRef = ref<HTMLElement | null>(null)

const reducedMotion = usePreferredReducedMotion()

// Palabras del H1 desglosadas por letra (spread preserva codepoints como "í").
// Definidas una sola vez para no reinstanciar arrays en cada render del template.
const wordTu = [...'tu']
const wordSiguiente = [...'siguiente']
const wordNivel = [...'nivel']
const wordEmpieza = [...'empieza']
const wordAqui = [...'aquí']

// Efecto word-replicate: copias de "aquí" que caen con gravedad al pasar el cursor.
// zIndex 15 las coloca ENTRE el H1 (z-10) y la imagen del retrato (z-20) — quedan
// enfrente del texto masivo pero tapadas por la silueta, estilo Bogdan.
useWordReplicate({
  container: heroRef,
  word: 'AQUÍ',
  throttleMs: 180,
  zIndex: 15,
})

let revealTl: gsap.core.Timeline | null = null

onMounted(() => {
  // Accesibilidad: si el usuario pidió reduced-motion, no animamos — todo queda
  // en su estado final (no necesitamos gsap.set porque no ocultamos nada).
  if (reducedMotion.value === 'reduce') return

  const letters = titleRef.value?.querySelectorAll<HTMLElement>('.hero-letter') ?? []

  // Estados iniciales aplicados sincronicamente antes del primer paint para evitar FOUC.
  gsap.set(letters, { yPercent: -120, opacity: 0 })
  gsap.set(imageRef.value, { opacity: 0, y: 40 })
  gsap.set([copyRef.value, scrollCueRef.value], { opacity: 0, y: 20 })
  gsap.set(gradientRef.value, { opacity: 0 })

  // Secuencia arriba→abajo: canvas (gradient + retrato) → letras en cascada → copy/scroll cue.
  revealTl = gsap.timeline({ defaults: { ease: 'power3.out' } })

  revealTl
    .to(gradientRef.value, { opacity: 1, duration: 0.9 }, 0)
    .to(imageRef.value, { opacity: 1, y: 0, duration: 1.1 }, 0.05)
    .to(letters, { yPercent: 0, opacity: 1, duration: 0.75, stagger: 0.035 }, 0.25)
    .to(
      [copyRef.value, scrollCueRef.value],
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.15 },
      '-=0.35',
    )
})

onUnmounted(() => {
  revealTl?.kill()
  revealTl = null
})
</script>

<template>
  <section ref="heroRef" class="relative isolate min-h-screen w-full overflow-hidden">
    <!--
      Capa 1 — Gradient lineal UV ENCIMA de la imagen (z-30).
      Wrapper único (gradientRef) para animar ambas variantes responsive con una
      sola ref. Mobile más intenso (UV 80%), desktop más suave (UV 70%).
    -->
    <div ref="gradientRef" aria-hidden="true" class="pointer-events-none absolute inset-0 z-30">
      <div
        class="absolute inset-0 lg:hidden"
        style="
          background: linear-gradient(
            to top,
            color-mix(in srgb, var(--color-primary) 80%, transparent) 0%,
            transparent 30%
          );
        "
      />
      <div
        class="absolute inset-0 hidden lg:block"
        style="
          background: linear-gradient(
            to top,
            color-mix(in srgb, var(--color-primary) 70%, transparent) 0%,
            transparent 30%
          );
        "
      />
    </div>

    <!--
      Capa 2 — Retrato a sangre (PNG con fondo transparente).
      ENCIMA del texto (z-20). La silueta tapa parcialmente el texto → estilo Bogdan.
    -->
    <div
      ref="imageRef"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center"
    >
      <img
        src="/hero-img.png"
        alt="Retrato"
        class="h-[88vh] w-auto max-w-[90vw] object-contain object-bottom sm:h-[74vh] sm:max-w-[76vw] md:h-[75vh] md:max-w-[77vw] lg:h-[88vh] lg:max-w-[90vw]"
      />
    </div>

    <!--
      Capa 3 — Tipografía MASIVA edge-to-edge con reveal por letra.
      Cada palabra se envuelve en un span inline-block whitespace-nowrap; dentro,
      cada carácter es su propio span (.hero-letter) para el stagger de GSAP.
      aria-label en el H1 + aria-hidden en las palabras: los lectores de pantalla
      escuchan la frase completa, no la sopa de letras.
    -->
    <div class="relative z-10 flex min-h-screen flex-col px-3 pt-24 sm:px-5 lg:px-6">
      <h1
        ref="titleRef"
        aria-label="Tu siguiente nivel empieza aquí"
        class="w-full font-hero text-[clamp(2.75rem,13vw,18rem)] uppercase leading-[calc(0.88em+20px)] tracking-[-0.01em] text-foreground"
      >
        <span class="inline-block whitespace-nowrap" aria-hidden="true">
          <span v-for="(char, i) in wordTu" :key="`w1-${i}`" class="hero-letter inline-block">{{
            char
          }}</span>
        </span>

        <span class="inline-block whitespace-nowrap ps-3 sm:ps-7 lg:ps-20" aria-hidden="true">
          <span
            v-for="(char, i) in wordSiguiente"
            :key="`w2-${i}`"
            class="hero-letter inline-block"
            >{{ char }}</span
          >
        </span>

        <span class="inline-block whitespace-nowrap ps-3 sm:ps-7 lg:ps-20" aria-hidden="true">
          <span v-for="(char, i) in wordNivel" :key="`w3-${i}`" class="hero-letter inline-block">{{
            char
          }}</span>
        </span>

        <span class="inline-block whitespace-nowrap" aria-hidden="true">
          <span
            v-for="(char, i) in wordEmpieza"
            :key="`w4-${i}`"
            class="hero-letter inline-block"
            >{{ char }}</span
          >
        </span>

        <span
          class="inline-block whitespace-nowrap font-heading italic uppercase text-primary ps-3 sm:ps-7 lg:ps-70 min-[1200px]:ps-65"
          aria-hidden="true"
        >
          <span v-for="(char, i) in wordAqui" :key="`w5-${i}`" class="hero-letter inline-block">{{
            char
          }}</span>
        </span>
      </h1>
    </div>

    <!--
      Capa 4 + 5 — Copy descriptivo + scroll cue en un contenedor flex.
      Mobile (< sm): flex-col → apilados uno sobre otro, alineados a la izquierda.
      sm+ (≥ 640px): flex-row → uno a cada extremo, alineados al bottom.
      Los refs individuales se mantienen para que GSAP siga animando cada uno.
    -->
    <div
      class="absolute inset-x-4 bottom-8 z-40 hidden items-center gap-2 sm:inset-x-8 sm:flex flex-row sm:items-end sm:justify-between"
    >
      <div
        ref="copyRef"
        class="text-center sm:text-start sm:max-w-xs rounded-md bg-background/30 px-3 py-2 text-sm leading-snug text-foreground backdrop-blur-sm"
      >
        <p>
          Visualiza, ilustra, dirige.<br class="hidden sm:inline" />
          Hace que las ideas existan.
        </p>
      </div>

      <div
        ref="scrollCueRef"
        aria-hidden="true"
        class="text-center sm:text-start rounded-md bg-background/30 px-3 py-2 text-xs font-medium uppercase tracking-[0.25em] text-foreground backdrop-blur-sm"
      >
        (Scroll para ver más)
      </div>
    </div>
  </section>
</template>
