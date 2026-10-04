<script setup lang="ts">
import type { FieldProps } from './tipos'

defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()
</script>

<template>
  <!--
    Un interruptor no lleva BaseField: su etiqueta va AL LADO y no encima, y
    forzarlo al mismo molde que un input dejaría la casilla huérfana bajo un
    título. El cableado ARIA lo da el <label> que lo envuelve.
  -->
  <label class="flex cursor-pointer items-start gap-4 border-t border-border pt-6">
    <input
      :checked="valor === true"
      type="checkbox"
      class="mt-0.5 h-5 w-5 shrink-0 rounded-md border-border accent-primary"
      @change="emit('cambiar', ($event.target as HTMLInputElement).checked)"
      @blur="emit('salir')"
    />
    <span>
      <span class="block font-mono text-[0.65rem] uppercase tracking-[0.25em]">{{ campo.label }}</span>
      <span v-if="campo.help" class="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
        {{ campo.help }}
      </span>
    </span>
  </label>
</template>
