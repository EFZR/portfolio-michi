<script setup lang="ts">
import CampoDinamico from './CampoDinamico.vue'
import type { FieldProps } from './tipos'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const objeto = () => (props.valor ?? {}) as Record<string, unknown>

function cambiar(ruta: string, v: unknown) {
  // La ruta que llega del hijo es su clave completa; aquí solo interesa la
  // última, porque el grupo reconstruye SU objeto y lo emite entero hacia arriba.
  const clave = ruta.split('.').pop()!
  emit('cambiar', { ...objeto(), [clave]: v })
}
</script>

<template>
  <div class="space-y-5 border-s border-border ps-5">
    <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
      {{ campo.label }}
    </p>
    <CampoDinamico
      v-for="hijo in campo.fields ?? []"
      :key="hijo.key"
      :campo="hijo"
      :valor="objeto()[hijo.key]"
      :error="''"
      :ruta="`${ruta}.${hijo.key}`"
      @cambiar="cambiar"
      @salir="emit('salir')"
    />
  </div>
</template>
