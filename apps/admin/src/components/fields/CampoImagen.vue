<script setup lang="ts">
import { computed, ref } from 'vue'
import CampoBase from './CampoBase.vue'
import { CONTROL, type FieldProps } from './tipos'
import { useUpload, type AspectRatio } from '@/composables/useUpload'

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const { subir, subiendo, progreso, error: errorSubida } = useUpload()
const input = ref<HTMLInputElement | null>(null)

const ratio = computed(() => props.campo.constraints?.aspectRatio as AspectRatio | undefined)
const ratioCss = computed(() =>
  ratio.value ? `${ratio.value.width} / ${ratio.value.height}` : undefined,
)
const url = computed(() => String(props.valor ?? ''))

/**
 * El destino sale del esquema (`ui.destino`), no del componente: cada colección
 * guarda en su carpeta y el widget no tiene por qué saber cuál.
 */
const destino = computed(() => String(props.campo.ui?.destino ?? 'misc/{campo}.webp'))

async function alElegir(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const r = await subir(
    file,
    destino.value,
    { campo: props.campo.key, ruta: props.ruta },
    ratio.value,
  )
  if (r) emit('cambiar', r.url)

  // Se limpia el input o elegir el MISMO archivo otra vez no dispararía `change`.
  if (input.value) input.value.value = ''
}
</script>

<template>
  <CampoBase
    :label="campo.label"
    :error="error"
    :pista="campo.help"
    :opcional="campo.required === false"
  >
    <template #default="{ id, descritoPor, invalido }">
      <div class="flex flex-wrap items-start gap-6">
        <!-- Vista previa con la proporción real que tendrá en la web. -->
        <div
          v-if="url"
          class="w-40 shrink-0 overflow-hidden rounded-md border border-border"
          :style="ratioCss ? { aspectRatio: ratioCss } : undefined"
        >
          <img :src="url" alt="" class="h-full w-full object-cover" />
        </div>

        <div class="min-w-0 flex-1 space-y-3">
          <input
            :id="id"
            :value="url"
            type="text"
            placeholder="https://… o /ruta-en-public.jpg"
            :aria-describedby="descritoPor"
            :aria-invalid="invalido"
            :class="CONTROL"
            @input="emit('cambiar', ($event.target as HTMLInputElement).value)"
            @blur="emit('salir')"
          />

          <div class="flex flex-wrap items-center gap-4">
            <button
              type="button"
              :disabled="subiendo"
              class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary disabled:opacity-50"
              @click="input?.click()"
            >
              {{ subiendo ? progreso : 'Subir imagen' }}
            </button>

            <span
              v-if="ratioCss"
              class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground/70"
            >
              {{ ratioCss.replace(' / ', ':') }}
            </span>

            <button
              v-if="url && !subiendo"
              type="button"
              class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
              @click="emit('cambiar', '')"
            >
              Quitar
            </button>
          </div>

          <!--
            El error de subida va aquí y no en el del campo: son cosas distintas.
            «la proporción no cuadra» no invalida el valor guardado, solo rechaza
            el archivo que acabas de elegir.
          -->
          <p v-if="errorSubida" role="alert" class="text-sm leading-relaxed text-primary">
            {{ errorSubida }}
          </p>
        </div>
      </div>

      <input
        ref="input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        class="hidden"
        @change="alElegir"
      />
    </template>
  </CampoBase>
</template>
