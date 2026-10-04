<script setup lang="ts">
import { computed, useId } from 'vue'

interface Props {
  /** Etiqueta visible. Es TAMBIÉN el nombre accesible del control. */
  label: string
  /** Mensaje de error. Vacío = campo válido. */
  error?: string
  /** Aclaración bajo la etiqueta (formato esperado, qué pasa después…). */
  pista?: string
  /** Por defecto los campos son obligatorios; los opcionales se marcan. */
  opcional?: boolean
}

const { label, error = '', pista = '', opcional = false } = defineProps<Props>()

/**
 * Los ids de `for`, `aria-describedby` y compañía son GLOBALES al documento.
 * `useId()` (Vue 3.5) los genera por instancia — mismo patrón que `BaseModal` y
 * el `<textPath>` de Contacto. Sin esto, dos campos con la misma etiqueta
 * romperían la asociación y el lector de pantalla leería la ayuda equivocada.
 */
const uid = useId()
const campoId = `campo-${uid}`
const errorId = `error-${uid}`
const pistaId = `pista-${uid}`

/**
 * `aria-describedby` admite VARIOS ids separados por espacio, y el orden es el
 * orden en que se leen. El error va primero: si el campo está mal, eso es lo
 * que hay que oír antes que la aclaración de formato.
 */
const descritoPor = computed(() => {
  const ids = [error ? errorId : '', pista ? pistaId : ''].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div>
    <label
      :for="campoId"
      class="block text-xs font-medium uppercase tracking-[0.2em] text-foreground"
    >
      {{ label }}
      <span v-if="opcional" class="ml-1 normal-case tracking-normal text-muted-foreground">
        (opcional)
      </span>
    </label>

    <p v-if="pista" :id="pistaId" class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
      {{ pista }}
    </p>

    <!--
      El control lo pone quien usa el campo (input, select, textarea), pero los
      ids y el cableado ARIA salen de aquí: es la única forma de que los tres
      tipos de control compartan exactamente el mismo contrato de accesibilidad
      sin repetirlo —y sin olvidarlo— en cada uno.
    -->
    <div class="mt-3">
      <slot :id="campoId" :descrito-por="descritoPor" :invalido="!!error" />
    </div>

    <!--
      `role="alert"` anuncia el error en cuanto aparece, sin esperar a que el
      foco llegue al campo. En la paleta no hay rojo: el error se marca con el
      Ultraviolet, que es el color que el sistema reserva para "mírame".
    -->
    <p v-if="error" :id="errorId" role="alert" class="mt-2 text-sm font-medium text-primary">
      {{ error }}
    </p>
  </div>
</template>
