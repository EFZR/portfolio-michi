<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { getFirestoreDb } from '@princess/content'
import { useCollection, type Fila } from '@/composables/useCollection'

/**
 * PANTALLA 9 — BANDEJA.
 *
 * Solo lectura, marcar leído y borrar. No hay respuesta desde aquí a propósito:
 * responder desde el panel significaría montar envío de correo (un servicio
 * más, otra credencial, otra cosa que se cae), y el cliente de correo del
 * sistema ya hace ese trabajo. El botón abre un `mailto:` con el asunto puesto.
 */

const mensajes = useCollection('messages', 'receivedAt')
const abierto = ref<string | null>(null)
const porBorrar = ref('')
const aviso = ref('')

/** Los más nuevos primero: `orderBy` los trae al revés de como se leen. */
const ordenados = computed(() => [...mensajes.filas.value].reverse())
const sinLeer = computed(() => ordenados.value.filter((m) => !m.read).length)

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * `receivedAt` es un Timestamp de Firestore, no un Date. Llega como objeto con
 * `toDate()`; si el documento se acaba de crear y el servidor aún no resolvió
 * `serverTimestamp()`, llega `null` — de ahí el respaldo.
 */
function fecha(v: unknown): string {
  const ts = v as { toDate?: () => Date } | null
  const d = ts?.toDate?.()
  if (!d) return 'ahora mismo'
  return d.toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function abrir(m: Fila) {
  abierto.value = abierto.value === m.id ? null : String(m.id)
  // Se marca leído al abrirlo, no con un botón aparte: si lo has leído, está leído.
  if (!m.read && abierto.value === m.id) {
    await updateDoc(doc(getFirestoreDb(import.meta.env), 'messages', String(m.id)), { read: true })
    await mensajes.cargar()
  }
}

async function borrar(m: Fila) {
  await mensajes.borrar(String(m.id))
  aviso.value = `Se borró el mensaje de ${m.name}.`
  porBorrar.value = ''
  abierto.value = null
}

function responder(m: Fila) {
  const asunto = encodeURIComponent(`Re: tu mensaje desde la web`)
  window.location.href = `mailto:${m.email}?subject=${asunto}`
}

onMounted(() => mensajes.cargar())
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <header class="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
      <div>
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-primary">Bandeja</p>
        <h2
          class="mt-3 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none tracking-tight"
        >
          {{ ordenados.length }}
          <span class="text-muted-foreground">
            {{ ordenados.length === 1 ? 'mensaje' : 'mensajes' }}
          </span>
        </h2>
      </div>

      <p v-if="sinLeer" class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary">
        {{ sinLeer }} sin leer
      </p>
    </header>

    <p
      v-if="mensajes.cargando.value"
      class="mt-10 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground"
    >
      Cargando…
    </p>
    <p v-else-if="mensajes.error.value" role="alert" class="mt-10 text-sm font-medium text-primary">
      {{ mensajes.error.value }}
    </p>

    <p
      v-else-if="!ordenados.length"
      class="mt-14 max-w-prose text-sm leading-relaxed text-muted-foreground"
    >
      Todavía no ha escrito nadie. Los mensajes del formulario de
      <span class="text-foreground">/contact</span> aparecen aquí.
    </p>

    <ul v-else class="mt-10 border-t border-border">
      <li v-for="(m, i) in ordenados" :key="String(m.id)" class="border-b border-border">
        <div class="group/m flex items-baseline gap-4 py-5">
          <span class="w-8 shrink-0 font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {{ pad(i + 1) }}
          </span>

          <!-- El punto UV marca lo no leído. Un punto, no una negrita: la
               negrita cambia el color del párrafo y descuadra el gris. -->
          <span
            aria-hidden="true"
            class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-md transition-colors duration-300"
            :class="m.read ? 'bg-transparent' : 'bg-primary'"
          />

          <button type="button" class="min-w-0 flex-1 text-left" @click="abrir(m)">
            <span class="flex flex-wrap items-baseline gap-x-3">
              <span
                class="font-heading text-lg font-semibold tracking-tight transition-colors duration-300 group-hover/m:text-primary"
              >
                {{ m.name }}
              </span>
              <span class="font-mono text-[0.65rem] text-muted-foreground">{{ m.email }}</span>
            </span>
            <span
              class="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
            >
              <span>{{ m.discipline }}</span>
              <span aria-hidden="true" class="text-border">·</span>
              <span class="normal-case tracking-normal">{{ fecha(m.receivedAt) }}</span>
            </span>
            <span v-if="abierto !== m.id" class="mt-2 block truncate text-sm text-muted-foreground">
              {{ m.message }}
            </span>
          </button>

          <span
            class="flex shrink-0 items-center gap-2 opacity-0 transition-opacity duration-200 group-hover/m:opacity-100 focus-within:opacity-100"
          >
            <button
              type="button"
              class="px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-200 hover:text-primary"
              @click="responder(m)"
            >
              Responder
            </button>
            <button
              type="button"
              class="px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] transition-colors duration-200"
              :class="
                porBorrar === m.id ? 'text-primary' : 'text-muted-foreground hover:text-primary'
              "
              @click="porBorrar === m.id ? borrar(m) : (porBorrar = String(m.id))"
              @blur="porBorrar = ''"
            >
              {{ porBorrar === m.id ? '¿Seguro?' : 'Borrar' }}
            </button>
          </span>
        </div>

        <!-- `whitespace-pre-line` conserva los saltos que escribió la persona:
             un mensaje de tres párrafos no debe llegar como un ladrillo. -->
        <p
          v-if="abierto === m.id"
          class="max-w-prose whitespace-pre-line pb-8 ps-16 text-base leading-relaxed"
        >
          {{ m.message }}
        </p>
      </li>
    </ul>

    <p
      v-if="aviso"
      role="status"
      class="mt-8 border-l-2 border-primary py-2 ps-4 text-sm text-muted-foreground"
    >
      {{ aviso }}
    </p>
  </div>
</template>
