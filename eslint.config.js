import pluginVue from 'eslint-plugin-vue'
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    // `target/` y `gen/` los genera Rust/Tauri al compilar: hay JS generado
    // dentro que no es nuestro y que dispara reglas de estilo sin sentido.
    ignores: ['**/dist/**', '**/node_modules/**', '**/src-tauri/target/**', '**/src-tauri/gen/**'],
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  skipFormatting,
  {
    name: 'app/custom-rules',
    rules: {
      // Forzamos disciplina TS estricta
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Permite componentes single-word como App.vue, Default.vue (layouts)
      'vue/multi-word-component-names': 'off',
      // Con TS + defineProps<Props>() la opcionalidad ya está en el tipo
      // (id?: string), no necesitamos default explícito para props opcionales.
      'vue/require-default-prop': 'off',
    },
  },
)
