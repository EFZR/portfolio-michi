<script setup lang="ts">
type ContainerTag = 'div' | 'section' | 'article' | 'main' | 'header' | 'footer'
type ContainerSize = 'bleed' | 'wide' | 'default' | 'narrow'

interface Props {
  as?: ContainerTag
  size?: ContainerSize
}

const { as = 'div', size = 'bleed' } = defineProps<Props>()

/**
 * Contenedor ÚNICO de todo el proyecto. En CELULAR conserva el margen cómodo del
 * contenedor antiguo (px-6 = 24px) para que el texto no quede pegado al borde en
 * pantallas pequeñas; de sm en adelante pasa a full-bleed ceñido (px-4 = 16px)
 * para que los efectos parallax se aprecien edge-to-edge en pantallas grandes.
 *
 * `bleed` (default) no impone tope de ancho — es el modo de las secciones/paneles
 * con imágenes y animaciones. Los topes (wide/default/narrow) solo acotan la
 * MEDIDA del texto largo cuando hace falta legibilidad; comparten el MISMO gutter
 * mínimo, así que su borde exterior sigue alineado con las secciones `bleed`.
 */
const sizeClasses: Record<ContainerSize, string> = {
  bleed: 'max-w-none', // edge-to-edge — parallax, imágenes, paneles tipográficos
  wide: 'max-w-7xl', // ~1280px — grids amplios (proyectos, timeline)
  default: 'max-w-5xl', // ~1024px — secciones estándar
  narrow: 'max-w-2xl', // ~672px — texto largo (blog post, contacto)
}
</script>

<template>
  <component :is="as" :class="['mx-auto w-full px-6 sm:px-4', sizeClasses[size]]">
    <slot />
  </component>
</template>
