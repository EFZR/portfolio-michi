<script setup lang="ts">
type ContainerTag = 'div' | 'section' | 'article' | 'main' | 'header' | 'footer'
type ContainerSize = 'narrow' | 'default' | 'wide'

interface Props {
  as?: ContainerTag
  size?: ContainerSize
}

const { as = 'div', size = 'default' } = defineProps<Props>()

const sizeClasses: Record<ContainerSize, string> = {
  narrow: 'max-w-3xl', // ~768px — texto largo (blog post, contacto)
  default: 'max-w-5xl', // ~1024px — secciones estándar (about, skills)
  wide: 'max-w-6xl', // ~1152px — grids amplios (proyectos, timeline)
}
</script>

<template>
  <component :is="as" :class="['mx-auto w-full px-6 sm:px-8', sizeClasses[size]]">
    <slot />
  </component>
</template>
