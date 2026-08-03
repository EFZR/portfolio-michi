<script setup lang="ts">
import { onMounted } from 'vue'
import HeroSection from '@/components/sections/HeroSection.vue'
import AboutSection from '@/components/sections/AboutSection.vue'

// Al recargar la página (o entrar directo) sin hash, forzamos el arranque en el
// Hero. Evita que el navegador/ScrollTrigger restaure una posición previa y abra
// a media página. No tocamos back/forward (savedPosition del router) ni deep
// links tipo /#about, que sí deben scrollear a su ancla.
onMounted(() => {
  const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  const isFreshLoad = !nav || nav.type === 'reload' || nav.type === 'navigate'
  if (isFreshLoad && !window.location.hash) window.scrollTo(0, 0)
})
</script>

<template>
  <!--
    -mt-24 absorbe el pt-24 del <main> en MainLayout: el Hero ocupa
    el viewport completo bajo la navbar fija, sin un gap blanco arriba.
  -->
  <div class="-mt-24">
    <!--
      El Hero queda en `sticky top-0`: se ancla al viewport mientras la
      siguiente sección (AboutSection, fondo opaco con z superior) SUBE por
      encima al scrollear — efecto "hoja que se posa sobre el Hero".
      z-0 lo mantiene por debajo del panel #about (z-10).
    -->
    <div class="sticky top-0 z-0">
      <HeroSection />
    </div>

    <AboutSection />
  </div>
</template>
