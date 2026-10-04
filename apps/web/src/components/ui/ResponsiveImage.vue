<script setup lang="ts">
import { computed } from 'vue'
import { pictureOf, type MediaAsset } from '@princess/content/media'

/**
 * Lo que acepta un `:class` de Vue, en la forma que usan estos componentes.
 * Varias tarjetas pasan un array con condicionales (`sobrio ? 'a' : 'b'`), así
 * que tiparlo como `string` suelto las rompía.
 */
type ClaseVue = string | (string | false | null | undefined)[]
// Imports RELATIVOS, no por alias: el panel monta los componentes de la web
// para la vista previa y allí `@/` apunta a `apps/admin/src`. Es la misma
// regla que ya sigue `ArticleContent.vue`.
import { medio, MEDIA_BUCKET } from '../../data/media'

/**
 * UNA IMAGEN DE LA BIBLIOTECA, SERVIDA EN EL TAMAÑO Y FORMATO QUE TOCA.
 *
 * Reemplaza a los `<img :src="…">` que pedían una URL. Lo que recibe es el ID
 * de un medio; de ahí saca los nueve archivos que generó el pipeline y deja que
 * el navegador elija uno.
 *
 * ── `sizes` NO ES OPCIONAL EN LA PRÁCTICA ────────────────────────────────────
 * Sin él, el navegador asume que la imagen ocupa el ancho completo de la
 * ventana y baja el archivo más grande del `srcset`. Es decir: toda la escalera
 * de anchos deja de servir para nada y se pierde el 96% del ahorro. Por eso
 * cada sitio que use esto tiene que decir cuánto espacio ocupa de verdad.
 *
 * ── CONTRA EL SALTO DE LAYOUT ────────────────────────────────────────────────
 * El contenedor reserva el hueco con `aspect-ratio` ANTES de que baje un solo
 * byte, y lo pinta con el color dominante y el placeholder de 150 caracteres
 * que vienen en el registro. No hay reflow cuando llega la foto, y no hay
 * destello blanco mientras llega.
 */

const props = withDefaults(
  defineProps<{
    /** ID del medio. También acepta una URL heredada — ver abajo. */
    mediaId?: string
    /**
     * Texto alternativo. Si no se pasa, se usa el del registro, que es donde
     * debería vivir: describe la imagen, no el sitio donde se usa.
     *
     * Cadena vacía = decorativa. Es un estado declarado, distinto de ausente.
     */
    alt?: string
    /** Cuánto espacio ocupa en cada ancho de pantalla. Obligatorio en la práctica. */
    sizes?: string
    /**
     * La primera imagen visible de la página. Sin `lazy` y con prioridad alta:
     * es el LCP, y retrasarla es retrasar la métrica que mide si el sitio se
     * siente rápido.
     */
    priority?: boolean
    /** Clases para el `<img>`. */
    imgClass?: ClaseVue
    /**
     * Clases para el `<picture>`.
     *
     * Hace falta porque algunas tarjetas posicionan la imagen en absoluto
     * (`absolute inset-0`) y ese posicionamiento tiene que ir en el elemento
     * exterior, no en el `<img>` de dentro.
     */
    wrapperClass?: ClaseVue
    /**
     * De dónde sale el registro a partir del ID.
     *
     * Por defecto, del `content.json` que bajó el prebuild — el contenido
     * publicado. El panel pasa otro que consulta la biblioteca VIVA: en la
     * vista previa del editor hace falta ver la foto que se acaba de subir, y
     * esa todavía no está en el snapshot publicado.
     */
    resolver?: (id: string) => MediaAsset | undefined
  }>(),
  {
    sizes: '100vw',
    priority: false,
    imgClass: 'h-full w-full object-cover',
    wrapperClass: 'block h-full w-full',
  },
)

const asset = computed(() => (props.resolver ?? medio)(props.mediaId ?? ''))
const modelo = computed(() => (asset.value ? pictureOf(asset.value, MEDIA_BUCKET) : null))

/**
 * RED DE SEGURIDAD DE LA MIGRACIÓN, y está pensada para borrarse.
 *
 * Mientras queden valores que son URLs en vez de IDs —las de picsum que
 * todavía no se han importado— esto las pinta como un `<img>` pelado en vez de
 * dejar un hueco vacío. No es «soportar los dos sistemas»: es que el problema
 * se VEA mientras se migra, en lugar de que la galería aparezca en blanco y
 * haya que adivinar por qué.
 *
 * El aviso solo sale en desarrollo: en producción no hay nadie mirando la
 * consola y el ruido no ayuda.
 */
const heredada = computed(() => {
  const v = props.mediaId
  if (!v || asset.value || /^[0-9a-f]{8,64}$/.test(v)) return null
  if (import.meta.env.DEV) {
    console.warn(
      `[media] "${v.slice(0, 60)}" no es un ID de la biblioteca. ` +
        'Es una imagen de antes de la migración: no tiene versiones para móvil.',
    )
  }
  return v
})

/** El texto alternativo: el del sitio si lo hay, el del registro si no. */
const textoAlt = computed(() => props.alt ?? modelo.value?.alt ?? '')

/**
 * Fondo del hueco reservado. El color dominante evita el destello blanco
 * incluso si el placeholder no llegó a generarse.
 */
const fondo = computed(() => {
  const m = modelo.value
  if (!m) return undefined
  return {
    backgroundColor: m.dominant,
    backgroundImage: m.placeholder ? `url("${m.placeholder}")` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})
</script>

<template>
  <!-- Una imagen de la biblioteca: el camino normal. -->
  <picture v-if="modelo" :style="fondo" :class="wrapperClass">
    <source v-for="s in modelo.sources" :key="s.type" :type="s.type" :srcset="s.srcset" :sizes="sizes" />
    <img
      :src="modelo.src"
      :srcset="modelo.srcset"
      :sizes="sizes"
      :alt="textoAlt"
      :aria-hidden="textoAlt === '' ? 'true' : undefined"
      :width="modelo.width"
      :height="modelo.height"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : undefined"
      decoding="async"
      :class="imgClass"
    />
  </picture>

  <!-- Una URL de antes de la migración. -->
  <img
    v-else-if="heredada"
    :src="heredada"
    :alt="textoAlt"
    :aria-hidden="textoAlt === '' ? 'true' : undefined"
    :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : undefined"
    decoding="async"
    :class="[wrapperClass, imgClass]"
  />

  <!--
    Sin medio y sin URL. Se pinta el hueco vacío y nada más: un icono de imagen
    roto en un portafolio de fotografía es peor que un rectángulo liso.
  -->
  <div v-else aria-hidden="true" :class="[wrapperClass, 'bg-surface']" />
</template>
