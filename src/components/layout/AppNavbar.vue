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

// Cerramos el menú móvil cada vez que cambia la ruta:
// si el usuario hace tap en "Blog" desde el menú, queremos que se cierre solo.
watch(() => route.fullPath, close)
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-50 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur"
  >
    <nav
      aria-label="Principal"
      class="mx-auto flex h-16 max-w-5xl items-center justify-between px-6"
    >
      <RouterLink
        to="/"
        class="text-sm font-bold uppercase tracking-[0.25em] text-neutral-50 hover:text-pink-400"
      >
        Princess<span class="text-pink-400">.</span>
      </RouterLink>

      <!-- Desktop nav -->
      <ul class="hidden items-center gap-7 md:flex">
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="text-sm text-neutral-300 transition-colors hover:text-pink-400"
            active-class="text-pink-400"
          >
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>

      <!-- Mobile toggle -->
      <button
        type="button"
        class="grid h-10 w-10 place-items-center text-neutral-200 md:hidden"
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
      class="border-t border-neutral-800/60 bg-neutral-950/95 md:hidden"
    >
      <ul class="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-4">
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="block rounded-md px-3 py-2 text-base text-neutral-200 hover:bg-neutral-900 hover:text-pink-400"
            active-class="text-pink-400"
          >
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </div>
  </header>
</template>
