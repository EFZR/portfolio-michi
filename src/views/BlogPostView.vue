<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const slug = String(route.params.slug)
</script>

<template>
  <article class="grid min-h-[70vh] place-items-center p-8">
    <div class="max-w-xl space-y-4 text-center">
      <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">Post</p>
      <h1 class="text-4xl font-semibold">{{ slug }}</h1>
      <p class="text-muted-foreground">Contenido del artículo.</p>
    </div>
  </article>
</template>
