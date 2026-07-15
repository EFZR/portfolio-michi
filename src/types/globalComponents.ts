// Registro de componentes globales en el sistema de tipos de Vue.
// Extiende `GlobalComponents` para que TypeScript reconozca los componentes
// registrados vía `app.component()` sin necesidad de importarlos en cada .vue
// que los use — con autocompletado y validación de props.

import type BaseCtaButton from '@/components/ui/BaseCtaButton.vue'

declare module 'vue' {
  interface GlobalComponents {
    BaseCtaButton: typeof BaseCtaButton
  }
}

export {}
