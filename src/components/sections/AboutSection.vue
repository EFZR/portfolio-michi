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
// Tween "vivo" del cue: se recrea en cada pico de velocidad de scroll (devuelve
// el timeScale del giro del badge a 1) y se guarda aparte para matarlo en cleanup.
let cueLiveTween: gsap.core.Tween | null = null

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

  // 5. CUE DE SCROLL — puente hacia los servicios, resuelto como BADGE GIRATORIO:
  //    la línea UV se DIBUJA al entrar; el badge (aro concéntrico + texto circular
  //    "DESLIZA · SCROLL") gira en bucle y su velocidad REACCIONA al scroll
  //    (timeScale ligado a la velocidad, easado de vuelta a 1). La flecha central
  //    late/bob con glow neón. Con el cursor, el badge se inclina en 3D
  //    (rotationX/Y sobre la perspectiva del wrapper). Se desvanece al pasar.
  const cue = section.querySelector<HTMLElement>('.scroll-cue')
  const badge = section.querySelector<HTMLElement>('.cue-badge')
  const cueArrow = section.querySelector<HTMLElement>('.cue-arrow')

  // Giro continuo del badge + reacción al scroll. Recorremos rotation Z en bucle
  // lineal; la velocidad de scroll modula el `timeScale` del tween (más rápido, o
  // negativo = invierte). Cada pico supera al anterior y se easea de vuelta a 1 →
  // el badge "acelera" al scrollear y desacelera suave al frenar.
  if (badge) {
    const spin = gsap.to(badge, { rotation: 360, duration: 16, ease: 'none', repeat: -1 })
    tweens.push(spin)

    const proxy = { ts: 1 }
    const clampBoost = gsap.utils.clamp(-5, 9)
    const react = ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const target = 1 + clampBoost(self.getVelocity() / 180)
        if (Math.abs(target - 1) > Math.abs(proxy.ts - 1)) {
          proxy.ts = target
          spin.timeScale(target)
          cueLiveTween?.kill()
          cueLiveTween = gsap.to(proxy, {
            ts: 1,
            duration: 1,
            ease: 'power3',
            onUpdate: () => spin.timeScale(proxy.ts),
          })
        }
      },
    })
    triggers.push(react)

    // Tilt 3D con el cursor. rotationX/Y son ejes distintos al giro Z → coexisten
    // sin pelea. La perspectiva la aporta el wrapper (clase [perspective:...]).
    if (matchMedia('(pointer: fine)').matches) {
      const rotY = gsap.quickTo(badge, 'rotationY', { duration: 0.6, ease: 'power3' })
      const rotX = gsap.quickTo(badge, 'rotationX', { duration: 0.6, ease: 'power3' })
      useEventListener(section, 'mousemove', (ev: MouseEvent) => {
        const r = section.getBoundingClientRect()
        const nx = (ev.clientX - r.left) / r.width - 0.5 // -0.5..0.5
        const ny = (ev.clientY - r.top) / r.height - 0.5
        rotY(nx * 28)
        rotX(ny * -28)
      })
    }
  }

  // Flecha central: bob infinito (invita a bajar). Glow neón vive en la clase.
  if (cueArrow) {
    tweens.push(
      gsap.to(cueArrow, { y: 6, repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut' }),
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
  cueLiveTween?.kill()
  cueLiveTween = null
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
      <div ref="stageRef" class="relative min-h-[44vh] sm:min-h-[74vh]">
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
        dibuja al entrar y la flecha es un ECO PARALLAX: 3 chevrons apilados que
        se abren en abanico con la velocidad de scroll (los ecos laguean) y
        convergen al parar; además derivan con el cursor (ver script). El bloque
        se desvanece al pasar de largo. Decorativo → aria-hidden (solo afordancia).
      -->
      <div class="scroll-cue mt-6 flex flex-col items-center sm:mt-24" aria-hidden="true">
        <!--
          BADGE GIRATORIO — el badge (.cue-badge) y la flecha (.cue-arrow) se
          apilan en la MISMA celda de grid ([grid-area:1/1] + place-items-center):
          así el badge puede girar SIN arrastrar la flecha (son hermanos, no
          anidados). El wrapper aporta la perspectiva ([perspective]) para el tilt
          3D con el cursor y la sombra 3D suave (drop-shadow oscuro que NO gira).
        -->
        <div
          class="relative grid place-items-center [perspective:600px] drop-shadow-[0_12px_22px_rgba(10,10,10,0.18)]"
        >
          <svg
            class="cue-badge h-[clamp(5.25rem,14vw,8rem)] w-[clamp(5.25rem,14vw,8rem)] text-primary [grid-area:1/1] [filter:drop-shadow(0_0_16px_rgba(124,0,255,0.45))]"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <!--
                Degradado "metálico" en familia UV: brillo claro → primary →
                UV profundo. Se mantiene dentro de la paleta (no azul/teal).
              -->
              <linearGradient id="cueRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#B98CFF" />
                <stop offset="45%" stop-color="#7C00FF" />
                <stop offset="100%" stop-color="#4B0099" />
              </linearGradient>
              <!-- Camino circular (r=34) para el texto: radio reducido → margen
                   claro entre el texto y el aro exterior (r=46). -->
              <path id="cueTextPath" d="M50,50 m-34,0 a34,34 0 1,1 68,0 a34,34 0 1,1 -68,0" />
            </defs>
            <!-- Aros concéntricos con el degradado metálico. -->
            <circle cx="50" cy="50" r="46" stroke="url(#cueRing)" stroke-width="2.5" />
            <circle cx="50" cy="50" r="24" stroke="url(#cueRing)" stroke-width="1.5" opacity="0.5" />
            <!-- Texto circular editorial. fill-primary + mono uppercase.
                 word-spacing separa las palabras del separador (margen). -->
            <text
              class="fill-primary font-mono text-[6px] uppercase"
              style="letter-spacing: 1.8px; word-spacing: 4px"
            >
              <textPath href="#cueTextPath" startOffset="0">
                DESLIZA · SCROLL · DESLIZA · SCROLL ·
              </textPath>
            </text>
          </svg>
          <!-- Flecha ↓ estática al centro, con glow neón + bob (script). -->
          <svg
            class="cue-arrow h-6 w-6 text-primary [grid-area:1/1] [filter:drop-shadow(0_0_10px_rgba(124,0,255,0.65))] sm:h-8 sm:w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </BaseContainer>
  </section>
</template>
