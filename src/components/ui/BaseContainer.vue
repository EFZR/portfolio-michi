<script setup lang="ts">
type ContainerTag = 'div' | 'section' | 'article' | 'main' | 'header' | 'footer'
type ContainerSize = 'bleed' | 'wide' | 'default' | 'narrow'

interface Props {
  as?: ContainerTag
  size?: ContainerSize
}

const { as = 'div', size = 'bleed' } = defineProps<Props>()

/**
 * Contenedor ÚNICO de todo el proyecto. Su gutter sigue EXACTAMENTE el mismo
 * ritmo que la navbar (`px-6 sm:px-8 lg:px-12` → 24/32/48px): así todo el
 * contenido —secciones, paneles, footer— comparte el mismo margen lateral y
 * queda alineado verticalmente con el logo y el menú en cada breakpoint.
 * (Antes usaba `sm:px-4`, que ENCOGÍA a 16px en pantallas grandes y dejaba el
 * contenido pegado al borde y desalineado con la navbar.)
 *
 * `bleed` (default) no impone tope de ancho — es el modo de las secciones/paneles
 * con imágenes y animaciones. Los topes (wide/default/narrow) solo acotan la
 * MEDIDA del texto largo cuando hace falta legibilidad; comparten el MISMO gutter,
 * así que su borde exterior sigue alineado con las secciones `bleed`.
 */
const sizeClasses: Record<ContainerSize, string> = {
  bleed: 'max-w-none', // edge-to-edge — parallax, imágenes, paneles tipográficos
  wide: 'max-w-7xl', // ~1280px — grids amplios (proyectos, timeline)
  default: 'max-w-5xl', // ~1024px — secciones estándar
  narrow: 'max-w-2xl', // ~672px — texto largo (blog post, contacto)
}
</script>

<template>
  <component :is="as" :class="['mx-auto w-full px-6 sm:px-8 lg:px-12', sizeClasses[size]]">
    <slot />
  </component>
</template>
