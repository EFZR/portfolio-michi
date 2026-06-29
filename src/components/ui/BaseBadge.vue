<script setup lang="ts">
type BadgeVariant = 'default' | 'primary' | 'mono'

interface Props {
  variant?: BadgeVariant
}

const { variant = 'default' } = defineProps<Props>()

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface text-foreground border border-border',
  primary: 'bg-primary/10 text-primary border border-primary/20',
  mono: 'bg-foreground text-background font-mono',
}
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
      variantClasses[variant],
    ]"
  >
    <slot />
  </span>
</template>
