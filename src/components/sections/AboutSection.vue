<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'

// ScrollTrigger viene incluido en el paquete `gsap` (no es dependencia aparte).
// Se registra una vez a nivel de módulo — idempotente aunque se monte varias veces.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

let tl: gsap.core.Timeline | null = null

onMounted(() => {
  const section = sectionRef.value
  if (!section) return

  // ScrollTrigger, por defecto, "recuerda" el scroll y lo restaura al recargar,
  // lo que hacía que la página abriera en esta sección en vez del Hero.
  // 'manual' deja el control del scroll al router (scrollBehavior → top 0).
  ScrollTrigger.clearScrollMemory('manual')

  // Accesibilidad: con reduced-motion no animamos — el markup ya está visible en
  // su estado final (no aplicamos ningún estado inicial oculto).
  if (reducedMotion.value === 'reduce') return

  const kicker = section.querySelector<HTMLElement>('.reveal-kicker')
  const words = section.querySelectorAll<HTMLElement>('.reveal-word')
  const copy = section.querySelector<HTMLElement>('.reveal-copy')

  // Timeline de REVEAL disparado al entrar la sección en vista.
  // `toggleActions: play none none reverse` → entra al bajar, revierte al subir
  // (se re-anima cada vez que vuelves a ella).
  tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: {
      trigger: section,
      start: 'top 72%',
      toggleActions: 'play none none reverse',
    },
  })

  // 1. Kicker "¿Qué hago?" — fade + subida corta.
  if (kicker) tl.from(kicker, { y: 24, opacity: 0, duration: 0.5 })

  // 2. Palabras del statement — cada una sube desde su máscara overflow-hidden
  //    con un rebote breve. El stagger las encadena una tras otra.
  tl.from(words, { yPercent: 120, duration: 0.9, stagger: 0.14, ease: 'power4.out' }, '-=0.2')

  // 3. Frase de presentación — fade + subida al final.
  if (copy) tl.from(copy, { y: 28, opacity: 0, duration: 0.7 }, '-=0.5')

  // El retrato del Hero carga async y cambia la altura → recalculamos el punto
  // de disparo cuando la imagen termina, para que el trigger no quede desfasado.
  ScrollTrigger.refresh()
})

onUnmounted(() => {
  tl?.scrollTrigger?.kill()
  tl?.kill()
  tl = null
})
</script>

<template>
  <!--
    Panel "¿Qué hago?" (ancla #about de la navbar).
    Fondo claro (background) + rounded-t-md + sombra suave hacia arriba: con el
    Hero en `sticky` (ver HomeView), esta sección SUBE por encima de él al
    scrollear, como una hoja limpia que se posa sobre el Hero. La sombra marca
    el borde del "papel" sin romper la paleta clara.
  -->
  <section
    id="about"
    ref="sectionRef"
    class="relative z-10 rounded-t-md bg-background shadow-[0_-24px_60px_-30px_rgba(10,10,10,0.25)]"
  >
    <!--
      Solo padding SUPERIOR (sin `pb`): el espacio hacia la siguiente sección lo
      aporta el padding-top de ServicesSection. Evita el "padding duplicado"
      (pb de esta + pt de la otra) que dejaba un hueco blanco de más.
    -->
    <div class="mx-auto w-full max-w-6xl px-6 pt-28 sm:px-8 sm:pt-36">
      <!-- Kicker editorial -->
      <p
        class="reveal-kicker mb-8 text-xs font-medium uppercase tracking-[0.3em] text-primary sm:mb-10"
      >
        ¿Qué hago?
      </p>

      <!--
        Statement tipográfico masivo (Fraunces). Cada línea es una máscara
        overflow-hidden; la palabra dentro (.reveal-word) sube desde abajo al
        entrar la sección. font-hero (Anton) queda reservado al Hero.
      -->
      <h2
        aria-label="Soy fotógrafa, mercadóloga y modelo"
        class="font-heading text-[clamp(2.75rem,11vw,9rem)] font-semibold leading-[0.95] tracking-tight text-foreground"
      >
        <span class="block overflow-hidden pb-[0.08em]" aria-hidden="true">
          <span class="reveal-word inline-block">Fotógrafa,</span>
        </span>
        <span class="block overflow-hidden pb-[0.08em]" aria-hidden="true">
          <span class="reveal-word inline-block">mercadóloga</span>
        </span>
        <span class="block overflow-hidden pb-[0.08em]" aria-hidden="true">
          <span class="reveal-word inline-block italic text-primary">&amp; modelo.</span>
        </span>
      </h2>

      <!-- Frase de presentación / apoyo -->
      <p
        class="reveal-copy mt-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:mt-14 sm:text-xl"
      >
        Uno la mirada estética con la estrategia de marca: creo imágenes que comunican, conectan y
        convierten.
      </p>
    </div>
  </section>
</template>
