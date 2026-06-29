<script setup lang="ts">
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppCursor from '@/components/global/AppCursor.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- Cursor custom global — se monta una sola vez aquí para vivir en todas las rutas -->
    <AppCursor />

    <AppNavbar />
    <main class="flex-1 pt-16">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
