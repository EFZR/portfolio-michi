<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-border text-muted-foreground">
    <div
      class="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm sm:flex-row"
    >
      <p>&copy; {{ year }} Princess Portfolio. Hecho con Vue.</p>
      <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
        Fase 1 · maquetación
      </p>
    </div>
  </footer>
</template>
