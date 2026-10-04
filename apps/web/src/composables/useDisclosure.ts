import { ref, readonly, type Ref } from 'vue'

export interface UseDisclosureReturn {
  isOpen: Readonly<Ref<boolean>>
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Patrón open/close reutilizable para menús móviles, modales, dropdowns.
 * Devuelve `isOpen` como Readonly<Ref> para que el caller solo pueda
 * mutar el estado a través de open/close/toggle — encapsulación limpia.
 */
export function useDisclosure(initial = false): UseDisclosureReturn {
  const isOpen = ref(initial)

  const open = () => {
    isOpen.value = true
  }
  const close = () => {
    isOpen.value = false
  }
  const toggle = () => {
    isOpen.value = !isOpen.value
  }

  return { isOpen: readonly(isOpen), open, close, toggle }
}
