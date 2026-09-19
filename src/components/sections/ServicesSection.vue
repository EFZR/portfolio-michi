<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useDisclosure } from '@/composables/useDisclosure'

// ScrollTrigger vive dentro del paquete `gsap`. Registro idempotente a nivel módulo.
gsap.registerPlugin(ScrollTrigger)

const stageRef = ref<HTMLElement | null>(null)
const railRef = ref<HTMLElement | null>(null)

/** Índice de la diapositiva "en reposo" — alimenta el contador editorial 01/03. */
const activeIndex = ref(0)

const reducedMotion = usePreferredReducedMotion()

/**
 * Con reduced-motion NO hay pantalla fija ni cross-fade: las diapositivas caen
 * en flujo normal, una debajo de otra, todas visibles. El template se adapta con
 * clases condicionadas en vez de duplicar markup.
 */
const isStatic = computed(() => reducedMotion.value === 'reduce')

const { isOpen: catalogOpen, open: openCatalog, close: closeCatalog } = useDisclosure()

// Timelines/triggers creados en onMounted — se limpian todos en onUnmounted.
const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []

/**
 * Servicios / áreas principales. `image` es un mockup placeholder (picsum con
 * seed fijo → imagen estable). Cada entrada es una "doble página" de revista:
 * bloque tipográfico a la izquierda, imagen a la derecha.
 *
 * EL ORDEN ES JERARQUÍA, no alfabético ni casual: Marketing va primero porque
 * es el servicio principal, luego Fotografía y cierra Modelaje. Es el MISMO
 * orden que el statement de AboutSection ("Mercadóloga, fotógrafa & modelo") y
 * que el catálogo de abajo — si cambia uno, tienen que cambiar los tres.
 */
const services = [
  {
    id: 'marketing',
    image: 'https://picsum.photos/seed/princess-mkt/1600/2000',
    title: 'Marketing',
    tagline: 'Estrategia · Contenido de marca',
    detail: 'Convierto la estética en mensajes que conectan y venden.',
  },
  {
    id: 'fotografia',
    image: 'https://picsum.photos/seed/princess-foto/1600/2000',
    title: 'Fotografía',
    tagline: 'Editorial · Producto · Retrato',
    detail: 'Dirijo la luz para que cada imagen cuente tu historia.',
  },
  {
    id: 'modelaje',
    image: 'https://picsum.photos/seed/princess-model/1600/2000',
    title: 'Modelaje',
    tagline: 'Pasarela · Campaña · Lookbook',
    detail: 'Presencia frente a cámara con dirección propia.',
  },
] as const

/**
 * Catálogo completo — el desglose que NO cabe en las tres diapositivas. Vive en
 * el modal para mantener la sección limpia sin esconder información al cliente.
 */
const catalogo = [
  {
    id: 'marketing',
    titulo: 'Marketing',
    nota: 'Estrategia · Contenido · Marca',
    items: [
      {
        nombre: 'Estrategia de contenido',
        descripcion: 'Calendario, pilares y formatos según el objetivo del trimestre.',
      },
      {
        nombre: 'Identidad visual y tono',
        descripcion: 'Guía viva de color, tipografía y voz para que todo se vea tuyo.',
      },
      {
        nombre: 'Gestión de redes',
        descripcion: 'Publicación, comunidad y respuesta con criterio editorial.',
      },
      {
        nombre: 'Campañas de lanzamiento',
        descripcion: 'Del teaser al cierre: piezas, calendario y medición.',
      },
      {
        nombre: 'Copywriting con estética',
        descripcion: 'Textos que suenan a la marca y empujan a la acción.',
      },
      {
        nombre: 'Reportes de desempeño',
        descripcion: 'Métricas leídas en claro, con la decisión que sigue.',
      },
    ],
  },
  {
    id: 'fotografia',
    titulo: 'Fotografía',
    nota: 'Set · Locación · Estudio',
    items: [
      {
        nombre: 'Editorial de moda',
        descripcion: 'Series narrativas con concepto, styling y luz propia.',
      },
      {
        nombre: 'Retrato de autor',
        descripcion: 'Personal o corporativo, dirigido para que la pose no se sienta pose.',
      },
      {
        nombre: 'Producto y bodegón',
        descripcion: 'Catálogo, e-commerce y piezas de campaña con luz controlada.',
      },
      {
        nombre: 'Lookbook de marca',
        descripcion: 'Colección completa lista para tienda, redes y prensa.',
      },
      {
        nombre: 'Cobertura de evento',
        descripcion: 'Documental de marca: montaje, invitados y detalle.',
      },
      {
        nombre: 'Dirección de arte en set',
        descripcion: 'Concepto, paleta, atrezo y moodboard antes del primer disparo.',
      },
    ],
  },
  {
    id: 'modelaje',
    titulo: 'Modelaje',
    nota: 'Pasarela · Campaña · Imagen',
    items: [
      { nombre: 'Pasarela', descripcion: 'Desfile, prueba de vestuario y ensayo incluidos.' },
      {
        nombre: 'Campaña publicitaria',
        descripcion: 'Imagen de producto o servicio para medios impresos y digitales.',
      },
      {
        nombre: 'Lookbook y catálogo',
        descripcion: 'Jornadas de alto volumen con cambios rápidos y continuidad.',
      },
      {
        nombre: 'Imagen de marca',
        descripcion: 'Rostro recurrente de una marca a lo largo de una temporada.',
      },
      { nombre: 'Contenido UGC', descripcion: 'Piezas verticales, nativas y creíbles para redes.' },
      {
        nombre: 'Asesoría de portafolio',
        descripcion: 'Selección, secuencia y edición para book de modelo.',
      },
    ],
  },
] as const

/** "1" → "01". Numeración editorial del contador y de cada diapositiva. */
function pad(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * RITMO DE LA SECUENCIA (en unidades de timeline, no en px).
 *   STEP → cuánto dura el cruce entre dos servicios
 *   HOLD → reposo antes del cruce siguiente (evita el efecto "PowerPoint":
 *          cada diapositiva respira quieta un tramo antes de disolverse)
 * La duración real la reparte GSAP sobre el recorrido de scroll, así que solo
 * importa la PROPORCIÓN entre ambas.
 */
const STEP = 2.2
const HOLD = 1

onMounted(() => {
  const stage = stageRef.value
  if (!stage || isStatic.value) return

  const slides = gsap.utils.toArray<HTMLElement>('.service-slide', stage)
  if (slides.length < 2) return

  // Estado inicial: solo la primera visible. `autoAlpha` apaga también la
  // `visibility`, así que las ocultas no capturan hover ni foco.
  slides.forEach((slide, i) => gsap.set(slide, { autoAlpha: i === 0 ? 1 : 0 }))

  // Posición (en tiempo de timeline) donde ARRANCA el cruce hacia la slide `i`.
  const positions = slides.map((_, i) => (i === 0 ? 0 : HOLD * i + STEP * (i - 1)))

  // Duración real de la timeline, necesaria para mapear `progress → índice`. Se
  // rellena tras construirla; el valor inicial solo cubre un onUpdate temprano.
  let span = 1

  const tl = gsap.timeline({
    defaults: { overwrite: 'auto' },
    scrollTrigger: {
      trigger: stage,
      start: 'top top',
      // Recorrido de scroll por cruce. `invalidateOnRefresh` lo recalcula al
      // cambiar el tamaño del viewport (la función se reevalúa en cada refresh).
      end: () => `+=${(slides.length - 1) * window.innerHeight * 1.25}`,
      pin: stage,
      pinSpacing: true,
      anticipatePin: 1,
      // `scrub: 1` = un segundo de inercia entre el scroll y la animación. Es lo
      // que convierte el cruce en un fundido fluido en vez de un salto atado 1:1
      // a la rueda del ratón.
      scrub: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const t = self.progress * span
        let i = 0
        for (let k = 1; k < slides.length; k++) {
          if (t >= positions[k] + STEP * 0.5) i = k
        }
        if (i !== activeIndex.value) activeIndex.value = i
      },
    },
  })

  for (let i = 1; i < slides.length; i++) {
    const prev = slides[i - 1]
    const next = slides[i]
    const at = positions[i]

    const prevMedia = prev.querySelector<HTMLElement>('.slide-media')
    const nextMedia = next.querySelector<HTMLElement>('.slide-media')
    const prevLines = prev.querySelectorAll<HTMLElement>('.slide-line')
    const nextLines = next.querySelectorAll<HTMLElement>('.slide-line')

    // SALIDA — la diapositiva se disuelve mientras su imagen se aleja un pelín
    // (scale + y) y sus líneas de texto se van ANTES que el bloque completo: ese
    // desfase es lo que da la sensación de profundidad editorial.
    tl.to(prev, { autoAlpha: 0, duration: STEP * 0.55, ease: 'power1.inOut' }, at)
    if (prevMedia) {
      tl.to(prevMedia, { yPercent: -3, scale: 1.04, duration: STEP * 0.6, ease: 'power2.in' }, at)
    }
    tl.to(
      prevLines,
      { y: -32, opacity: 0, duration: STEP * 0.45, stagger: 0.05, ease: 'power2.in' },
      at,
    )

    // ENTRADA — solapada con la salida (cross-fade real: empieza en `at + 30%`
    // del cruce, no cuando la anterior ya terminó) y con su propio stagger:
    // primero la imagen, luego las líneas.
    tl.fromTo(
      next,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: STEP * 0.55, ease: 'power1.inOut' },
      at + STEP * 0.3,
    )
    if (nextMedia) {
      tl.fromTo(
        nextMedia,
        { yPercent: 4, scale: 1.06 },
        { yPercent: 0, scale: 1, duration: STEP * 0.7, ease: 'power2.out' },
        at + STEP * 0.3,
      )
    }
    tl.fromTo(
      nextLines,
      { y: 38, opacity: 0 },
      { y: 0, opacity: 1, duration: STEP * 0.6, stagger: 0.08, ease: 'power3.out' },
      at + STEP * 0.45,
    )
  }

  // Cola vacía: la última diapositiva se sostiene a la vista un tramo antes de
  // que el pin suelte la sección hacia Contacto.
  tl.to({}, { duration: HOLD })

  span = tl.duration()

  // Riel de progreso — un único tween lineal sobre TODO el recorrido. Va después
  // de calcular `span` para que cubra exactamente la timeline completa.
  if (railRef.value) {
    tl.fromTo(
      railRef.value,
      { scaleX: 1 / slides.length },
      { scaleX: 1, ease: 'none', duration: span },
      0,
    )
  }

  timelines.push(tl)
  if (tl.scrollTrigger) triggers.push(tl.scrollTrigger)

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
    Panel "Servicios" — secuencia EDITORIAL sobre pantalla fija (pin de
    ScrollTrigger): el escenario se clava al viewport y los servicios se cruzan
    con fundidos mientras la página sigue scrolleando. Continúa la "hoja" clara
    por encima del Hero sticky (relative z-10 + bg-background).

    `pt` mínimo y SIN `pb`: esta sección fluye desde About (mismo bg, sin
    costura) y el aire hacia ContactSection lo aporta el `pt` de esa sección —
    un solo dueño del ritmo vertical.
  -->
  <section id="services" class="relative z-10 bg-background pt-6 sm:pt-8">
    <!--
      ESCENARIO. En modo animado mide exactamente un viewport (`h-[100svh]`, que
      en móvil ignora la barra de direcciones) y es el elemento que ScrollTrigger
      pinnea; `overflow-hidden` recorta las diapositivas que entran o salen.
      Con reduced-motion pierde el alto fijo y todo cae en flujo normal.
    -->
    <div
      ref="stageRef"
      :class="isStatic ? 'relative' : 'relative h-[100svh] overflow-hidden'"
      class="w-full"
    >
      <BaseContainer
        size="bleed"
        :class="[
          'flex flex-col gap-6',
          isStatic ? 'py-12' : 'absolute inset-0 pb-8 pt-28 sm:pb-10',
        ]"
      >
        <!--
          Cabecera de la "revista": kicker + bajada a la izquierda, folio a la
          derecha. Alineada al gutter estándar (BaseContainer) → comparte margen
          con la navbar y el resto del sitio, mientras la diapositiva vive en su
          propio 80% centrado: esa asimetría es la que da el aire de revista.
        -->
        <header class="flex items-end justify-between gap-6">
          <div>
            <h2 class="font-body text-xs font-medium uppercase tracking-[0.3em] text-primary">
              Servicios
            </h2>
            <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
              Tres frentes, una misma mirada.
            </p>
          </div>

          <!-- Folio 01/03 — decorativo: el orden real lo dan los encabezados. -->
          <p
            v-if="!isStatic"
            aria-hidden="true"
            class="shrink-0 font-mono text-xs tracking-[0.25em] text-muted-foreground sm:text-sm"
          >
            <span class="text-foreground">{{ pad(activeIndex + 1) }}</span>
            <span class="mx-1">/</span>{{ pad(services.length) }}
          </p>
        </header>

        <!--
          Lienzo de las diapositivas. Animado: caja relativa que ocupa el alto
          restante y sobre la que las slides se apilan en `absolute inset-0`.
          Estático: columna con aire entre servicios.
        -->
        <div :class="isStatic ? 'flex flex-col gap-24 py-8' : 'relative min-h-0 flex-1'">
          <article
            v-for="(service, i) in services"
            :key="service.id"
            :class="[
              'service-slide mx-auto grid w-[86vw] grid-rows-[minmax(0,1fr)_auto] gap-5',
              'sm:w-[80vw] sm:grid-cols-12 sm:grid-rows-1 sm:gap-8',
              isStatic ? 'relative min-h-[72vh]' : 'absolute inset-0',
              !isStatic && i > 0 ? 'invisible opacity-0' : '',
            ]"
          >
            <!--
              Imagen — columnas 6-12 (asimetría editorial: el bloque de texto no
              parte la página por la mitad). `slide-media` es el nodo que recibe
              el micro-desplazamiento + scale del cruce, separado del <img> para
              que el zoom de hover no pelee con el transform de GSAP.
            -->
            <figure
              class="slide-media group relative min-h-0 overflow-hidden rounded-md bg-surface sm:col-span-7 sm:col-start-6 sm:row-start-1"
            >
              <img
                :src="service.image"
                alt=""
                aria-hidden="true"
                :loading="i === 0 ? 'eager' : 'lazy'"
                class="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />
            </figure>

            <!--
              Bloque tipográfico — columnas 1-5, alineado al PIE de la caja
              (`justify-end`) para que la línea base del título converja con el
              borde inferior de la imagen: la retícula clásica de revista.
              Cada `.slide-line` entra/sale con su propio retardo (stagger).
            -->
            <div
              class="flex flex-col justify-end sm:col-span-5 sm:col-start-1 sm:row-start-1 sm:pb-2 sm:pr-6"
            >
              <p
                class="slide-line font-mono text-[0.7rem] uppercase tracking-[0.3em] text-primary sm:text-xs"
              >
                {{ pad(i + 1) }} — Servicio
              </p>

              <h3
                class="slide-line mt-3 font-heading text-[clamp(2.25rem,7vw,5.5rem)] font-semibold leading-[0.95] tracking-tight text-foreground sm:mt-5"
              >
                {{ service.title }}
              </h3>

              <p
                class="slide-line mt-3 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground sm:mt-5 sm:text-sm"
              >
                {{ service.tagline }}
              </p>

              <p
                class="slide-line mt-3 max-w-sm text-sm leading-relaxed text-foreground/80 sm:mt-4 sm:text-base"
              >
                {{ service.detail }}
              </p>
            </div>
          </article>
        </div>

        <!--
          Pie del escenario: riel de progreso a la izquierda (solo animado) y la
          entrada al catálogo completo a la derecha. Vive FUERA del lienzo de
          diapositivas, así que permanece visible durante toda la secuencia.
        -->
        <footer class="flex items-center justify-between gap-6">
          <div
            v-if="!isStatic"
            aria-hidden="true"
            class="hidden h-px w-full max-w-xs bg-border sm:block"
          >
            <div ref="railRef" class="h-px w-full origin-left bg-primary"></div>
          </div>

          <BaseCtaButton
            text="Catálogo completo"
            variant="outline"
            aria-haspopup="dialog"
            :aria-expanded="catalogOpen"
            class="shrink-0"
            @click="openCatalog"
          >
            <template #trailing>
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </template>
          </BaseCtaButton>
        </footer>
      </BaseContainer>
    </div>

    <!--
      Catálogo completo. `BaseModal` se teletransporta a <body>, así que no lo
      recorta el `overflow-hidden` del escenario pinneado.
    -->
    <BaseModal
      :open="catalogOpen"
      size="wide"
      eyebrow="Todo lo que hago"
      title="Catálogo de servicios"
      @close="closeCatalog"
    >
      <div class="grid gap-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
        <section v-for="grupo in catalogo" :key="grupo.id">
          <h3
            class="font-heading text-2xl font-semibold leading-none tracking-tight text-foreground sm:text-3xl"
          >
            {{ grupo.titulo }}
          </h3>
          <p class="mt-2 text-[0.7rem] uppercase tracking-[0.25em] text-primary sm:text-xs">
            {{ grupo.nota }}
          </p>

          <ul class="mt-6 space-y-5 border-t border-border pt-6">
            <li v-for="item in grupo.items" :key="item.nombre">
              <p class="text-sm font-medium text-foreground sm:text-base">{{ item.nombre }}</p>
              <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                {{ item.descripcion }}
              </p>
            </li>
          </ul>
        </section>
      </div>

      <p
        class="mt-12 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground sm:text-base"
      >
        ¿Tu proyecto no encaja en ninguna casilla? Suele ser la mejor señal —
        <a
          href="#contact"
          data-cursor="grow"
          class="text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors duration-300 hover:text-primary"
          @click="closeCatalog"
          >escríbeme y lo armamos a medida</a
        >.
      </p>
    </BaseModal>
  </section>
</template>
