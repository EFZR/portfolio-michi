import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],

  /**
   * Las credenciales viven en un ÚNICO `.env` en la raíz del monorepo, no uno
   * por app: son las mismas para la web y para el panel, y duplicarlas es
   * garantizar que un día se cambien en uno y no en el otro.
   *
   * Por defecto Vite busca `.env` junto a este archivo (`apps/web/`), así que
   * hay que apuntarlo dos niveles arriba. Siguen haciendo falta el prefijo
   * `VITE_` para que lleguen al código del navegador.
   */
  envDir: fileURLToPath(new URL('../../', import.meta.url)),

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    allowedHosts: ['.ts.net'],
  },
})
