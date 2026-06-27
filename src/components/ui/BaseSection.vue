<script setup lang="ts">
import BaseContainer from './BaseContainer.vue'

type SectionSize = 'narrow' | 'default' | 'wide'

interface Props {
  /** id semántico para anclas — la navbar enlaza a /#about, /#projects, etc. */
  id?: string
  /** kicker pequeño en mayúsculas sobre el título — sello editorial */
  eyebrow?: string
  /** H2 de la sección (solo el Hero usa H1) */
  title?: string
  /** se pasa al BaseContainer interno */
  size?: SectionSize
}

const { id, eyebrow, title, size = 'default' } = defineProps<Props>()
</script>

<template>
  <section :id="id" class="py-20 sm:py-28">
    <BaseContainer :size="size">
      <header v-if="eyebrow || title || $slots.header" class="mb-12 space-y-3 sm:mb-16">
        <slot name="header">
          <p v-if="eyebrow" class="text-xs font-medium uppercase tracking-[0.3em] text-primary">
            {{ eyebrow }}
          </p>
          <h2 v-if="title" class="text-4xl font-semibold sm:text-5xl">
            {{ title }}
          </h2>
        </slot>
      </header>

      <slot />
    </BaseContainer>
  </section>
</template>
