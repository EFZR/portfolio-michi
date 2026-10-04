<script setup lang="ts">
import type { Seccion } from '@/components/shell/RailNav.vue'

defineProps<{
  secciones: readonly Seccion[]
  /** Cifras de la edición actual, para la columna de la derecha. */
  estado: readonly { etiqueta: string; valor: string }[]
}>()
const emit = defineEmits<{ ir: [id: string] }>()

const pad = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <!--
    SUMARIO — la página de contenidos de la revista.
    Rejilla asimétrica 7/4 con una calle vacía en medio: el desequilibrio es
    deliberado, una retícula simétrica se lee como una tabla y no como una
    portadilla.
  -->
  <div class="mx-auto grid max-w-6xl gap-x-12 gap-y-14 lg:grid-cols-12">
    <section class="lg:col-span-7">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-primary">Sumario</p>
      <h2
        class="mt-4 font-heading text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[0.95] tracking-tight"
      >
        Todo lo que se<br />
        <span class="italic text-primary">edita</span> desde aquí
      </h2>

      <ul class="mt-12 border-t border-border">
        <li v-for="(seccion, i) in secciones.filter((s) => s.id !== 'sumario')" :key="seccion.id">
          <button
            type="button"
            :disabled="!seccion.listo"
            class="group/item grid w-full grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b border-border py-6 text-left transition-colors duration-300 enabled:hover:text-primary disabled:opacity-40"
            @click="emit('ir', seccion.id)"
          >
            <span class="font-mono text-xs tracking-[0.2em] text-muted-foreground">
              {{ pad(i + 1) }}
            </span>

            <span>
              <span class="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {{ seccion.label }}
              </span>
              <!--
                La regla que se dibuja al hover. Es la microinteracción central
                del sumario: un filete UV que crece de izquierda a derecha, como
                si alguien subrayara la entrada con una regla.
              -->
              <span
                aria-hidden="true"
                class="mt-2 block h-px w-full origin-left scale-x-0 bg-primary transition-transform duration-500 ease-out group-enabled/item:group-hover/item:scale-x-100"
              />
            </span>

            <span
              class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-transform duration-300 group-enabled/item:group-hover/item:translate-x-1"
            >
              {{ seccion.listo ? 'Abrir →' : 'Pronto' }}
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Columna lateral: el "estado de la edición", en clave de ficha técnica. -->
    <aside class="lg:col-span-4 lg:col-start-9">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground">
        Estado de la edición
      </p>
      <dl class="mt-6 border-t border-border">
        <div
          v-for="dato in estado"
          :key="dato.etiqueta"
          class="flex items-baseline justify-between gap-4 border-b border-border py-4"
        >
          <dt class="text-sm text-muted-foreground">{{ dato.etiqueta }}</dt>
          <dd class="font-mono text-sm tabular-nums">{{ dato.valor }}</dd>
        </div>
      </dl>

      <p class="mt-8 text-sm leading-relaxed text-muted-foreground">
        Lo que se guarda aquí llega a la web en el siguiente despliegue. Nada se publica solo.
      </p>
    </aside>
  </div>
</template>
