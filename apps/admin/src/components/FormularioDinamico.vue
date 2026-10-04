<script setup lang="ts">
import { computed } from 'vue'
import type { SchemaDoc } from '@princess/content'
import CampoDinamico from './fields/CampoDinamico.vue'
import type { FieldDescriptor } from './fields/tipos'
import { useDynamicForm } from '@/composables/useDynamicForm'
import { contarSinTraducir, provideEditLocale } from '@/composables/useEditLocale'
import { LOCALES } from '@princess/content'

const props = defineProps<{ esquema: SchemaDoc; inicial: Record<string, unknown> }>()
const emit = defineEmits<{ guardar: [valores: Record<string, unknown>] }>()

const form = useDynamicForm(props.esquema, props.inicial)

/**
 * El idioma se elige UNA vez para todo el formulario. Los campos localizados lo
 * inyectan y muestran solo ese. Antes cada uno pintaba los dos apilados y un
 * formulario de ocho campos se leía como uno de dieciséis.
 */
const editLocale = provideEditLocale()

/** Cuántos textos tienen español pero aún no inglés. */
const sinTraducir = computed(() => contarSinTraducir(form.data))

/**
 * Si no hay ni un campo localizado, el conmutador no pinta nada — `routes` o
 * `nav` no tienen por qué enseñar un control que no hace nada.
 *
 * Recorre en profundidad porque lo localizado puede estar dentro de una tupla
 * (las cinco palabras del Hero) o de una lista de grupos (los pasos de Contacto).
 */
const tieneLocalizados = computed(() => {
  const hay = (campos: FieldDescriptor[]): boolean =>
    campos.some(
      (c) =>
        c.localized === true ||
        hay(c.elements ?? []) ||
        hay(c.fields ?? []) ||
        (c.element ? hay([c.element]) : false),
    )
  return hay(props.esquema.fields as unknown as FieldDescriptor[])
})

const campos = computed(() => props.esquema.fields as unknown as FieldDescriptor[])

/** Los grupos declarados en el esquema ordenan la pantalla. */
const grupos = computed(() => {
  const declarados = props.esquema.groups as { id: string; label: string; order: number }[]
  if (!declarados.length) return [{ id: '', label: '', campos: campos.value }]
  return [...declarados]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      ...g,
      campos: campos.value.filter((c) => c.ui?.group === g.id),
    }))
    .filter((g) => g.campos.length)
})

/** Campos sin grupo: van al final, no se pierden. */
const sueltos = computed(() =>
  props.esquema.groups.length ? campos.value.filter((c) => !c.ui?.group) : [],
)

function enviar() {
  if (form.validateAll()) emit('guardar', form.payload())
}

defineExpose({ form })
</script>

<template>
  <form class="space-y-10 pb-4" novalidate @submit.prevent="enviar">
    <!--
      CONMUTADOR DE IDIOMA. Arriba del todo y pegado: en un formulario largo
      hay que poder cambiar sin volver al principio.
    -->
    <div
      v-if="tieneLocalizados"
      class="sticky top-16 z-10 -mx-1 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-1 py-3 backdrop-blur-sm"
    >
      <span class="flex items-center gap-1">
        <button
          v-for="l in LOCALES"
          :key="l"
          type="button"
          class="px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.25em] transition-colors duration-200"
          :class="editLocale === l ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="editLocale === l"
          @click="editLocale = l"
        >
          {{ l === 'es' ? 'Español' : 'Inglés' }}
        </button>
      </span>

      <p
        v-if="sinTraducir && editLocale === 'es'"
        class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
      >
        {{ sinTraducir }} sin traducir
      </p>
      <p
        v-else-if="editLocale === 'en'"
        class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
      >
        El inglés puede quedar vacío
      </p>
    </div>

    <section v-for="grupo in grupos" :key="grupo.id" class="space-y-6">
      <div v-if="grupo.label" class="flex items-baseline gap-4">
        <span class="font-mono text-[0.6rem] tracking-[0.25em] text-primary">§</span>
        <h2 class="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
          {{ grupo.label }}
        </h2>
      </div>

      <template v-for="campo in grupo.campos" :key="campo.key">
        <CampoDinamico
          v-if="form.isVisible(campo.key)"
          :campo="campo"
          :valor="form.data[campo.key]"
          :error="form.touched[campo.key] ? (form.errors[campo.key] ?? '') : ''"
          :ruta="campo.key"
          @cambiar="form.change"
          @salir="form.blur"
        />
      </template>
    </section>

    <section v-if="sueltos.length" class="space-y-6">
      <template v-for="campo in sueltos" :key="campo.key">
        <CampoDinamico
          v-if="form.isVisible(campo.key)"
          :campo="campo"
          :valor="form.data[campo.key]"
          :error="form.touched[campo.key] ? (form.errors[campo.key] ?? '') : ''"
          :ruta="campo.key"
          @cambiar="form.change"
          @salir="form.blur"
        />
      </template>
    </section>

    <!--
      Barra pegada al pie. Se queda a la vista mientras se baja por el
      formulario: en una pantalla de treinta campos, un botón al final es un
      botón que hay que ir a buscar.
    -->
    <div
      class="sticky bottom-0 -mx-1 mt-4 flex items-center justify-between gap-4 border-t border-border bg-background/95 px-1 py-5 backdrop-blur-sm"
    >
      <p class="flex items-center gap-2.5 font-mono text-[0.65rem] uppercase tracking-[0.25em]">
        <span
          aria-hidden="true"
          class="h-1.5 w-1.5 rounded-md transition-colors duration-300"
          :class="form.dirty.value ? 'bg-primary' : 'bg-border'"
        />
        <span :class="form.dirty.value ? 'text-primary' : 'text-muted-foreground'">
          {{ form.dirty.value ? 'Sin guardar' : 'Al día' }}
        </span>
      </p>
      <button
        type="submit"
        :disabled="!form.dirty.value"
        class="group flex items-center gap-3 border-b border-foreground py-2 font-mono text-[0.7rem] uppercase tracking-[0.3em] transition-colors duration-300 enabled:hover:border-primary enabled:hover:text-primary disabled:border-border disabled:text-muted-foreground"
      >
        Guardar
        <span
          aria-hidden="true"
          class="transition-transform duration-300 group-enabled:group-hover:translate-x-1"
          >→</span
        >
      </button>
    </div>
  </form>
</template>
