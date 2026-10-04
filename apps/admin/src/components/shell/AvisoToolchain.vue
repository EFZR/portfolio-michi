<script setup lang="ts">
import { ref } from 'vue'
import { useToolchain } from '@/composables/useToolchain'

/**
 * R1 en pantalla. Banda a todo el ancho bajo la mancheta, no un diálogo: esto
 * es una condición del equipo, no una pregunta, y un modal al arrancar se
 * cierra sin leer.
 *
 * Calla cuando no hay nada que hacer. En `sin-nativo` (el frontend suelto en
 * `vite dev`) también calla: ahí la ausencia de ffmpeg es esperada y avisar
 * sería ruido en cada recarga.
 *
 * La paleta del proyecto es 60/30/10 + Ultraviolet y no tiene color de error.
 * El nivel fatal usa la banda INVERTIDA en off-black, que es la señal más
 * fuerte disponible sin meter un rojo que rompa el sistema.
 */

const { estado, informe, mensaje, importantes, menores, firma, sondear } = useToolchain()

const verMenores = ref(false)
</script>

<template>
  <!-- Falta ffmpeg, o falta `scale`: no se puede procesar ningún medio. -->
  <div
    v-if="importantes.some((g) => g.severity === 'fatal')"
    class="border-b border-foreground bg-foreground px-8 py-4 text-background"
  >
    <div class="flex items-start justify-between gap-6">
      <div class="min-w-0">
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-background/60">
          Subida de medios desactivada
        </p>
        <p
          v-for="g in importantes.filter((x) => x.severity === 'fatal')"
          :key="g.id"
          class="mt-2 max-w-prose text-sm leading-relaxed"
        >
          {{ g.message }}
        </p>
        <!--
          La instrucción la manda Rust con `cfg!`, no la adivina esta plantilla:
          un panel compilado para Windows no puede sugerir `pacman`.
        -->
        <p
          v-if="informe?.installHint"
          class="mt-3 max-w-prose font-mono text-[0.65rem] leading-relaxed tracking-[0.15em] text-background/50"
        >
          {{ informe.installHint }}
        </p>
      </div>
      <button
        type="button"
        :disabled="estado === 'sondeando'"
        class="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-background underline decoration-background/40 underline-offset-4 transition-colors duration-200 hover:decoration-background disabled:opacity-50"
        @click="sondear()"
      >
        {{ estado === 'sondeando' ? 'Comprobando…' : 'Volver a comprobar' }}
      </button>
    </div>
  </div>

  <!--
    ffmpeg está, pero algún formato de salida no se va a poder generar. Se
    puede trabajar; conviene saberlo.
  -->
  <div
    v-else-if="importantes.length"
    class="border-b border-primary bg-primary-soft/40 px-8 py-4"
  >
    <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary">
      ffmpeg incompleto · {{ importantes.length }}
      {{ importantes.length === 1 ? 'formato afectado' : 'formatos afectados' }}
    </p>
    <ul class="mt-2 space-y-1">
      <li
        v-for="g in importantes"
        :key="g.id"
        class="max-w-prose text-sm leading-relaxed text-foreground"
      >
        {{ g.message }}
      </li>
    </ul>
  </div>

  <!-- El sondeo mismo falló. No tumba el panel: el resto no necesita ffmpeg. -->
  <div v-else-if="estado === 'error'" class="border-b border-border bg-surface px-8 py-3">
    <p class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
      {{ mensaje }}
    </p>
  </div>

  <!--
    Todo correcto salvo detalles que solo empeoran el resultado. Plegado: una
    banda permanente por «podría faltar el mapeo de tonos HDR» se vuelve
    invisible a los dos días y entonces tampoco se lee la importante.
  -->
  <div
    v-else-if="menores.length && informe"
    class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-8 py-2"
  >
    <button
      type="button"
      class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-200 hover:text-primary"
      :aria-expanded="verMenores"
      @click="verMenores = !verMenores"
    >
      {{ verMenores ? '−' : '+' }} {{ menores.length }}
      {{ menores.length === 1 ? 'advertencia' : 'advertencias' }} de ffmpeg
    </button>
    <span class="font-mono text-[0.65rem] tracking-[0.15em] text-border">{{ firma }}</span>
    <ul v-if="verMenores" class="w-full space-y-1 pb-2">
      <li
        v-for="g in menores"
        :key="g.id"
        class="max-w-prose text-sm leading-relaxed text-muted-foreground"
      >
        {{ g.message }}
      </li>
    </ul>
  </div>
</template>
