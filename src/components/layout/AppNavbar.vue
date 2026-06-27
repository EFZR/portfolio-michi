<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useDisclosure } from '@/composables/useDisclosure'

interface NavItem {
  label: string
  to: string
}

const items: NavItem[] = [
  { label: 'Sobre mí', to: '/#about' },
  { label: 'Skills', to: '/#skills' },
  { label: 'Experiencia', to: '/#experience' },
  { label: 'Proyectos', to: '/#projects' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contacto', to: '/#contact' },
]

const { isOpen, toggle, close } = useDisclosure()
const route = useRoute()

// Cerramos el menú móvil cada vez que cambia la ruta.
watch(() => route.fullPath, close)
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur"
  >
    <nav
      aria-label="Principal"
      class="mx-auto flex h-16 max-w-5xl items-center justify-between px-6"
    >
      <RouterLink
        to="/"
        class="font-heading text-base font-semibold tracking-tight transition-colors hover:text-primary"
      >
        Princess<span class="text-primary">.</span>
      </RouterLink>

      <!-- Desktop nav -->
      <ul class="hidden items-center gap-7 md:flex">
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="text-sm text-muted-foreground transition-colors hover:text-primary"
            active-class="text-primary"
          >
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>

      <!-- Mobile toggle -->
      <button
        type="button"
        class="grid h-10 w-10 place-items-center text-foreground md:hidden"
        :aria-expanded="isOpen"
        aria-controls="mobile-menu"
        :aria-label="isOpen ? 'Cerrar menú' : 'Abrir menú'"
        @click="toggle"
      >
        <span class="sr-only">Menú</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-6 w-6"
          aria-hidden="true"
        >
          <template v-if="isOpen">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </template>
          <template v-else>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </template>
        </svg>
      </button>
    </nav>

    <!-- Mobile menu -->
    <div
      v-show="isOpen"
      id="mobile-menu"
      class="border-t border-border/70 bg-background/95 md:hidden"
    >
      <ul class="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-4">
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="block rounded-md px-3 py-2 text-base text-foreground transition-colors hover:bg-surface hover:text-primary"
            active-class="text-primary"
          >
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </div>
  </header>
</template>
