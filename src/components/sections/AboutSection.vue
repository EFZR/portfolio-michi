<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion, useEventListener } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'

// ScrollTrigger viene incluido en el paquete `gsap` (no es dependencia aparte).
// Se registra una vez a nivel de módulo — idempotente aunque se monte varias veces.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const statementRef = ref<HTMLElement | null>(null)
const accentRef = ref<SVGElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

// Triggers/timelines/tweens creados en onMounted — se limpian todos en onUnmounted.
// (mismo patrón que ServicesSection: manipulación GSAP fuera de la reactividad
// de Vue, con cleanup explícito.)
const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []
const tweens: gsap.core.Tween[] = []

onMounted(() => {
  const section = sectionRef.value
  const stage = stageRef.value
  if (!section || !stage) return

  // ScrollTrigger, por defecto, "recuerda" el scroll y lo restaura al recargar,
  // lo que hacía que la página abriera en esta sección en vez del Hero.
  // 'manual' deja el control del scroll al router (scrollBehavior → top 0).
  ScrollTrigger.clearScrollMemory('manual')

  // Accesibilidad: con reduced-motion no animamos — el markup ya está visible en
  // su estado final (no aplicamos ningún estado inicial oculto ni parallax).
  if (reducedMotion.value === 'reduce') return

  const kicker = section.querySelector<HTMLElement>('.reveal-kicker')
  const words = section.querySelectorAll<HTMLElement>('.reveal-word')
  const copy = section.querySelector<HTMLElement>('.reveal-copy')

  // 1. REVEAL de entrada — el reveal vive en la palabra interna (.reveal-word),
  //    NO en la línea (.parallax-line): así el parallax de scroll (que traslada
  //    la línea) y la subida desde la máscara no pelean por el mismo transform.
  const revealTl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 72%', toggleActions: 'play none none reverse' },
  })
  if (kicker) revealTl.from(kicker, { y: 24, opacity: 0, duration: 0.5 })
  revealTl.from(words, { yPercent: 120, duration: 0.9, stagger: 0.14, ease: 'power4.out' }, '-=0.2')
  if (copy) revealTl.from(copy, { y: 28, opacity: 0, duration: 0.7 }, '-=0.5')
  timelines.push(revealTl)
  if (revealTl.scrollTrigger) triggers.push(revealTl.scrollTrigger)

  // 2. PARALLAX DE VELOCIDAD — cada línea deriva en Y a un ritmo distinto ligado
  //    al scroll (`scrub`). El `data-speed` (yPercent final) marca dirección y
  //    magnitud: signos alternos → sensación de capas flotando a distinta
  //    profundidad en vez de un bloque rígido.
  const lines = stage.querySelectorAll<HTMLElement>('.parallax-line')
  lines.forEach((line) => {
    const speed = Number(line.dataset.speed ?? 0)
    const t = gsap.to(line, {
      yPercent: speed,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
    })
    if (t.scrollTrigger) triggers.push(t.scrollTrigger)
  })

  // 3. ACENTO UV — capa más profunda: parallax de scroll más marcado + giro
  //    lento. Rellena la zona muerta (derecha) con textura de marca.
  const accentScroll = stage.querySelector<HTMLElement>('.accent-scroll')
  if (accentScroll) {
    const t = gsap.to(accentScroll, {
      yPercent: -32,
      rotation: 45,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
    })
    if (t.scrollTrigger) triggers.push(t.scrollTrigger)
  }

  // 4. DERIVA CON EL CURSOR (solo con mouse). El acento sigue al puntero y el
  //    statement contra-deriva con menor amplitud → parallax de profundidad en
  //    tiempo real. quickTo interpola suave sin crear tweens por evento.
  if (matchMedia('(pointer: fine)').matches) {
    const accent = accentRef.value
    const statement = statementRef.value
    const ax = accent && gsap.quickTo(accent, 'x', { duration: 0.7, ease: 'power3' })
    const ay = accent && gsap.quickTo(accent, 'y', { duration: 0.7, ease: 'power3' })
    const sx = statement && gsap.quickTo(statement, 'x', { duration: 0.9, ease: 'power3' })
    const sy = statement && gsap.quickTo(statement, 'y', { duration: 0.9, ease: 'power3' })

    // useEventListener se auto-limpia en onUnmounted (fuente estándar del proyecto).
    useEventListener(stage, 'mousemove', (e: MouseEvent) => {
      const r = stage.getBoundingClientRect()
      const nx = (e.clientX - r.left) / r.width - 0.5 // -0.5..0.5
      const ny = (e.clientY - r.top) / r.height - 0.5
      if (ax && ay) {
        ax(nx * 60)
        ay(ny * 60)
      }
      if (sx && sy) {
        sx(nx * -18)
        sy(ny * -18)
      }
    })
  }

  // 5. CUE DE SCROLL — puente hacia los servicios. La línea UV se DIBUJA al
  //    entrar (scaleY 0→1) y la flecha hace un bob infinito: invitación a bajar.
  //    Todo el bloque se desvanece al scrollear más allá (autoAlpha ligado al
  //    scroll) para no quedar flotando sobre las tarjetas.
  const cue = section.querySelector<HTMLElement>('.scroll-cue')
  const cueLine = section.querySelector<HTMLElement>('.cue-line')
  const cueArrow = section.querySelector<HTMLElement>('.cue-arrow')
  if (cueLine) {
    const draw = gsap.from(cueLine, {
      scaleY: 0,
      ease: 'none',
      scrollTrigger: { trigger: cueLine, start: 'top 92%', end: 'top 62%', scrub: 0.5 },
    })
    if (draw.scrollTrigger) triggers.push(draw.scrollTrigger)
  }
  if (cueArrow) {
    tweens.push(
      gsap.to(cueArrow, { y: 6, repeat: -1, yoyo: true, duration: 0.9, ease: 'sine.inOut' }),
    )
  }
  if (cue) {
    const fade = gsap.to(cue, {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: cue, start: 'top 30%', end: 'top 8%', scrub: true },
    })
    if (fade.scrollTrigger) triggers.push(fade.scrollTrigger)
  }

  // El retrato del Hero carga async y cambia la altura → recalculamos los puntos
  // de disparo cuando la imagen termina, para que los triggers no queden desfasados.
  ScrollTrigger.refresh()
})

onUnmounted(() => {
  triggers.forEach((t) => t.kill())
  timelines.forEach((t) => t.kill())
  tweens.forEach((t) => t.kill())
  triggers.length = 0
  timelines.length = 0
  tweens.length = 0
})
</script>

<template>
  <!--
    Panel "¿Qué hago?" (ancla #about de la navbar).
    Fondo claro (background) + rounded-t-md + sombra suave hacia arriba: con el
    Hero en `sticky` (ver HomeView), esta sección SUBE por encima de él al
    scrollear, como una hoja limpia que se posa sobre el Hero. La sombra marca
    el borde del "papel" sin romper la paleta clara. overflow-hidden recorta el
    acento UV cuando desborda por los bordes (evita scroll horizontal).
  -->
  <section
    id="about"
    ref="sectionRef"
    class="relative z-10 overflow-hidden rounded-t-md bg-background shadow-[0_-24px_60px_-30px_rgba(10,10,10,0.25)]"
  >
    <!--
      Solo padding SUPERIOR (sin `pb`): el espacio hacia la siguiente sección lo
      aporta el padding-top de ServicesSection. Evita el "padding duplicado"
      (pb de esta + pt de la otra) que dejaba un hueco blanco de más.
    -->
    <BaseContainer size="bleed" class="pt-28 sm:pt-36">
      <!-- Kicker editorial -->
      <p
        class="reveal-kicker mb-8 text-xs font-medium uppercase tracking-[0.3em] text-primary sm:mb-10"
      >
        ¿Qué hago?
      </p>

      <!--
        STAGE — lienzo relativo que reparte el statement por todo el ancho/alto y
        aloja el acento UV (detrás) y el copy (anclado abajo-derecha). min-h da el
        aire vertical para las capas; el listener de mousemove se engancha aquí.
      -->
      <div ref="stageRef" class="relative min-h-[62vh] sm:min-h-[74vh]">
        <!--
          Acento UV decorativo — sparkle SVG (no glifo emoji, así el render es
          consistente entre plataformas). Va DETRÁS del texto (DOM antes del h2).
          El wrapper .accent-scroll recibe el parallax/giro de scroll; el <svg>
          interior recibe la deriva del cursor → transforms separados sin pelea.
        -->
        <div
          class="accent-scroll pointer-events-none absolute -top-[6%] right-[2%] sm:right-[5%]"
          aria-hidden="true"
        >
          <svg
            ref="accentRef"
            viewBox="0 0 100 100"
            class="h-[clamp(9rem,30vw,26rem)] w-[clamp(9rem,30vw,26rem)] text-primary/15"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M50 0C54 34 66 46 100 50C66 54 54 66 50 100C46 66 34 54 0 50C34 46 46 34 50 0Z"
            />
          </svg>
        </div>

        <!--
          Statement tipográfico masivo (Fraunces). Cada línea es una máscara
          overflow-hidden (.parallax-line) con sangría en zigzag (≠ escalera de la
          intro de Servicios) que reparte las palabras por el ancho. La palabra
          interna (.reveal-word) sube desde la máscara al entrar; la línea deriva
          con el scroll (data-speed). font-hero (Anton) queda reservado al Hero.
        -->
        <h2
          ref="statementRef"
          aria-label="Soy fotógrafa, mercadóloga y modelo"
          class="relative z-10 font-heading text-[clamp(2.75rem,11vw,9rem)] font-semibold leading-[0.95] tracking-tight text-foreground"
        >
          <span
            class="parallax-line block overflow-hidden pb-[0.08em]"
            data-speed="-7"
            aria-hidden="true"
          >
            <span class="reveal-word inline-block">Fotógrafa,</span>
          </span>
          <span
            class="parallax-line block overflow-hidden pb-[0.08em] sm:ps-[16vw]"
            data-speed="5"
            aria-hidden="true"
          >
            <span class="reveal-word inline-block">mercadóloga</span>
          </span>
          <span
            class="parallax-line block overflow-hidden pb-[0.08em] sm:ps-[5vw]"
            data-speed="-3"
            aria-hidden="true"
          >
            <span class="reveal-word inline-block italic text-primary">&amp; modelo.</span>
          </span>
        </h2>

        <!--
          Frase de presentación / apoyo — anclada abajo-derecha en sm+ para
          equilibrar la masa del statement (izquierda) con el acento (derecha) y
          "cerrar" la zona muerta inferior. En móvil vuelve al flujo normal.
        -->
        <p
          class="reveal-copy relative z-10 mt-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:absolute sm:right-0 sm:bottom-0 sm:mt-0 sm:max-w-md sm:text-right sm:text-xl"
        >
          Uno la mirada estética con la estrategia de marca: creo imágenes que comunican, conectan y
          convierten.
        </p>
      </div>

      <!--
        CUE DE SCROLL — puente hacia los servicios: "desliza ↓". La línea UV se
        dibuja al entrar, la flecha hace bob y el bloque se desvanece al pasar de
        largo (script). Es el enlace que une este panel con las tarjetas.
        Decorativo → aria-hidden (no aporta significado, solo afordancia).
      -->
      <div class="scroll-cue mt-14 flex flex-col items-center gap-3 sm:mt-20" aria-hidden="true">
        <span class="text-[0.7rem] font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Desliza
        </span>
        <span class="cue-line h-16 w-px origin-top bg-primary sm:h-24"></span>
        <svg
          class="cue-arrow h-4 w-4 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </BaseContainer>
  </section>
</template>
