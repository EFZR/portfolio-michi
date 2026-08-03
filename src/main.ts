import { createApp } from 'vue'
import App from './App.vue'
import router from '@/router'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import '@/assets/styles/main.css'

// Desactivamos la restauración nativa de scroll del navegador ANTES de montar.
// Por defecto ('auto') el navegador reabre en la posición previa al recargar
// (disparándose en el evento `load`, después de onMounted, ganándole a cualquier
// scrollTo nuestro). En 'manual' cada recarga arranca en el tope y el control del
// scroll queda 100% en el router (scrollBehavior) — back/forward incluidos.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

// Componentes globales: registrados aquí quedan disponibles en cualquier
// template sin necesidad de import. El tipado está declarado en
// `src/types/globalComponents.ts` para preservar autocompletado en <script setup>.
createApp(App).use(router).component('BaseCtaButton', BaseCtaButton).mount('#app')
