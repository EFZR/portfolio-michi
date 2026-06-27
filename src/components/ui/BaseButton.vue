<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface Props {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Si se pasa, renderiza RouterLink (navegación interna SPA) */
  to?: RouteLocationRaw
  /** Si se pasa (y no hay `to`), renderiza <a> externo en nueva pestaña */
  href?: string
}

const { variant = 'primary', size = 'md', to, href } = defineProps<Props>()

// Apagamos el inheritance automático porque tenemos múltiples elementos raíz
// posibles (button / a / RouterLink) y queremos controlar manualmente
// a cuál se aplican class, @click, aria-*, etc.
defineOptions({ inheritAttrs: false })

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-background hover:bg-primary/90 focus-visible:ring-primary/40',
  secondary:
    'bg-secondary text-foreground hover:bg-secondary/90 focus-visible:ring-secondary/40',
  ghost: 'bg-transparent text-foreground hover:bg-foreground/5 focus-visible:ring-foreground/30',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-base',
  lg: 'h-14 px-8 text-lg',
}

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-full font-medium',
  'transition-colors duration-200',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:pointer-events-none disabled:opacity-50',
  variantClasses[variant],
  sizeClasses[size],
])
</script>

<template>
  <!-- 1. Navegación interna: RouterLink (SPA, sin recarga) -->
  <RouterLink v-if="to" :to="to" :class="classes" v-bind="$attrs">
    <slot />
  </RouterLink>

  <!-- 2. Enlace externo: <a> con target=_blank y rel de seguridad -->
  <a
    v-else-if="href"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :class="classes"
    v-bind="$attrs"
  >
    <slot />
  </a>

  <!-- 3. Default: botón estándar -->
  <button v-else type="button" :class="classes" v-bind="$attrs">
    <slot />
  </button>
</template>
