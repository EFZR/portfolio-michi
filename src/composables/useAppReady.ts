import { readonly, ref } from 'vue'

/**
 * Señal global "la web ya descargó sus recursos críticos".
 *
 * Singleton a nivel de módulo: el estado es único para toda la app. El
 * `AppPreloader` lo marca listo cuando fuentes + retrato del Hero terminan de
 * cargar; las secciones que animan al montar (ej. `HeroSection`) esperan esta
 * señal para no arrancar mientras el overlay de carga aún cubre la pantalla ni
 * competir con la decodificación de assets (que provocaba tirones en hard-reload).
 *
 * `isReady` se devuelve `readonly`: la única forma de mutarlo es `markReady()`.
 */
const isReady = ref(false)

export function useAppReady() {
  return {
    isReady: readonly(isReady),
    markReady: () => {
      isReady.value = true
    },
  }
}
