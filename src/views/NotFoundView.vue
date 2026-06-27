<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="min-h-screen grid place-items-center bg-neutral-950 p-8 text-neutral-50">
    <div class="max-w-xl space-y-6 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-pink-400">404</p>
      <h1 class="text-5xl font-bold">Página no encontrada</h1>
      <p class="text-neutral-400">El recurso que buscas no existe o fue movido.</p>
      <RouterLink
        to="/"
        class="inline-block underline-offset-4 underline transition-colors hover:text-pink-400"
      >
        Volver al inicio
      </RouterLink>
    </div>
  </section>
</template>
