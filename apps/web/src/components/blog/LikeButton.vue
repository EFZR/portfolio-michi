<script setup lang="ts">
import { ref } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { useLikes } from '@/composables/useLikes'

interface Props {
  id: string
  /** Likes de partida del artículo. */
  base: number
  /** `sm` para las tarjetas, `lg` para la ficha del artículo. */
  tamano?: 'sm' | 'lg'
}

const { id, base, tamano = 'sm' } = defineProps<Props>()

const { gusta, alternar, total } = useLikes()
const reducedMotion = usePreferredReducedMotion()

/** Dura lo que el latido; se limpia solo. */
const latiendo = ref(false)

function alPulsar(evento: MouseEvent) {
  // El botón vive DENTRO de tarjetas que son enlaces. Sin esto, dar like
  // navegaría al artículo — el gesto más frustrante posible.
  evento.stopPropagation()
  evento.preventDefault()

  const activando = !gusta(id)
  alternar(id)

  if (activando && reducedMotion.value !== 'reduce') {
    latiendo.value = true
    window.setTimeout(() => (latiendo.value = false), 420)
  }
}
</script>

<template>
  <button
    type="button"
    data-cursor="grow"
    :aria-pressed="gusta(id)"
    :aria-label="gusta(id) ? 'Quitar me gusta' : 'Dar me gusta'"
    :class="[
      'group/like inline-flex shrink-0 items-center gap-2 rounded-md border transition-[color,border-color,box-shadow] duration-300',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      tamano === 'lg' ? 'px-4 py-2.5 text-sm' : 'px-2.5 py-1.5 text-xs',
      gusta(id)
        ? 'border-primary/40 text-primary shadow-[0_0_14px_-4px] shadow-primary/50'
        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary',
    ]"
    @click="alPulsar"
  >
    <!--
      El corazón se RELLENA al activarse (fill currentColor) en vez de cambiar
      de icono: así la transición de color recorre el trazo y el relleno a la
      vez, y no hay un salto de un svg a otro.
    -->
    <svg
      :class="[
        'transition-transform duration-300 ease-out',
        tamano === 'lg' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5',
        latiendo ? 'scale-[1.35]' : 'scale-100',
        gusta(id) ? '' : 'group-hover/like:scale-110',
      ]"
      viewBox="0 0 24 24"
      :fill="gusta(id) ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M12 20.5s-7.5-4.6-7.5-9.7A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.8c0 5.1-7.5 9.7-7.5 9.7Z"
      />
    </svg>

    <!--
      `tabular-nums` fija el ancho de los dígitos: sin esto, pasar de 128 a 129
      cambia el ancho del número y el botón entero da un salto lateral.
    -->
    <span class="font-mono tabular-nums">{{ total(id, base) }}</span>
  </button>
</template>
