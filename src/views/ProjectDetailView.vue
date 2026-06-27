<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

/**
 * `route.params.slug` está tipado como `string | string[]` porque una ruta
 * puede tener params repetibles. Para rutas con un único param dinámico,
 * lo normalizamos a string. En Fase 2 lo usaremos para consultar Firestore.
 */
const slug = String(route.params.slug)
</script>

<template>
  <section class="min-h-screen grid place-items-center bg-neutral-950 p-8 text-neutral-50">
    <div class="max-w-xl space-y-4 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-pink-400">Project</p>
      <h1 class="text-4xl font-bold">{{ slug }}</h1>
      <p class="text-neutral-400">Detalle del proyecto. Contenido real en Fase 2 (Firestore).</p>
    </div>
  </section>
</template>
