<script setup lang="ts">
import { computed } from 'vue'
import CampoBase from './CampoBase.vue'
import { CONTROL, type FieldProps } from './tipos'
import { useOptions } from '@/composables/useOptions'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

/**
 * Las opciones pueden ser literales del esquema o salir de OTRA colección: el
 * rubro de un proyecto sale de `categories`, la categoría de un artículo de
 * `config/ui → blog.categories`. El compilador no puede cerrarlas porque
 * cambian con los datos, así que se resuelven aquí, en tiempo de render.
 */
const { options, loading } = useOptions(props.campo)

const radios = computed(() => props.campo.ui?.control === 'radios')
</script>

<template>
  <CampoBase
    :label="campo.label"
    :error="error"
    :pista="campo.help"
    :opcional="campo.required === false"
  >
    <template #default="{ id, descritoPor, invalido }">
      <p v-if="loading" class="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Cargando opciones…
      </p>

      <div
        v-else-if="radios"
        class="flex flex-wrap gap-2"
        role="radiogroup"
        :aria-label="campo.label"
      >
        <button
          v-for="op in options"
          :key="op.value"
          type="button"
          role="radio"
          :aria-checked="valor === op.value"
          class="rounded-md border px-4 py-2 text-sm transition-colors duration-200"
          :class="
            valor === op.value
              ? 'border-primary bg-primary text-background'
              : 'border-border hover:border-primary hover:text-primary'
          "
          @click="emit('cambiar', op.value)"
        >
          {{ op.label }}
        </button>
      </div>

      <select
        v-else
        :id="id"
        :value="valor ?? ''"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        :class="CONTROL"
        @change="emit('cambiar', ($event.target as HTMLSelectElement).value)"
        @blur="emit('salir')"
      >
        <option value="" disabled>Elige una</option>
        <option v-for="op in options" :key="op.value" :value="op.value">{{ op.label }}</option>
      </select>
    </template>
  </CampoBase>
</template>
