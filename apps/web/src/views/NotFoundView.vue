<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'
import { UI } from '@/data/ui'
</script>

<template>
  <section class="grid min-h-[70vh] place-items-center p-8">
    <div class="max-w-xl space-y-6 text-center">
      <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">{{ UI.notFound.kicker }}</p>
      <h1 class="text-5xl font-semibold">{{ UI.notFound.title }}</h1>
      <p class="text-muted-foreground">{{ UI.notFound.copy }}</p>
      <BaseButton to="/" variant="primary">{{ UI.notFound.cta }}</BaseButton>
    </div>
  </section>
</template>
