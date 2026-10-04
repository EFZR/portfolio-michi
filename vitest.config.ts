import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['firebase/**/*.test.ts', 'packages/**/*.test.ts', 'apps/*/*.test.ts'],
    // El emulador arranca lento la primera vez; el defecto de 5 s se queda corto.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Los tests comparten el emulador y limpian Firestore entre cada uno:
    // en paralelo se pisarían la semilla.
    fileParallelism: false,
  },
})
