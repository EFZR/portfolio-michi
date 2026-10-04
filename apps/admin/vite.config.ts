import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],

  // Mismas credenciales que la web: un único .env en la raíz del monorepo.
  envDir: fileURLToPath(new URL('../../', import.meta.url)),

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /**
       * El panel REUTILIZA los componentes de la web (BaseField, BaseCtaButton,
       * BaseModal…) en vez de reimplementarlos. Mismo Vue, mismo Tailwind v4,
       * mismos tokens: la vista previa del panel no se parece a la web, ES la web.
       */
      '@web': fileURLToPath(new URL('../web/src', import.meta.url)),
    },
  },

  /**
   * Tauri arranca el binario apuntando a un puerto FIJO: si Vite decide saltar
   * al 1421 porque el 1420 está ocupado, la ventana abre en blanco sin decir
   * por qué. `strictPort` convierte eso en un error explícito al arrancar.
   */
  server: { port: 1420, strictPort: true },

  // El webview no tiene devtools abiertas por defecto; sin sourcemap, un error
  // en producción es una línea de un bundle minificado.
  build: { sourcemap: true },
})
