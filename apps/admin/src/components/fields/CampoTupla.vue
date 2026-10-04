<script setup lang="ts">
import CampoDinamico from './CampoDinamico.vue'
import type { FieldProps } from './tipos'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const lista = () => (Array.isArray(props.valor) ? [...props.valor] : [])

function cambiar(ruta: string, v: unknown) {
  const i = Number(ruta.split('.').pop())
  const copia = lista()
  copia[i] = v
  emit('cambiar', copia)
}
</script>

<template>
  <!--
    Una tupla NO se puede reordenar ni ampliar: cada posición tiene su propio
    significado, su etiqueta y su tope. Las cinco palabras del Hero llevan
    sangrías distintas por índice; una sexta no sería copy, sería rediseño.
    Por eso no hay botones de añadir ni de arrastrar aquí.
  -->
  <fieldset class="space-y-6 border-t border-border pt-6">
    <legend class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
      {{ campo.label }}
    </legend>
    <p v-if="campo.help" class="text-sm leading-relaxed text-muted-foreground">{{ campo.help }}</p>

    <CampoDinamico
      v-for="(elemento, i) in campo.elements ?? []"
      :key="i"
      :campo="elemento"
      :valor="lista()[i]"
      :error="''"
      :ruta="`${ruta}.${i}`"
      @cambiar="cambiar"
      @salir="emit('salir')"
    />
  </fieldset>
</template>
