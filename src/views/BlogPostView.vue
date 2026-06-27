<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const slug = String(route.params.slug)
</script>

<template>
  <article class="min-h-screen grid place-items-center bg-neutral-950 p-8 text-neutral-50">
    <div class="max-w-xl space-y-4 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-pink-400">Post</p>
      <h1 class="text-4xl font-bold">{{ slug }}</h1>
      <p class="text-neutral-400">Contenido del artículo.</p>
    </div>
  </article>
</template>
