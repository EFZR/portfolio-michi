<script setup lang="ts">
import { computed } from 'vue'
import CampoBase from './CampoBase.vue'
import { CONTROL, num, type FieldProps } from './tipos'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const min = computed(() => num(props.campo.constraints?.min))
const max = computed(() => num(props.campo.constraints?.max))
const step = computed(() => num(props.campo.constraints?.multipleOf) ?? 1)

// Un input numérico vacío devuelve '' — mandarlo como 0 convertiría "no lo he
// puesto" en "vale cero", que son cosas distintas.
function escribir(raw: string) {
  emit('cambiar', raw === '' ? undefined : Number(raw))
}
</script>

<template>
  <CampoBase
    :label="campo.label"
    :error="error"
    :pista="campo.help"
    :opcional="campo.required === false"
  >
    <template #default="{ id, descritoPor, invalido }">
      <input
        :id="id"
        :value="valor ?? ''"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        :class="CONTROL"
        @input="escribir(($event.target as HTMLInputElement).value)"
        @blur="emit('salir')"
      />
    </template>
  </CampoBase>
</template>
