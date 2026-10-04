<script setup lang="ts">
import { computed } from 'vue'
import RailNav, { type Seccion } from './RailNav.vue'

const props = defineProps<{
  secciones: readonly Seccion[]
  activa: string
  email: string
  folio?: string
}>()
const emit = defineEmits<{ ir: [id: string]; salir: [] }>()

const titulo = computed(() => props.secciones.find((s) => s.id === props.activa)?.label ?? '')
const indice = computed(() => props.secciones.findIndex((s) => s.id === props.activa) + 1)
const pad = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <div class="flex min-h-screen flex-col bg-background text-foreground">
    <!--
      MANCHETA A TODO EL ANCHO, por encima del raíl.
      La primera versión la puso dentro de la columna derecha y el raíl
      desplegado le tapaba el título. Sacarla fuera lo arregla y además es lo
      correcto tipográficamente: en una revista la cabecera cruza la página
      entera, no empieza después del margen.
    -->
    <!--
      Pegada arriba: el raíl también lo está, y si la cabecera se fuera con el
      scroll quedaría una banda vacía sobre él. Además así siempre se ve en qué
      sección se está.
    -->
    <header class="sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-border bg-background">
      <!-- La marca ocupa exactamente el ancho del raíl: la retícula empieza aquí. -->
      <span
        class="grid w-16 shrink-0 place-items-center border-r border-border self-stretch font-heading text-xl font-semibold leading-none"
        >m<span class="text-primary">.</span></span
      >

      <div class="flex min-w-0 flex-1 items-center gap-6 px-8">
        <span class="shrink-0 font-mono text-[0.65rem] tracking-[0.3em] text-muted-foreground">
          {{ pad(indice) }}<span class="mx-1 text-border">/</span>{{ pad(secciones.length) }}
        </span>
        <span aria-hidden="true" class="h-4 w-px shrink-0 bg-border" />
        <h1 class="truncate font-heading text-lg font-semibold tracking-tight">{{ titulo }}</h1>

        <div class="ms-auto flex shrink-0 items-center gap-6">
          <span
            v-if="folio"
            class="hidden font-mono text-[0.65rem] tracking-[0.25em] text-muted-foreground lg:inline"
          >
            {{ folio }}
          </span>
          <span class="hidden font-mono text-[0.65rem] text-muted-foreground sm:inline">
            {{ email }}
          </span>
          <button
            type="button"
            class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
            @click="emit('salir')"
          >
            Salir
          </button>
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <RailNav :secciones="secciones" :activa="activa" @ir="emit('ir', $event)" />

      <div class="flex min-w-0 flex-1 flex-col">
        <slot name="aviso" />
        <!-- Los márgenes anchos son el 60% de la regla: el aire ES el diseño. -->
        <main class="min-w-0 flex-1 px-8 pb-28 pt-10 lg:px-12 lg:pb-32 lg:pt-14">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
