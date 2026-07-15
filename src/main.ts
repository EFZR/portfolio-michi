import { createApp } from 'vue'
import App from './App.vue'
import router from '@/router'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import '@/assets/styles/main.css'

// Componentes globales: registrados aquí quedan disponibles en cualquier
// template sin necesidad de import. El tipado está declarado en
// `src/types/globalComponents.ts` para preservar autocompletado en <script setup>.
createApp(App).use(router).component('BaseCtaButton', BaseCtaButton).mount('#app')
