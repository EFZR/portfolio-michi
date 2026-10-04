<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '@/composables/useSession'

/**
 * PORTADA — la entrada.
 *
 * Correo y contraseña, no `signInWithPopup`: el webview de Tauri sirve desde un
 * esquema propio (`tauri://localhost`) que no es un origen válido para el flujo
 * OAuth de Firebase, así que el popup nunca vuelve. Para una administradora
 * única, la restricción y el requisito coinciden.
 */
const { error, entrar } = useSession()

const correo = ref('')
const clave = ref('')
const enviando = ref(false)

async function alEnviar() {
  if (enviando.value) return
  enviando.value = true
  await entrar(correo.value, clave.value)
  // No se limpia el correo al fallar: quien se equivocó de contraseña no tiene
  // por qué volver a escribirlo. La clave sí, que es lo que se reintenta.
  clave.value = ''
  enviando.value = false
}

const CONTROL =
  'w-full border-0 border-b border-border bg-transparent px-0 py-3 text-lg text-foreground ' +
  'transition-colors duration-300 placeholder:text-muted-foreground/50 ' +
  'focus:border-primary focus:outline-none aria-[invalid=true]:border-primary'
</script>

<template>
  <!--
    Portada a doble página: filete vertical al centro, marca a la izquierda,
    formulario a la derecha. En pantallas estrechas se apila y la mitad
    izquierda se reduce a su línea de crédito.
  -->
  <div class="grid min-h-screen lg:grid-cols-2">
    <section
      class="relative flex flex-col justify-between border-b border-border p-10 lg:border-b-0 lg:border-r lg:p-14 xl:px-20"
    >
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground">
        Panel de redacción
      </p>

      <h1
        class="my-12 font-heading text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-[0.9] tracking-tight"
      >
        my<br />Princess<span class="text-primary">.</span>
      </h1>

      <p class="max-w-xs text-sm leading-relaxed text-muted-foreground">
        Desde aquí se edita todo lo que se lee en la web. Nada se publica solo: los cambios salen en
        el siguiente despliegue.
      </p>
    </section>

    <section class="flex items-center justify-center p-10 lg:p-14">
      <form class="w-full max-w-sm" novalidate @submit.prevent="alEnviar">
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-primary">Entrar</p>

        <div class="mt-10 space-y-8">
          <label class="block">
            <span
              class="block font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
              >Correo</span
            >
            <input
              v-model="correo"
              type="email"
              autocomplete="username"
              autofocus
              placeholder="tu@correo.com"
              :aria-invalid="!!error"
              :class="CONTROL"
            />
          </label>

          <label class="block">
            <span
              class="block font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
              >Contraseña</span
            >
            <input
              v-model="clave"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              :aria-invalid="!!error"
              :class="CONTROL"
            />
          </label>
        </div>

        <!--
          `role="alert"` lo anuncia en cuanto aparece, sin esperar a que el foco
          llegue al campo. En esta paleta no hay rojo: el error se marca con el
          Ultraviolet, que es el color reservado a "mírame".
        -->
        <p v-if="error" role="alert" class="mt-6 text-sm font-medium text-primary">{{ error }}</p>

        <button
          type="submit"
          :disabled="enviando"
          class="group mt-10 flex w-full items-center justify-between border-b border-foreground py-3 font-mono text-[0.7rem] uppercase tracking-[0.3em] transition-colors duration-300 hover:border-primary hover:text-primary disabled:opacity-40"
        >
          {{ enviando ? 'Entrando…' : 'Entrar' }}
          <span
            aria-hidden="true"
            class="transition-transform duration-300 group-hover:translate-x-1"
            >→</span
          >
        </button>
      </form>
    </section>
  </div>
</template>
