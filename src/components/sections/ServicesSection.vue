<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'

// ScrollTrigger vive dentro del paquete `gsap`. Registro idempotente a nivel módulo.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

// Timelines/triggers creados en onMounted — se limpian todos en onUnmounted.
const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []

/**
 * Servicios / áreas principales. `image` es un mockup placeholder (picsum con
 * seed fijo → imagen estable). `title` es la leyenda principal; `tagline` y
 * `detail` las dos secundarias — las tres viven en el pie de la tarjeta.
 */
const services = [
  {
    id: 'fotografia',
    image: 'https://picsum.photos/seed/princess-foto/1600/1000',
    title: 'Fotografía',
    tagline: 'Editorial · Producto · Retrato',
    detail: 'Dirijo la luz para que cada imagen cuente tu historia.',
  },
  {
    id: 'marketing',
    image: 'https://picsum.photos/seed/princess-mkt/1600/1000',
    title: 'Marketing',
    tagline: 'Estrategia · Contenido de marca',
    detail: 'Convierto la estética en mensajes que conectan y venden.',
  },
  {
    id: 'modelaje',
    image: 'https://picsum.photos/seed/princess-model/1600/1000',
    title: 'Modelaje',
    tagline: 'Pasarela · Campaña · Lookbook',
    detail: 'Presencia frente a cámara con dirección propia.',
  },
] as const

onMounted(() => {
  const section = sectionRef.value
  if (!section) return

  // Accesibilidad: con reduced-motion las tarjetas quedan a escala 1 y con el
  // texto visible — el markup ya está en su estado final, no ocultamos nada.
  if (reducedMotion.value === 'reduce') return

  // 0. INTRO — la frase "…nace aquí" entra en cascada palabra por palabra desde
  //    su máscara. El "aquí" (callback del Hero) remata con un pop sutil.
  const introWords = section.querySelectorAll<HTMLElement>('.intro-word')
  if (introWords.length) {
    const introTl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top 72%',
        toggleActions: 'play none none reverse',
      },
    })
    introTl.from(introWords, {
      yPercent: 120,
      duration: 0.85,
      stagger: 0.09,
      ease: 'power4.out',
    })
    const accent = section.querySelector<HTMLElement>('.intro-accent')
    if (accent) {
      introTl.to(
        accent,
        { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut' },
        '>-0.1',
      )
    }
    timelines.push(introTl)
    if (introTl.scrollTrigger) triggers.push(introTl.scrollTrigger)
  }

  const cards = section.querySelectorAll<HTMLElement>('.service-card')

  cards.forEach((card) => {
    // 1. SCALE ON SCROLL — la tarjeta entra al 88% y escala a 100% ligada al
    //    scroll (`scrub`): crece a medida que sube por el viewport.
    const scaleTween = gsap.fromTo(
      card,
      { scale: 0.94 },
      {
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          start: 'top 92%',
          end: 'top 45%',
          scrub: true,
        },
      },
    )
    if (scaleTween.scrollTrigger) triggers.push(scaleTween.scrollTrigger)

    // 2. REVEAL del pie — las tres leyendas suben con un stagger ligero al
    //    entrar la tarjeta. Aparición suave del contenido.
    const lines = card.querySelectorAll<HTMLElement>('.service-line')
    if (lines.length) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: card,
          start: 'top 78%',
          toggleActions: 'play none none reverse',
        },
      })
      tl.from(lines, {
        yPercent: 60,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        ease: 'power3.out',
      })
      timelines.push(tl)
      if (tl.scrollTrigger) triggers.push(tl.scrollTrigger)
    }
  })

  // El retrato del Hero carga async y desplaza el layout → recalculamos triggers.
  ScrollTrigger.refresh()
})

onUnmounted(() => {
  triggers.forEach((t) => t.kill())
  timelines.forEach((tl) => tl.kill())
  triggers.length = 0
  timelines.length = 0
})
</script>

<template>
  <!--
    Panel "Servicios" FULL-WIDTH — rompe el contenedor centrado de las demás
    secciones y va casi pegado a los bordes (px mínimo). Continúa la "hoja" clara
    por encima del Hero sticky (relative z-10 + bg-background).
  -->
  <section id="services" ref="sectionRef" class="relative z-10 bg-background py-24 sm:py-32">
    <!-- Cabecera editorial full-bleed: px mínimo como las tarjetas -->
    <div class="mb-14 px-2 sm:mb-20 sm:px-4">
      <!--
        Frase de intro escalonada en tres líneas con sangría creciente, cerrando
        en "aquí" como callback del Hero (mismo font-heading italic text-primary).
        Cada palabra vive en una máscara overflow-hidden y sube en cascada al
        entrar la sección (.intro-word). aria-label da la frase completa; las
        líneas van aria-hidden.
      -->
      <h2
        aria-label="Tu próxima gran historia comienza aquí"
        class="font-heading text-[clamp(1.75rem,9.5vw,13rem)] font-semibold leading-[1.02] tracking-tight text-foreground"
      >
        <span aria-hidden="true">
          <!-- Línea 1 -->
          <span class="flex flex-wrap gap-x-[0.28em]">
            <span class="mt-[-0.6em] inline-block overflow-hidden pt-[0.6em] pb-[0.12em]">
              <span class="intro-word inline-block">Tu</span>
            </span>
            <span class="mt-[-0.6em] inline-block overflow-hidden pt-[0.6em] pb-[0.12em]">
              <span class="intro-word inline-block">próxima</span>
            </span>
          </span>
          <!-- Línea 2 — sangría media -->
          <span class="flex flex-wrap gap-x-[0.28em] ps-[6vw] sm:ps-[8vw]">
            <span class="mt-[-0.6em] inline-block overflow-hidden pt-[0.6em] pb-[0.12em]">
              <span class="intro-word inline-block">gran</span>
            </span>
            <span class="mt-[-0.6em] inline-block overflow-hidden pt-[0.6em] pb-[0.12em]">
              <span class="intro-word inline-block">historia</span>
            </span>
          </span>
          <!-- Línea 3 — sangría mayor, remata en "aquí" -->
          <span class="flex flex-wrap gap-x-[0.28em] ps-[12vw] sm:ps-[16vw]">
            <span class="mt-[-0.6em] inline-block overflow-hidden pt-[0.6em] pb-[0.12em]">
              <span class="intro-word inline-block">comienza</span>
            </span>
            <!--
              "aquí" va en itálica: la inclinación desborda por la DERECHA (la
              tilde de la Í mayúscula), así que la máscara le añade pe (padding
              inline-end) extra para no recortarla. Al ser la última palabra de
              la línea, el padding se extiende en espacio vacío sin mover nada.
            -->
            <span class="mt-[-0.6em] inline-block overflow-hidden pt-[0.6em] pb-[0.12em] pe-[0.6em]">
              <span class="intro-word intro-accent inline-block italic text-primary uppercase">aquí</span>
            </span>
          </span>
        </span>
      </h2>
    </div>

    <!-- Tarjetas edge-to-edge (px mínimo), apiladas al 100% del ancho -->
    <div class="flex flex-col gap-3 px-2 sm:gap-4 sm:px-4">
      <article
        v-for="service in services"
        :key="service.id"
        data-cursor="grow"
        class="service-card group relative min-h-[48vh] w-full origin-center overflow-hidden rounded-md bg-surface sm:min-h-[58vh]"
      >
        <!-- Imagen de fondo (mockup placeholder) cubriendo toda la tarjeta -->
        <img
          :src="service.image"
          alt=""
          aria-hidden="true"
          loading="lazy"
          class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />

        <!--
          Scrim inferior permanente: garantiza legibilidad del pie sobre
          cualquier imagen, exista o no el hover. from-foreground/85 (off-black).
        -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-foreground/85 via-foreground/40 to-transparent"
        />

        <!--
          Pie de la tarjeta. Comportamiento hover distinto por dispositivo:
          · Con cursor (@media hover:hover, lo que Tailwind usa en `group-hover`):
            la descripción está oculta y se revela al hover; el overlay UV sube.
          · Táctil (@media hover:none): sin hover posible, la descripción se
            muestra siempre; la caja del título se resalta al tap (:active).
          z-20 sobre la imagen; el bloque gana un drop-shadow sutil al hover.
        -->
        <div
          class="absolute inset-x-0 bottom-0 z-20 overflow-hidden p-6 transition-[filter] duration-500 group-hover:filter-[drop-shadow(0_2px_16px_rgba(10,10,10,0.35))] sm:p-8"
        >
          <!--
            Overlay UV — como fondo del propio pie: cubre TODO el bloque de
            leyendas. Sube en hover (solo cursor, `group-hover` ya va gateado por
            @media hover:hover) y queda por debajo del texto (z-0), resaltándolo.
          -->
          <div
            aria-hidden="true"
            class="absolute inset-0 z-0 translate-y-full bg-primary transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0"
          />

          <div class="relative z-10">
            <!--
              Título con CAJA de resaltado: aparece al hover (cursor) o al tap
              (:active, para táctil). -mx-2 px-2 alinea el texto con las leyendas
              cuando la caja está oculta.
            -->
            <h3
              class="service-line font-heading text-4xl font-semibold leading-none tracking-tight sm:text-6xl"
            >
              <span
                class="-mx-2 inline-block rounded-md px-2 py-0.5 text-background transition-colors duration-500 group-hover:bg-background/20 group-active:bg-background/20"
                >{{ service.title }}</span
              >
            </h3>

            <!-- Leyenda secundaria 1 — siempre visible (eco del "pill") -->
            <p
              class="service-line mt-3 text-sm font-medium uppercase tracking-[0.15em] text-background/90 sm:text-base"
            >
              {{ service.tagline }}
            </p>

            <!--
              Leyenda secundaria 2 — oculta por defecto; se revela al hover con
              cursor. En táctil (@media hover:none) se muestra siempre, porque
              ahí no hay hover que la revele.
            -->
            <p
              class="mt-1.5 max-w-md translate-y-2 text-sm leading-relaxed text-background/80 opacity-0 transition duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 sm:text-base"
            >
              {{ service.detail }}
            </p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
