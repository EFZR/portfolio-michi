<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Envoltorio de campo del PANEL.
 *
 * Replica el contrato ARIA de `BaseField` de la web —mismo slot con `id`,
 * `descritoPor` e `invalido`— pero con la piel editorial: etiqueta en
 * monoespaciada versalitas, sin caja, y el error marcado con un filete UV.
 *
 * No se reutiliza el `BaseField` de la web a propósito: hacerlo configurable
 * para dos estéticas distintas habría metido props de estilo en una primitiva
 * que hoy no tiene ninguna. Lo que importa reutilizar es el CABLEADO, y eso es
 * lo que se copia; la piel es de cada aplicación.
 */
const { label, error = '', pista = '', opcional = false } = defineProps<{
  label: string
  error?: string
  pista?: string
  opcional?: boolean
}>()

const uid = useId()
const campoId = `campo-${uid}`
const errorId = `error-${uid}`
const pistaId = `pista-${uid}`

// El orden importa: si el campo está mal, eso es lo que hay que oír antes que
// la aclaración de formato.
const descritoPor = computed(() => {
  const ids = [error ? errorId : '', pista ? pistaId : ''].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="border-t border-border pt-6">
    <label
      :for="campoId"
      class="flex items-baseline gap-2 font-mono text-[0.65rem] uppercase tracking-[0.25em]"
      :class="error ? 'text-primary' : 'text-muted-foreground'"
    >
      {{ label }}
      <span v-if="opcional" class="normal-case tracking-normal text-muted-foreground/60">
        opcional
      </span>
    </label>

    <p v-if="pista" :id="pistaId" class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
      {{ pista }}
    </p>

    <div class="mt-3">
      <slot :id="campoId" :descrito-por="descritoPor" :invalido="!!error" />
    </div>

    <p v-if="error" :id="errorId" role="alert" class="mt-2 text-sm font-medium text-primary">
      {{ error }}
    </p>
  </div>
</template>
