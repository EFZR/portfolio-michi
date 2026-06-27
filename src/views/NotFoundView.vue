<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'
</script>

<template>
  <section class="grid min-h-[70vh] place-items-center p-8">
    <div class="max-w-xl space-y-6 text-center">
      <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">404</p>
      <h1 class="text-5xl font-semibold">Página no encontrada</h1>
      <p class="text-muted-foreground">El recurso que buscas no existe o fue movido.</p>
      <BaseButton to="/" variant="primary">Volver al inicio</BaseButton>
    </div>
  </section>
</template>
