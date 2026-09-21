<script setup lang="ts">
import { computed } from 'vue'
import { esArchivo, esReciente, DIAS_RECIENTE } from '@/lib/fechas'

interface Props {
  /** ISO `YYYY-MM-DD`. */
  publishedAt: string
}

const { publishedAt } = defineProps<Props>()

/**
 * Los dos extremos del eje temporal, calculados — nunca escritos a mano en los
 * datos. Un campo `esNuevo: true` en el mock se quedaría obsoleto al día
 * siguiente y nadie se acordaría de apagarlo.
 */
const marca = computed<'nuevo' | 'archivo' | null>(() => {
  if (esReciente(publishedAt)) return 'nuevo'
  if (esArchivo(publishedAt)) return 'archivo'
  return null
})
</script>

<template>
  <!--
    "Nuevo" pide atención: es el único sitio del listado donde el Ultravioleta
    aparece como fondo, y por eso funciona. "Archivo" hace lo contrario —
    trazo fino, sin relleno y en gris— porque su trabajo es avisar, no llamar.
  -->
  <span
    v-if="marca === 'nuevo'"
    class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-background"
  >
    <span aria-hidden="true" class="block h-1.5 w-1.5 rounded-md bg-background" />
    Nuevo
    <span class="sr-only">— publicado hace menos de {{ DIAS_RECIENTE }} días</span>
  </span>

  <span
    v-else-if="marca === 'archivo'"
    class="inline-flex items-center rounded-md border border-border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
  >
    Archivo
  </span>
</template>
