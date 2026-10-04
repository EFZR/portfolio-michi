<script setup lang="ts">
import type { FieldProps } from './tipos'

defineProps<FieldProps>()
</script>

<template>
  <!--
    Un tipo que ESTE panel no conoce — un esquema publicado por una versión más
    nueva. Se pinta el valor crudo en solo lectura y se dice por qué.
    Nunca se deja un hueco: un campo que desaparece en silencio es un campo que
    alguien va a dar por guardado.
  -->
  <div class="rounded-md border border-dashed border-primary/50 px-5 py-4">
    <p class="text-xs font-medium uppercase tracking-[0.2em] text-primary">
      {{ campo.label }}
    </p>
    <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
      Este panel no sabe pintar un campo de tipo
      <code class="font-mono text-foreground">{{ campo.widget ?? campo.type }}</code
      >. Actualiza el panel para poder editarlo.
    </p>
    <pre
      class="mt-3 overflow-x-auto rounded-md bg-surface p-3 font-mono text-xs text-muted-foreground"
      >{{ JSON.stringify(valor, null, 2) }}</pre>
  </div>
</template>
