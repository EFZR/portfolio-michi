<script setup lang="ts">
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-950 text-neutral-50">
    <AppNavbar />
    <main class="flex-1 pt-16">
      <!-- pt-16 = h-16 de la navbar fija, para que el contenido no quede tapado -->
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
