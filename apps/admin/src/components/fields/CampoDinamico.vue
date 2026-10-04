<script setup lang="ts">
import { computed } from 'vue'
import { DESCONOCIDO, REGISTRO, WIDGETS } from './registro'
import type { FieldDescriptor } from './tipos'

const props = defineProps<{
  campo: FieldDescriptor
  valor: unknown
  error: string
  ruta: string
}>()

const emit = defineEmits<{ cambiar: [ruta: string, valor: unknown]; salir: [ruta: string] }>()

const componente = computed(() =>
  props.campo.type === 'custom'
    ? (WIDGETS[props.campo.widget ?? ''] ?? DESCONOCIDO)
    : (REGISTRO[props.campo.type] ?? DESCONOCIDO),
)
</script>

<template>
  <component
    :is="componente"
    :campo="campo"
    :valor="valor"
    :error="error"
    :ruta="ruta"
    @cambiar="(v: unknown) => emit('cambiar', ruta, v)"
    @salir="emit('salir', ruta)"
  />
</template>
