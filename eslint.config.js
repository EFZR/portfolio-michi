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
    ignores: ['**/dist/**', '**/node_modules/**'],
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
    },
  },
)
