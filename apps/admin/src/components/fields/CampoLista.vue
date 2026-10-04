<script setup lang="ts">
import { computed } from 'vue'
import CampoDinamico from './CampoDinamico.vue'
import { num, type FieldProps } from './tipos'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const lista = () => (Array.isArray(props.valor) ? [...props.valor] : [])
const minItems = computed(() => num(props.campo.constraints?.minItems) ?? 0)
const maxItems = computed(() => num(props.campo.constraints?.maxItems) ?? Infinity)
const ordenable = computed(() => props.campo.ui?.sortable === true)

/** Valor inicial de un ítem nuevo, según de qué es lista. */
function vacio(): unknown {
  const e = props.campo.element
  if (!e) return ''
  if (e.type === 'group') return {}
  if (e.type === 'integer') return undefined
  if (e.type === 'boolean') return false
  return e.localized ? { es: '', en: '' } : ''
}

function cambiar(ruta: string, v: unknown) {
  const i = Number(ruta.split('.').pop())
  const copia = lista()
  copia[i] = v
  emit('cambiar', copia)
}

function anadir() {
  emit('cambiar', [...lista(), vacio()])
}

function quitar(i: number) {
  const copia = lista()
  copia.splice(i, 1)
  emit('cambiar', copia)
}

function mover(i: number, delta: number) {
  const copia = lista()
  const destino = i + delta
  if (destino < 0 || destino >= copia.length) return
  ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
  emit('cambiar', copia)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-baseline justify-between gap-4">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        {{ campo.label }}
        <span class="ml-2 font-mono normal-case tracking-normal">
          {{ lista().length }}<template v-if="maxItems !== Infinity">/{{ maxItems }}</template>
        </span>
      </p>
      <button
        type="button"
        :disabled="lista().length >= maxItems"
        class="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] transition-colors duration-200 hover:border-primary hover:text-primary disabled:opacity-40"
        @click="anadir"
      >
        Añadir
      </button>
    </div>

    <p v-if="campo.help" class="text-sm leading-relaxed text-muted-foreground">{{ campo.help }}</p>
    <p v-if="error" role="alert" class="text-sm font-medium text-primary">{{ error }}</p>

    <div v-for="(_, i) in lista()" :key="i" class="border-s border-border ps-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <span class="font-mono text-xs tracking-[0.25em] text-muted-foreground">
          {{ String(i + 1).padStart(2, '0') }}
        </span>
        <div class="flex gap-1">
          <!--
            Reordenar con botones y no arrastrando: el arrastre en una lista
            anidada dentro de otra lista es difícil de acertar con el ratón y
            imposible con el teclado. Las flechas funcionan en los dos.
          -->
          <button
            v-if="ordenable"
            type="button"
            :disabled="i === 0"
            aria-label="Subir"
            class="rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:border-primary disabled:opacity-30"
            @click="mover(i, -1)"
          >
            ↑
          </button>
          <button
            v-if="ordenable"
            type="button"
            :disabled="i === lista().length - 1"
            aria-label="Bajar"
            class="rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:border-primary disabled:opacity-30"
            @click="mover(i, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            :disabled="lista().length <= minItems"
            aria-label="Quitar"
            class="rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:border-primary hover:text-primary disabled:opacity-30"
            @click="quitar(i)"
          >
            ✕
          </button>
        </div>
      </div>

      <CampoDinamico
        v-if="campo.element"
        :campo="campo.element"
        :valor="lista()[i]"
        :error="''"
        :ruta="`${ruta}.${i}`"
        @cambiar="cambiar"
        @salir="emit('salir')"
      />
    </div>
  </div>
</template>
