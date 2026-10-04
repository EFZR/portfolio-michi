<script setup lang="ts">
import { computed } from 'vue'
import { PRIMARY_LOCALE, type Locale } from '@princess/content'
import CampoBase from './CampoBase.vue'
import { useEditLocale } from '@/composables/useEditLocale'
import { CONTROL, num, type FieldProps } from './tipos'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const localizado = computed(() => props.campo.localized === true)
const tope = computed(() => num(props.campo.constraints?.maxLength))
const multilinea = computed(() => props.campo.ui?.control === 'textarea')
const filas = computed(() => num(props.campo.ui?.rows) ?? 4)

/** Un localizado es `{ es, en }`; uno normal, una cadena. */
const par = computed(() => (props.valor ?? {}) as Record<string, string>)
const plano = computed(() => String(props.valor ?? ''))

function texto(locale: Locale): string {
  return localizado.value ? (par.value[locale] ?? '') : plano.value
}

function escribir(locale: Locale, value: string) {
  emit('cambiar', localizado.value ? { ...par.value, [locale]: value } : value)
}

/**
 * El idioma lo manda el FORMULARIO, no el campo: se ve uno solo a la vez y el
 * conmutador está arriba. Un campo sin localizar ignora el conmutador.
 */
const editLocale = useEditLocale()
const activo = computed<Locale>(() => (localizado.value ? editLocale.value : PRIMARY_LOCALE))

/**
 * El contador es por IDIOMA, no por campo. El arco tiene que caber en español
 * y en inglés por separado, no sumando los dos — un contador único daría por
 * bueno un titular que en inglés se sale.
 */
const estado = computed<'ok' | 'aviso' | 'error'>(() => {
  const t = tope.value
  if (!t) return 'ok'
  const n = texto(activo.value).length
  return n > t ? 'error' : n / t >= 0.9 ? 'aviso' : 'ok'
})

/** Aviso discreto: este texto existe en español pero todavía no en inglés. */
const sinTraducir = computed(
  () =>
    localizado.value &&
    activo.value === PRIMARY_LOCALE &&
    texto(PRIMARY_LOCALE).trim() !== '' &&
    texto('en').trim() === '',
)
</script>

<template>
  <CampoBase
    :label="campo.label"
    :error="error"
    :pista="campo.help"
    :opcional="campo.required === false"
  >
    <template #default="{ id, descritoPor, invalido }">
      <textarea
        v-if="multilinea"
        :id="id"
        :value="texto(activo)"
        :rows="filas"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        :class="CONTROL"
        @input="escribir(activo, ($event.target as HTMLTextAreaElement).value)"
        @blur="emit('salir')"
      />
      <input
        v-else
        :id="id"
        :value="texto(activo)"
        type="text"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        :class="CONTROL"
        @input="escribir(activo, ($event.target as HTMLInputElement).value)"
        @blur="emit('salir')"
      />

      <div class="mt-1.5 flex items-baseline justify-between gap-4">
        <!--
          Marca discreta de "falta la traducción". Va aquí y no en un panel
          aparte porque es donde se puede hacer algo: se ve al repasar el
          español y se resuelve conmutando a inglés.
        -->
        <p
          v-if="sinTraducir"
          class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground/70"
        >
          sin traducir
        </p>
        <span v-else aria-hidden="true" />

        <p
          v-if="tope"
          class="font-mono text-xs"
          :class="{
            'text-muted-foreground': estado === 'ok',
            'text-primary': estado === 'aviso',
            'font-semibold text-primary': estado === 'error',
          }"
          aria-live="polite"
        >
          <!--
            Al 90% aparece la AYUDA del campo, no solo el número. El momento en
            que alguien está a punto de pasarse es justo cuando sirve saber POR
            QUÉ hay un tope: "máx. 26" parece arbitrario; "no caben más en el
            arco", no.
          -->
          <span
            v-if="estado !== 'ok' && campo.help"
            class="me-2 font-body normal-case text-muted-foreground"
          >
            {{ campo.help }}
          </span>
          {{ texto(activo).length }} / {{ tope }}
        </p>
      </div>
    </template>
  </CampoBase>
</template>
