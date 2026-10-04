<script setup lang="ts">
import { computed } from 'vue'
import { hasFirebaseConfig } from '@princess/content'
import { useSession } from '@/composables/useSession'
import LoginView from '@/views/LoginView.vue'
import PanelView from '@/views/PanelView.vue'

/**
 * Sin credenciales no hay nada que hacer: se detecta ANTES de tocar Firebase,
 * porque si no el primer intento de login falla con un error de red genérico
 * que no dice que lo que falta es un archivo `.env`.
 */
const configurado = computed(() => hasFirebaseConfig(import.meta.env))

// `useSession()` engancha el observador de Firebase en su primera llamada, así
// que solo se invoca cuando hay credenciales — si no, reventaría al importar.
const sesion = computed(() => (configurado.value ? useSession() : null))
</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
    <!-- 1. Sin .env -->
    <div v-if="!configurado" class="grid min-h-screen place-items-center p-8">
      <div class="max-w-lg space-y-4">
        <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">Sin configurar</p>
        <h1 class="font-heading text-4xl font-semibold tracking-tight">Faltan las credenciales</h1>
        <p class="leading-relaxed text-muted-foreground">
          Copia <code class="font-mono text-foreground">.env.example</code> a
          <code class="font-mono text-foreground">.env</code> en la raíz del repo y rellena las
          variables <code class="font-mono text-foreground">VITE_FIREBASE_*</code> desde la consola
          de Firebase (Configuración del proyecto → Tus apps → Web).
        </p>
      </div>
    </div>

    <!--
      2. Restaurando la sesión guardada. Este estado existe para que el panel no
      parpadee al login en cada arranque: Firebase resuelve la sesión de forma
      asíncrona y, durante ese instante, "sin usuario" y "no ha entrado" son
      indistinguibles.
    -->
    <div v-else-if="sesion?.cargando.value" class="grid min-h-screen place-items-center p-8">
      <p class="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Abriendo…</p>
    </div>

    <!-- 3. Dentro / 4. Fuera -->
    <PanelView v-else-if="sesion?.usuario.value" />
    <LoginView v-else />
  </main>
</template>
