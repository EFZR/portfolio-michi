<script setup lang="ts">
import HeroSection from '@/components/sections/HeroSection.vue'
</script>

<template>
  <!--
    -mt-24 absorbe el pt-24 del <main> en MainLayout: el Hero ocupa
    el viewport completo bajo la navbar fija, sin un gap blanco arriba.
    Las próximas secciones (1.8) sí respetarán el padding natural.
  -->
  <div class="-mt-24">
    <HeroSection />
  </div>
</template>
