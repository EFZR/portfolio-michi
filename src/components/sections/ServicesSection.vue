<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'

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

/**
 * Geometría del apilado (sticky stacking). Se usa TANTO en el template (posición
 * `top` de cada card) COMO en el script (punto de anclaje donde termina el
 * encogido) → constantes compartidas para que nunca se desincronicen.
 *   STACK_TOP_REM  → anclaje de la 1ª card (libra la navbar fija de 6rem)
 *   STACK_STEP_REM → cuánto baja el anclaje por índice = "asomo" entre cards
 *   STACK_DEPTH    → cuánto encoge cada card por nivel de profundidad (falso 3D)
 */
const STACK_TOP_REM = 6.5
const STACK_STEP_REM = 2.75
const STACK_DEPTH = 0.06

/**
 * Estilo sticky de cada card:
 *  · `top` escalonado por índice → asomo del mazo durante el apilado.
 *  · `margin-bottom` escalonado INVERSO al índice → al llegar al fondo del
 *    contenedor, el sticky deja de clavar las cards en su `top` y las empuja
 *    hacia arriba. Con este margen, `top + margin-bottom` es CONSTANTE para
 *    todas, así que se "despegan" a la vez y el mazo sube RÍGIDO manteniendo el
 *    fan — las de atrás nunca quedan tapadas por la del frente al salir. Sin el
 *    margen, todas colapsaban contra el fondo del contenedor y la del frente
 *    ocultaba a las demás.
 */
function cardStyle(i: number) {
  const depthFromFront = services.length - 1 - i
  return {
    top: `${STACK_TOP_REM + i * STACK_STEP_REM}rem`,
    marginBottom: `${depthFromFront * STACK_STEP_REM}rem`,
  }
}

onMounted(() => {
  const section = sectionRef.value
  if (!section) return

  // Accesibilidad: con reduced-motion las tarjetas quedan a escala 1 y con el
  // texto visible — el markup ya está en su estado final, no ocultamos nada.
  if (reducedMotion.value === 'reduce') return

  const cards = section.querySelectorAll<HTMLElement>('.service-card')

  cards.forEach((card, i) => {
    // 1. REVEAL del pie — las tres leyendas suben con un stagger ligero al
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

    // 2. APILADO "FALSO 3D" — cada tarjeta es `sticky` (ver template) y se ancla
    //    cerca del top; la SIGUIENTE sube y la cubre. Al ser cubierta, la de
    //    atrás se ENCOGE desde su borde superior (origin-top) ligado al scroll.
    //
    //    Escala GRADUADA por profundidad: la más honda (más cards encima) queda
    //    la más pequeña y cada nivel hacia el frente un poco más grande → falso
    //    3D real (antes todas iban a 0.9 y se veían del mismo tamaño). La última
    //    no se encoge (scale 1, al frente).
    //
    //    El encogido TERMINA justo cuando la card que la cubre llega a su anclaje
    //    (`end` = top de esa card), no arrastrado hasta el spacer → el mazo
    //    "termina de apilarse" en el momento en que se cubre.
    if (i < cards.length - 1) {
      const depth = cards.length - 1 - i // cuántas cards se apilarán encima
      const finalScale = 1 - depth * STACK_DEPTH
      const coverTopPx = (STACK_TOP_REM + (i + 1) * STACK_STEP_REM) * 16
      const shrink = gsap.to(card, {
        scale: finalScale,
        ease: 'none',
        scrollTrigger: {
          trigger: cards[i + 1],
          start: 'top bottom',
          end: `top ${coverTopPx}px`,
          scrub: true,
        },
      })
      if (shrink.scrollTrigger) triggers.push(shrink.scrollTrigger)
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
    Panel "Servicios" FULL-BLEED — usa el BaseContainer estándar en modo `bleed`:
    edge-to-edge con el gutter mínimo (px-2 sm:px-4) compartido por todo el
    proyecto. Continúa la "hoja" clara por encima del Hero sticky
    (relative z-10 + bg-background).

    `pt` mínimo (no py grande): esta sección FLUYE directamente desde About
    (mismo bg-background, sin costura visible) — el aire superior lo da el cue
    "desliza" de About. La primera tarjeta "asoma desde abajo" (ver script) para
    tirar del scroll hacia el catálogo. `pb` normal cierra hacia el footer.
  -->
  <section
    id="services"
    ref="sectionRef"
    class="relative z-10 bg-background pt-6 pb-24 sm:pt-8 sm:pb-32"
  >
    <BaseContainer size="bleed">
      <!--
        Tarjetas edge-to-edge que se APILAN (sticky stacking). Contenedor en
        flujo normal (sin gap): cada card se ancla cerca del top y la siguiente
        sube y la cubre. El `top` se escalona por índice (i * 1.5rem) desde una
        base que libra la navbar fija (6rem) → las cards previas asoman por
        arriba. `origin-top` hace que al encogerse (script) el borde superior
        quede fijo y se conserve ese asomo. z-order natural (DOM) pone la última
        al frente.
      -->
      <div class="relative">
        <article
          v-for="(service, i) in services"
          :key="service.id"
          data-cursor="grow"
          :style="cardStyle(i)"
          class="service-card group sticky min-h-[48vh] w-full origin-top overflow-hidden rounded-md bg-surface shadow-[0_-14px_44px_-18px_rgba(10,10,10,0.5)] sm:min-h-[58vh]"
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

        <!--
          Spacer: recorrido extra DENTRO del contenedor sticky para que la ÚLTIMA
          card también alcance a anclarse y cubrir a las demás, y para que el mazo
          completo se sostenga a la vista un momento antes de soltarse hacia el
          footer. Sin él, la última no tiene espacio para apilarse. Ajusta la
          altura para alargar/acortar ese "hold". Decorativo → aria-hidden.
        -->
        <div class="h-[45vh] sm:h-[55vh]" aria-hidden="true"></div>
      </div>
    </BaseContainer>
  </section>
</template>
