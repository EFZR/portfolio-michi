<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import ProjectCategoryCard from '@/components/projects/ProjectCategoryCard.vue'
import ProjectCard from '@/components/projects/ProjectCard.vue'
import ProjectDetailModal from '@/components/projects/ProjectDetailModal.vue'
import { useDisclosure } from '@/composables/useDisclosure'
import {
  CATEGORIAS,
  nombreCategoria,
  proyectosPorFiltro,
  totalPorCategoria,
  type CategoriaId,
  type FiltroId,
  type Proyecto,
} from '@/data/proyectos'

// ScrollTrigger vive dentro del paquete `gsap`. Registro idempotente a nivel módulo.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()
const sinMovimiento = computed(() => reducedMotion.value === 'reduce')

// ─────────────────────────────── FILTRO ───────────────────────────────

/** Rubro seleccionado. `todos` = portada del portafolio, los tres mezclados. */
const filtroActivo = ref<FiltroId>('todos')

/**
 * Cuántos proyectos se pintan. El portafolio completo son 30 fichas: volcarlas
 * de golpe convierte una sección editorial en un muro de imágenes (y en 30
 * descargas simultáneas). Se abre con una selección y el resto se pide.
 */
const LOTE = 6
const visibles = ref(LOTE)

const seleccion = computed(() => proyectosPorFiltro(filtroActivo.value))

/**
 * Cómo se lee el estado del filtro. Antes decía "Rubro filtrado", que es
 * lenguaje de base de datos y además no informaba de NADA: quien llega al
 * contador quiere saber qué está viendo, así que se nombra el oficio.
 */
const estadoFiltro = computed(() =>
  filtroActivo.value === 'todos' ? 'Todo revuelto' : `Solo ${nombreCategoria(filtroActivo.value)}`,
)
const listaVisible = computed(() => seleccion.value.slice(0, visibles.value))
const quedan = computed(() => seleccion.value.length - listaVisible.value.length)

/** Cuántas destapa exactamente el próximo clic — el botón promete este número. */
const proximoLote = computed(() => Math.min(LOTE, quedan.value))

/**
 * Click en una tarjeta de rubro: filtra por él, o vuelve a "todos" si ya estaba
 * puesto. El mismo control pone y quita — sin esto haría falta un botón extra
 * de reset y la tarjeta activa quedaría muerta al segundo click.
 */
function alternarCategoria(id: CategoriaId) {
  filtroActivo.value = filtroActivo.value === id ? 'todos' : id
}

function verTodos() {
  filtroActivo.value = 'todos'
}

function mostrarMas() {
  visibles.value += LOTE
}

// Cambiar de rubro reinicia el lote: entrar a "Fotografía" y encontrarse 18
// huecos ya expandidos del filtro anterior no tendría ningún sentido.
watch(filtroActivo, () => {
  visibles.value = LOTE
})

/**
 * Retardo en cascada de la entrada. Se topa a 5 pasos: con lotes de 6 el último
 * no debe esperar medio segundo, y al cambiar de rubro la cascada tiene que
 * terminar antes de que el ojo la lea como una carga lenta.
 */
function retardo(i: number): string {
  return `${Math.min(i, 5) * 60}ms`
}

// ──────────────────────────────── FICHA ────────────────────────────────

const { isOpen: fichaAbierta, open: abrirFicha, close: cerrarFicha } = useDisclosure()

/**
 * Proyecto de la ficha. NO se limpia al cerrar: el diálogo necesita su
 * contenido durante la animación de salida (ver el comentario de la prop en
 * `ProjectDetailModal`).
 */
const proyectoActivo = ref<Proyecto | null>(null)

function verProyecto(proyecto: Proyecto) {
  proyectoActivo.value = proyecto
  abrirFicha()
}

/** "1" → "01". Numeración editorial compartida con el resto del sitio. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// ─────────────────────────────── REVELADO ───────────────────────────────

const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []

onMounted(() => {
  const section = sectionRef.value
  if (!section || sinMovimiento.value) return

  const kicker = section.querySelector<HTMLElement>('.reveal-kicker')
  const titulo = section.querySelectorAll<HTMLElement>('.reveal-titulo')
  const tarjetas = section.querySelectorAll<HTMLElement>('.reveal-rubro')

  // Solo la cabecera y las tres tarjetas de rubro: son nodos ESTABLES. El grid
  // de proyectos se monta y desmonta con el filtro, así que su entrada la
  // resuelve el <TransitionGroup> del template — un `from` de GSAP sobre nodos
  // que Vue va a reemplazar dejaría fichas congeladas en opacidad 0.
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 75%', toggleActions: 'play none none reverse' },
  })

  if (kicker) tl.from(kicker, { y: 20, opacity: 0, duration: 0.5 })
  tl.from(titulo, { yPercent: 110, duration: 0.9, stagger: 0.12, ease: 'power4.out' }, '-=0.25')
  tl.from(tarjetas, { y: 48, opacity: 0, duration: 0.8, stagger: 0.12 }, '-=0.5')

  timelines.push(tl)
  if (tl.scrollTrigger) triggers.push(tl.scrollTrigger)
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
    Página /projects — el portafolio completo.

    Nació como una sección del Home y ahora es una ruta propia, así que el
    espaciado cambió de dueño: el `pt-24` del <main> en MainLayout ya la
    despeja de la navbar fija, y aquí solo se añade el aire de respiro. Si se
    dejara el `pt-28 sm:pt-36 lg:pt-44` que usan las secciones del Home, los
    dos paddings se sumarían y la página abriría con ~230px vacíos.

    El `pb` SÍ existe aquí, y es la excepción a la regla de "solo padding
    arriba": esa regla evita el hueco doble ENTRE secciones, pero el footer no
    es una sección más — abre con un `border-t` a todo el ancho, y sin este
    aire la última fila de fichas quedaba pegada a esa línea.

    `size="bleed"` y no `wide`: con el tope de 1280px la página se leía como
    una columna centrada en pantallas grandes, encogida respecto al Hero y al
    resto del sitio, que van de borde a borde. Bleed comparte el MISMO gutter
    que la navbar, así que el portafolio queda alineado con el logo y el menú.
  -->
  <section ref="sectionRef" class="pt-10 pb-24 sm:pt-14 sm:pb-32">
    <BaseContainer size="bleed">
      <!-- Cabecera editorial: kicker + titular partido en dos líneas enmascaradas. -->
      <header class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="reveal-kicker text-xs font-medium uppercase tracking-[0.3em] text-primary">
            Portafolio
          </p>

          <!--
            H1 de la página. La regla "solo el Hero usa H1" vale para el Home,
            donde compiten varias secciones; esta es una ruta aparte y quedarse
            sin H1 la dejaría sin encabezado principal.
          -->
          <h1 class="mt-4 text-4xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
            <!--
              Cada línea va dentro de una máscara `overflow-hidden` y la palabra
              sube desde abajo (yPercent 110 → 0). El reveal vive en el <span>
              interno, nunca en la máscara: si se animara la máscara, el recorte
              se movería con la palabra y no habría efecto.
            -->
            <span class="block overflow-hidden py-[0.1em]">
              <span class="reveal-titulo block">Trabajo</span>
            </span>
            <span class="block overflow-hidden py-[0.1em]">
              <span class="reveal-titulo block font-heading italic">seleccionado</span>
            </span>
          </h1>
        </div>

        <p class="max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
          Treinta historias que ya salieron de mi cabeza. Entra por el oficio que te llame o
          recórrelas revueltas, como fueron pasando.
        </p>
      </header>

      <!--
        TARJETAS DE RUBRO — también son el filtro. `role="group"` + su
        etiqueta convierten las tres en un control único para quien navega con
        lector de pantalla, en vez de tres botones sueltos sin relación.
      -->
      <div
        role="group"
        aria-label="Elegir un oficio"
        class="mt-14 grid gap-4 sm:mt-20 sm:grid-cols-3 sm:gap-6"
      >
        <ProjectCategoryCard
          v-for="(categoria, i) in CATEGORIAS"
          :key="categoria.id"
          class="reveal-rubro"
          :categoria="categoria"
          :indice="i + 1"
          :total="totalPorCategoria(categoria.id)"
          :activa="filtroActivo === categoria.id"
          @toggle="alternarCategoria"
        />
      </div>

      <!--
        Barra de estado del filtro. `aria-live="polite"` anuncia el recuento al
        cambiar de rubro: sin esto, quien usa lector de pantalla pulsa un filtro
        y no recibe ninguna confirmación de que el grid cambió.
      -->
      <div
        class="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 sm:mt-24"
      >
        <p aria-live="polite" class="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          <span class="text-foreground">{{ pad(listaVisible.length) }}</span>
          <span class="mx-1">/</span>{{ pad(seleccion.length) }}
          <span class="mx-2 text-border">·</span>
          {{ estadoFiltro }}
        </p>

        <BaseCtaButton
          v-if="filtroActivo !== 'todos'"
          text="Verlo todo"
          variant="outline"
          class="shrink-0"
          @click="verTodos"
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
              <path d="M3 5h7v7H3zM14 5h7v7h-7zM3 16h7v3H3zM14 16h7v3h-7z" />
            </svg>
          </template>
        </BaseCtaButton>
      </div>

      <!--
        RETÍCULA REGULAR. Todas las fichas miden exactamente lo mismo: mismas
        columnas, misma proporción de imagen (4:5) y el mismo pie. Ninguna pesa
        más que otra — el orden de la lista es toda la jerarquía que hay.

        Tres columnas como máximo, y no cuatro, porque los lotes van de seis en
        seis: con tres, cada lote completa filas enteras (6 = 3+3, 12 = 3+3+3+3)
        y no queda media fila coja al final.

        <TransitionGroup> cubre los dos cambios posibles —filtrar y pedir más
        fichas—. La salida es corta (200ms) y la entrada arranca justo después
        (delay-200) para que no se solapen dos estados; `move-class` acompaña a
        las fichas que se quedan mientras el resto se recoloca.
      -->
      <TransitionGroup
        tag="div"
        class="mt-12 grid gap-x-6 gap-y-14 sm:mt-16 sm:grid-cols-2 sm:gap-y-16 lg:grid-cols-3 lg:gap-x-8"
        :enter-active-class="
          sinMovimiento
            ? ''
            : 'transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] delay-200'
        "
        :enter-from-class="sinMovimiento ? '' : 'translate-y-10 opacity-0'"
        :leave-active-class="sinMovimiento ? '' : 'transition duration-200 ease-in'"
        :leave-to-class="sinMovimiento ? '' : 'opacity-0'"
        :move-class="sinMovimiento ? '' : 'transition-transform duration-500 ease-out'"
      >
        <ProjectCard
          v-for="(proyecto, i) in listaVisible"
          :key="proyecto.id"
          :style="sinMovimiento ? undefined : { transitionDelay: retardo(i) }"
          :proyecto="proyecto"
          :folio="i + 1"
          @abrir="verProyecto"
        />
      </TransitionGroup>

      <!-- Lote siguiente. Desaparece cuando ya no queda nada por mostrar. -->
      <div v-if="quedan > 0" class="mt-16 flex justify-center sm:mt-20">
        <BaseCtaButton
          :text="`Ver ${proximoLote} historia${proximoLote === 1 ? '' : 's'} más`"
          variant="outline"
          size="lg"
          @click="mostrarMas"
        >
          <template #trailing>
            <svg
              class="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </template>
        </BaseCtaButton>
      </div>

      <!--
        Nota de cierre, en primera persona. No es un "fin del listado": quien
        llegó hasta abajo ya las vio todas y merece que le hablen, no que le
        informen de que el array se acabó.

        Cuenta sobre `seleccion`, NO sobre el archivo entero: con un oficio
        filtrado decía "30 historias" después de enseñar 10, y el cierre
        quedaba mintiendo justo en la última línea de la página.
      -->
      <p
        v-else
        class="mt-16 text-center font-mono text-xs tracking-[0.2em] text-muted-foreground sm:mt-20"
      >
        {{ seleccion.length }} HISTORIAS — ESO ES TODO LO QUE PUEDO ENSEÑAR POR AHORA
      </p>
    </BaseContainer>

    <!-- Ficha ampliada. Se teletransporta a <body> desde BaseModal. -->
    <ProjectDetailModal :open="fichaAbierta" :proyecto="proyectoActivo" @close="cerrarFicha" />
  </section>
</template>
