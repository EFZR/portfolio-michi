<script setup lang="ts">
import { onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import { useAppReady } from '@/composables/useAppReady'

// ScrollTrigger vive dentro del paquete `gsap`. Registro idempotente a nivel módulo.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const arcStageRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLElement | null>(null)

const reducedMotion = usePreferredReducedMotion()
const { isReady } = useAppReady()

/**
 * `<textPath>` referencia su `<path>` guía POR ID, y los ids son globales al
 * documento. `useId()` (Vue 3.5) genera un prefijo único por instancia del
 * componente → si la sección se montara dos veces, los arcos no se pisan el id.
 */
const uid = useId()
const arcPathId = `contact-arc-${uid}`

const email = 'karolmpalmam@gmail.com'
const lugar = 'Tegucigalpa, Honduras'

// El titular va SIEMPRE en una línea; lo que cambia entre variantes es la curva
// sobre la que se apoya, no el texto. Vive aquí para no repetir el literal.
const titulo = 'Estás listo para trabajar'
const tituloAcento = 'juntos'

/**
 * Recorrido del texto SOBRE la curva, en % de la longitud del path.
 * Con `text-anchor="middle"`, `startOffset` marca dónde cae el CENTRO de la
 * frase: 50% = centrada en el pico del arco.
 *
 * El rango se sale del path por los dos lados a propósito. SVG no dibuja los
 * glifos cuyo punto de anclaje queda fuera de la curva, así que en los extremos
 * la frase aparece/desaparece letra a letra por las patas del arco en vez de
 * entrar de golpe.
 */
const OFFSET_FROM = -8
const OFFSET_TO = 108

// Triggers/timelines/tweens creados en onMounted — se limpian en onUnmounted
// (mismo patrón que About/Services: GSAP fuera de la reactividad de Vue).
const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []
const tweens: gsap.core.Tween[] = []
let stopReadyWatch: (() => void) | null = null

onMounted(() => {
  const section = sectionRef.value
  const stage = arcStageRef.value
  if (!section || !stage) return

  // Accesibilidad: con reduced-motion el markup ya está en su estado final
  // (los textPath nacen con startOffset="50%", frase centrada y legible), así
  // que basta con no crear ninguna animación.
  if (reducedMotion.value === 'reduce') return

  // 1. EL TITULAR RECORRE EL ARCO — nace por la pata izquierda, sube, cruza el
  //    pico (donde se lee completo) y baja hasta desaparecer por la derecha.
  //    El texto NO se traslada, VIAJA sobre la curva.
  //
  //    Por eso se anima `startOffset` y no un transform: es el único parámetro
  //    que reposiciona cada glifo a lo largo del path (un translate movería el
  //    arco entero, que es un efecto distinto). Se interpola sobre un objeto
  //    proxy y se escribe en el atributo en `onUpdate` — GSAP solo toca un
  //    número y nosotros hacemos una única escritura por frame.
  //
  //
  //    El trigger es el STAGE, no la sección: así el punto medio del recorrido
  //    (frase centrada en el pico) coincide con el momento en que el arco está
  //    centrado en el viewport, que es cuando se puede leer.
  const textPaths = [...stage.querySelectorAll<SVGTextPathElement>('textPath')]
  if (textPaths.length) {
    const state = { offset: OFFSET_FROM }
    // Reposicionar el texto sobre la curva obliga al navegador a recalcular la
    // posición y el ángulo de cada glifo, así que solo escribimos cuando el
    // cambio es perceptible. Por debajo de 0.05% del recorrido no se ve nada y
    // sí cuesta un relayout del SVG en pleno scroll.
    let written = Number.NaN

    const t = gsap.fromTo(
      state,
      { offset: OFFSET_FROM },
      {
        offset: OFFSET_TO,
        ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        onUpdate: () => {
          if (Math.abs(state.offset - written) < 0.05) return
          written = state.offset
          const value = `${written}%`
          for (const tp of textPaths) tp.setAttribute('startOffset', value)
        },
      },
    )
    tweens.push(t)
    if (t.scrollTrigger) triggers.push(t.scrollTrigger)
  }

  // 2. REVEAL DE LA COLUMNA DE TEXTO — sparkle, titular y frase suben en cascada.
  const copy = section.querySelectorAll<HTMLElement>('.contact-reveal')
  if (copy.length) {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: gridRef.value,
        start: 'top 85%',
        // Sin `reverse`: una vez revelado se queda. Revertir al subir dejaba el
        // copy invisible si el trigger se desincronizaba a mitad de camino.
        toggleActions: 'play none none none',
      },
    })
    tl.from(copy, { y: 28, opacity: 0, duration: 0.7, stagger: 0.14, ease: 'power3.out' })
    timelines.push(tl)
    if (tl.scrollTrigger) triggers.push(tl.scrollTrigger)
  }

  // 3. SPARKLE FLOTANTE — bob infinito sobre el retrato (único detalle
  //    decorativo de la sección).
  const sparkle = section.querySelector<HTMLElement>('.float-detail')
  if (sparkle) {
    tweens.push(
      gsap.to(sparkle, { y: 10, repeat: -1, yoyo: true, duration: 2.1, ease: 'sine.inOut' }),
    )
  }

  // 4. PARALLAX DEL RETRATO — un ZOOM lento, no un desplazamiento. El retrato es
  //    un recorte sin fondo, así que cualquier traslación se notaría como que la
  //    silueta se despega de su sitio; escalarla la deja anclada y sin bordes
  //    que descubrir. `scale` se compone en GPU igual que `translate`.
  //
  //    El `origin-top` del template es parte del efecto, no un detalle: la
  //    imagen se apoya en el borde superior del bloque, así que un zoom desde el
  //    centro o desde abajo la haría crecer HACIA ARRIBA y le cortaría la cabeza
  //    unos píxeles. Anclado arriba, el crecimiento se va hacia abajo, que es
  //    donde sobra aire.
  if (imageRef.value) {
    const t = gsap.fromTo(
      imageRef.value,
      { scale: 1 },
      {
        scale: 1.06,
        ease: 'none',
        scrollTrigger: {
          trigger: gridRef.value,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      },
    )
    tweens.push(t)
    if (t.scrollTrigger) triggers.push(t.scrollTrigger)
  }

  // SINCRONIZACIÓN DE LOS PUNTOS DE DISPARO.
  //
  // `onMounted` corre ANTES de que terminen de cargar las fuentes. Fraunces
  // cambia las métricas de TODO el texto que hay por encima de esta sección,
  // así que el panel se desplaza cientos de píxeles después de que ScrollTrigger
  // tomó sus medidas — y los triggers quedan apuntando a posiciones que ya no
  // existen. Ese desfase hacía que, al bajar, el titular se congelara a medio
  // arco o el copy no llegara a aparecer.
  //
  // Por eso se recalcula también cuando el AppPreloader marca la web como lista
  // (fuentes + retrato del Hero ya decodificados — la misma señal que espera el
  // Hero para animar). No hace falta añadir un refresh en `load`: ScrollTrigger
  // ya lo trae en sus `autoRefreshEvents`, y duplicarlo solo añade otro momento
  // en el que el scroll puede dar un tirón.
  ScrollTrigger.refresh()

  if (!isReady.value) {
    stopReadyWatch = watch(isReady, (ready) => {
      if (!ready) return
      ScrollTrigger.refresh()
      stopReadyWatch?.()
      stopReadyWatch = null
    })
  }
})

onUnmounted(() => {
  stopReadyWatch?.()
  stopReadyWatch = null
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
    Panel de contacto (ancla #contact del footer y del drawer).

    La sección se compone de TRES piezas independientes, cada una con su propia
    regla responsive: el ARCO del titular, el RETRATO y la INFORMACIÓN.

    Solo padding SUPERIOR: el ritmo vertical lo aporta el `pt` de cada sección,
    nunca el `pb` de la anterior (evita el hueco doble). Cierra sin `pb` porque
    el AppFooter ya abre con su propio `py-20 sm:py-28`.

    El titular se desplaza con el scroll, y eso hacía que Chrome lo tomara como
    ancla de *scroll anchoring* y "compensara" el movimiento: el scroll se
    trababa y saltaba hacia atrás. El anchoring está desactivado a nivel de
    scroller en `main.css` (ver el bloque `html { overflow-anchor }`).
  -->
  <section
    id="contact"
    ref="sectionRef"
    class="relative z-10 bg-background pt-28 sm:pt-36 lg:pt-44"
  >
    <!--
      El título real para lectores de pantalla y SEO. Los arcos son imágenes
      tipográficas (`aria-hidden`), así que la jerarquía semántica vive aquí.
    -->
    <h2 class="sr-only">{{ titulo }} {{ tituloAcento }}</h2>

    <!--
      PIEZA 1 — EL ARCO.

      UNA sola curva y UNA sola línea en todas las resoluciones. Su altura no se
      fija: sale del `viewBox`, que es una fracción del ancho, así que el arco
      conserva su forma exacta en cualquier pantalla y el tamaño de letra escala
      con ella sin una sola media query tipográfica.

      Nota para quien venga a "agrandar la letra en móvil": el tamaño de un texto
      curvado no lo manda el ancho de pantalla, lo manda cuántos caracteres hay
      que repartir a lo largo del arco. Curvar más la guía da más recorrido, pero
      inclina las letras de los extremos en la misma proporción — a partir de
      ~35° de vuelco la frase deja de leerse. Probado con un arco de
      circunferencia (R=850): daba +40% de tamaño y las letras salían volcadas
      50°, ilegibles. Con una línea, esto es el techo; la única palanca que queda
      es partir la frase en dos renglones.
    -->
    <div ref="arcStageRef" aria-hidden="true" class="relative overflow-hidden">
      <!--
        Bézier cuadrática con 215 unidades de flecha sobre 1760 de cuerda: lo
        justo para leerse como arco sin que las letras de las patas queden
        volcadas. La frase ocupa el ~86% de la curva — el 14% restante es el
        recorrido por el que entra y sale de cuadro.

        La flecha se bajó de 270 a 215 para PEGAR el titular al contenido. El
        hueco no estaba en el margen —las patas del arco ya quedaban a 6-30px
        del bloque de abajo— sino bajo el PICO: cuanto más flecha, más aire
        muerto entre la parte alta de la curva y lo que viene después. Achatarla
        un 20% recorta la altura del stage en la misma proporción sin tocar el
        tamaño de letra, porque la longitud del arco apenas cambia (1859 frente
        a 1865 unidades).
      -->
      <svg viewBox="0 272 1800 410" class="w-full" fill="none">
        <path :id="arcPathId" d="M 20 630 Q 900 200 1780 630" />
        <text class="font-heading text-[145px] font-semibold tracking-tight">
          <textPath :href="`#${arcPathId}`" startOffset="50%" text-anchor="middle">
            <tspan class="fill-foreground">{{ titulo }}</tspan>
            <!--
              SVG colapsa el espacio final de un tspan ("trabajarjuntos"): un
              nbsp explícito es la única separación que <text> respeta.
            -->
            <tspan class="fill-primary italic">&#160;{{ tituloAcento }}</tspan>
          </textPath>
        </text>
      </svg>
    </div>

    <!--
      BLOQUE DE CONTENIDO — desde `xl` ocupa al menos el 85% del alto de
      pantalla, con el grid alineado arriba para que quede pegado al titular. Es
      `min-h` y no `h` porque el contenido tiene que poder CRECER por encima de
      esa medida en vez de desbordarse sobre el footer.

      Por debajo de `xl` NO se impone altura, y el bloque mide lo que mide su
      contenido. El motivo es que ese mínimo solo tiene sentido cuando la
      pantalla es más alta que el contenido; si no, lo único que hace es abrir un
      hueco entre la sección y el footer. Medido: en tablet horizontal (1024x768)
      dejaba 169px de aire muerto abajo, y en tablet vertical la altura la manda
      el retrato, así que el mínimo tampoco aportaba nada.

      El `-mt` SOLAPA el bloque con la banda inferior del stage, donde el
      titular solo entra cuando baja por las PATAS del arco — y las patas están
      en los extremos, no sobre el contenido. Es menor que antes (2vw) porque al
      achatar la curva el titular ya bajó por sí solo. Va en `vw` porque la
      altura del stage también deriva del ancho: así guarda la misma proporción
      en cualquier pantalla.
    -->
    <BaseContainer size="wide" class="-mt-[2vw] flex min-h-0 items-start xl:min-h-[85svh]">
      <!--
        RETRATO A LA IZQUIERDA, INFORMACIÓN A LA DERECHA desde tablet (`md`).
        Solo en móvil el grid se apila en VERTICAL (una fila sobre otra),
        conservando ese mismo orden: primero la imagen, después el texto.

        En `md` la pista del retrato es deliberadamente más estrecha (19rem): en
        una tablet vertical, reservarle las 24rem de `lg` dejaba la columna del
        texto en ~250px y el titular rompía en seis líneas.

        La pista del retrato se CALCULA en vez de ser un ancho fijo: `min(24rem,
        42svh)` toma el menor entre un tope absoluto y una fracción del alto de
        pantalla. Así la pista mide exactamente lo que ocupa su contenido y no
        sobra hueco — importa en pantallas anchas pero BAJAS (1280x720), donde al
        retrato lo limita el alto y no el ancho.

        La fracción es del ANCHO pero acota el ALTO: el retrato es 843x1264, así
        que su altura es 1.5 veces su ancho. Por eso 42svh de ancho son ~63svh de
        alto, y pasarse de ahí hacía que la silueta se saliera por arriba del
        bloque en 1024x768 y 1280x720 — que es exactamente lo que se veía como
        "la imagen cortada".
      -->
      <div
        ref="gridRef"
        class="grid w-full grid-cols-1 items-center gap-10 md:grid-cols-[min(19rem,32svh)_1fr] md:gap-10 lg:grid-cols-[min(24rem,42svh)_1fr] lg:gap-16 xl:grid-cols-[min(32rem,46svh)_1fr]"
      >
        <!--
          PIEZA 2 — EL RETRATO.

          Es un PNG recortado: el 46% de sus píxeles son transparentes, así que
          no lleva marco, ni fondo, ni degradado — la silueta se apoya
          directamente sobre el off-white de la página. Eso es también lo que
          permite que no se corte: con `object-contain` sobre la proporción
          nativa de la imagen (843x1264) entra ENTERA, cabeza incluida, sin
          necesidad de calibrar ningún encuadre.

          `w-full` con tope propio: en móvil el grid está apilado y la columna es
          todo el contenedor, así que sin tope la silueta ocuparía el ancho
          entero. Desde `md` el ancho ya lo fija la pista del grid.
        -->
        <div class="relative w-full max-w-[min(17rem,38svh)] md:max-w-none">
          <!--
            Sparkle UV — mismo glifo que el acento de AboutSection (motivo de
            marca). Vive sobre el retrato y no sobre el titular: la silueta es un
            recorte en blanco y negro, así que es el único sitio de la sección
            donde el acento aporta algo. Va a la altura del hombro, en el espacio
            negativo que deja la figura, para no taparla.
          -->
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            class="contact-reveal float-detail pointer-events-none absolute right-[4%] top-[12%] z-10 h-7 w-7 text-primary/70 sm:h-9 sm:w-9"
            fill="currentColor"
          >
            <path
              d="M50 0C54 34 66 46 100 50C66 54 54 66 50 100C46 66 34 54 0 50C34 46 46 34 50 0Z"
            />
          </svg>

          <img
            ref="imageRef"
            src="/hero-img.png"
            alt="Retrato"
            loading="lazy"
            class="aspect-[843/1264] w-full origin-top object-contain will-change-transform"
          />
        </div>

        <!--
          PIEZA 3 — LA INFORMACIÓN.

          Titular y, debajo, UNA frase que reúne contacto, lugar y
          disponibilidad. Sin retícula ni lista: una tabla de etiqueta/valor
          obligaba a repartir dos columnas dentro de una columna que cambia de
          ancho en cada breakpoint, y no había medida que quedara bien en todas.
          Una frase fluye: se parte donde le toque y se lee igual a 425 que a
          1920. No hay botón: el email de la frase ES el punto de contacto, y
          duplicarlo en un CTA que abre el mismo `mailto:` solo repetía la
          acción.
        -->
        <div>
          <p
            class="contact-reveal max-w-2xl font-heading text-[clamp(1.75rem,4vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-foreground"
          >
            Hagamos algo que la gente <span class="italic text-primary">recuerde</span>.
          </p>

          <!--
            UNA SOLA FRASE, no una lista de datos. El email va dentro de ella
            como enlace subrayado: es el único elemento accionable, así que se
            distingue por color y subrayado en vez de por posición, y la frase se
            puede leer de corrido sin saltos de línea forzados.
          -->
          <p class="contact-reveal mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Escríbeme a
            <a
              :href="`mailto:${email}`"
              data-cursor="grow"
              class="break-all font-medium text-foreground underline decoration-border underline-offset-4 transition-colors duration-300 hover:text-primary hover:decoration-primary"
              >{{ email }}</a
            >
            — trabajo desde {{ lugar }}, con la agenda abierta.
          </p>
        </div>
      </div>
    </BaseContainer>
  </section>
</template>
