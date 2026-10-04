<script setup lang="ts">
import CampoBase from './CampoBase.vue'
import { CONTROL, type FieldProps } from './tipos'

defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()
</script>

<template>
  <CampoBase
    :label="campo.label"
    :error="error"
    :pista="campo.help"
    :opcional="campo.required === false"
  >
    <template #default="{ id, descritoPor, invalido }">
      <!-- `type="date"` ya entrega YYYY-MM-DD, que es el formato que espera
           `lib/dates.ts` — no hay conversión que equivocarse. -->
      <input
        :id="id"
        :value="valor ?? ''"
        type="date"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        :class="CONTROL"
        @input="emit('cambiar', ($event.target as HTMLInputElement).value)"
        @blur="emit('salir')"
      />
    </template>
  </CampoBase>
</template>
