<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import { sendMessage, type ContactMessage } from '@/lib/contact'
import { CATEGORIES } from '@/data/projects'
import { UI } from '@/data/ui'

interface Props {
  /** Correo directo — se ofrece como salida si el envío falla. */
  email: string
}

const { email } = defineProps<Props>()

type Status = 'inactivo' | 'enviando' | 'enviado' | 'error'

const status = ref<Status>('inactivo')
const formRef = ref<HTMLFormElement | null>(null)

const data = reactive<ContactMessage>({
  name: '',
  email: '',
  discipline: '',
  message: '',
  'bot-field': '',
})

type Field = 'name' | 'email' | 'discipline' | 'message'

const errors = reactive<Record<Field, string>>({
  name: '',
  email: '',
  discipline: '',
  message: '',
})

/**
 * Las opciones salen de `CATEGORIES`, la misma fuente que el portafolio y los
 * servicios. Si un día aparece un cuarto oficio, el desplegable se entera solo
 * — y nunca puede quedar desincronizado con lo que la web dice que hace.
 */
const options = computed(() => [
  ...CATEGORIES.map((c) => ({ value: c.id, label: c.name })),
  { value: 'otra-cosa', label: UI.form.disciplineOther },
])

/**
 * Validación deliberadamente floja con el email: comprobar que hay algo, una
 * arroba y un punto después. Las expresiones regulares "completas" de email
 * rechazan direcciones válidas y no atrapan las inválidas de verdad (eso solo
 * lo sabe el servidor de correo). Aquí solo se atrapa el error de dedo.
 */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(): boolean {
  errors.name = data.name.trim() ? '' : UI.form.errorName
  errors.email = !data.email.trim()
    ? UI.form.errorEmailEmpty
    : EMAIL_FORMAT.test(data.email.trim())
      ? ''
      : UI.form.errorEmailFormat
  errors.discipline = data.discipline ? '' : UI.form.errorDiscipline
  errors.message = data.message.trim().length >= 10 ? '' : UI.form.errorMessage

  return !Object.values(errors).some(Boolean)
}

/**
 * Lleva el foco al primer campo con error. Sin esto, quien navega con teclado
 * (o con lector de pantalla) pulsa "Enviar", no pasa nada visible y se queda
 * sin saber qué falta ni dónde está.
 */
function focusFirstError() {
  const orden: Field[] = ['name', 'email', 'discipline', 'message']
  const failed = orden.find((campo) => errors[campo])
  if (!failed) return
  formRef.value?.querySelector<HTMLElement>(`[name="${failed}"]`)?.focus()
}

async function onSubmit() {
  if (status.value === 'enviando') return

  if (!validate()) {
    status.value = 'inactivo'
    focusFirstError()
    return
  }

  status.value = 'enviando'
  try {
    await sendMessage(data)
    status.value = 'enviado'
  } catch {
    // El detalle técnico no le sirve de nada a quien escribe; lo que necesita
    // es una salida, y esa es el correo directo del bloque de error.
    status.value = 'error'
  }
}

function reset() {
  data.name = ''
  data.email = ''
  data.discipline = ''
  data.message = ''
  status.value = 'inactivo'
}

/** Clases compartidas por input, select y textarea — un único control visual. */
const CONTROL =
  'w-full rounded-md border border-border bg-surface px-4 py-3 text-base text-foreground ' +
  'transition-colors duration-300 placeholder:text-muted-foreground/70 ' +
  'focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ' +
  'aria-[invalid=true]:border-primary'
</script>

<template>
  <!--
    Bloque de ÉXITO. Sustituye al formulario entero en vez de aparecer encima:
    quien ya escribió no tiene nada que hacer con los campos, y dejarlos ahí
    invita a mandar el mismo mensaje dos veces.
  -->
  <div
    v-if="status === 'enviado'"
    class="rounded-md border border-border bg-surface p-8 sm:p-10"
    role="status"
  >
    <p class="text-xs font-medium uppercase tracking-[0.3em] text-primary">Recibido</p>
    <h2 class="mt-4 font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
      Ya lo tengo
    </h2>
    <p class="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
      Te respondo en un par de días con mis dudas y una idea de tiempos. Si mientras tanto se te
      ocurre algo más, escríbeme directo a
      <a
        :href="`mailto:${email}`"
        data-cursor="grow"
        class="text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors duration-300 hover:text-primary"
        >{{ email }}</a
      >.
    </p>

    <div class="mt-8">
      <BaseCtaButton text="Escribir otro" variant="outline" @click="reset" />
    </div>
  </div>

  <!--
    `novalidate` apaga los globos nativos del navegador. No es por estética: su
    texto no se puede traducir ni maquetar, desaparecen solos y no los lee un
    lector de pantalla de forma fiable. La validación de arriba los sustituye
    con mensajes propios, persistentes y asociados al campo por ARIA.

    Los atributos de Netlify viven aquí además de en la copia oculta de
    `index.html` (ver `@/lib/contact`).
  -->
  <form
    v-else
    ref="formRef"
    method="post"
    novalidate
    class="space-y-8"
    @submit.prevent="onSubmit"
  >

    <!-- Trampa para bots: fuera de la vista Y fuera del recorrido del teclado. -->
    <p class="hidden" aria-hidden="true">
      <label>
        No rellenes esto
        <input v-model="data['bot-field']" type="text" name="bot-field" tabindex="-1" />
      </label>
    </p>

    <div class="grid gap-8 sm:grid-cols-2">
      <BaseField
        v-slot="{ id, descritoPor, invalido }"
        :label="UI.form.nameLabel"
        :error="errors.name"
      >
        <input
          :id="id"
          v-model="data.name"
          type="text"
          name="name"
          autocomplete="name"
          :placeholder="UI.form.namePlaceholder"
          :aria-invalid="invalido"
          :aria-describedby="descritoPor"
          :class="CONTROL"
        />
      </BaseField>

      <BaseField
        v-slot="{ id, descritoPor, invalido }"
        :label="UI.form.emailLabel"
        :error="errors.email"
      >
        <input
          :id="id"
          v-model="data.email"
          type="email"
          name="email"
          autocomplete="email"
          :placeholder="UI.form.emailPlaceholder"
          :aria-invalid="invalido"
          :aria-describedby="descritoPor"
          :class="CONTROL"
        />
      </BaseField>
    </div>

    <BaseField
      v-slot="{ id, descritoPor, invalido }"
      :label="UI.form.disciplineLabel"
      :error="errors.discipline"
      pista="Si no lo tienes claro, elige lo que más se acerque."
    >
      <select
        :id="id"
        v-model="data.discipline"
        name="discipline"
        :aria-invalid="invalido"
        :aria-describedby="descritoPor"
        :class="CONTROL"
      >
        <option value="" disabled>Elige una</option>
        <option v-for="op in options" :key="op.value" :value="op.value">{{ op.label }}</option>
      </select>
    </BaseField>

    <BaseField
      v-slot="{ id, descritoPor, invalido }"
      :label="UI.form.messageLabel"
      :error="errors.message"
      pista="Qué traes, para cuándo y, si ya lo sabes, con qué presupuesto."
    >
      <textarea
        :id="id"
        v-model="data.message"
        name="message"
        rows="7"
        :placeholder="UI.form.messagePlaceholder"
        :aria-invalid="invalido"
        :aria-describedby="descritoPor"
        :class="CONTROL"
      />
    </BaseField>

    <!--
      Bloque de ERROR. `aria-live="assertive"` porque interrumpe una acción que
      la persona creía terminada: enterarse tarde de que el mensaje no salió es
      peor que la interrupción.
    -->
    <div
      v-if="status === 'error'"
      aria-live="assertive"
      class="rounded-md border border-primary/30 bg-primary/5 p-5"
    >
      <p class="text-sm leading-relaxed text-foreground">
        No pude enviarlo. Puede ser la conexión, o que algo se haya roto de mi lado — escríbeme
        directo a
        <a
          :href="`mailto:${email}`"
          data-cursor="grow"
          class="font-medium underline decoration-primary decoration-2 underline-offset-4 transition-colors duration-300 hover:text-primary"
          >{{ email }}</a
        >
        y llega igual.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-6 pt-2">
      <BaseCtaButton
        :text="status === 'enviando' ? 'Enviando' : 'Enviar'"
        size="lg"
        type="submit"
        :aria-disabled="status === 'enviando'"
      >
        <template #trailing>
          <svg
            class="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </template>
      </BaseCtaButton>

      <p class="text-sm leading-relaxed text-muted-foreground">
        Respondo en un par de días. Siempre.
      </p>
    </div>
  </form>
</template>
