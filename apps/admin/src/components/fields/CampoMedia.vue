<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import CampoBase from './CampoBase.vue'
import { CONTROL, type FieldProps } from './tipos'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import type { MediaAsset, MediaKind } from '@princess/content/media'
import ResponsiveImage from '@web/components/ui/ResponsiveImage.vue'

/**
 * SELECTOR DE LA BIBLIOTECA DE MEDIOS.
 *
 * Reemplaza al widget que pedía una URL. El valor guardado es el ID de un
 * documento de `media`, no una dirección: la misma foto se referencia desde
 * varios sitios sin volver a subirla.
 *
 * Dos caminos, y el orden de la interfaz dice cuál se espera: ELEGIR primero,
 * subir después. Con 46 medios en la biblioteca, lo normal es que la foto ya
 * esté; poner «subir» delante invita a duplicar.
 */

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const biblioteca = useMediaLibrary()
const abierta = ref(false)
const busqueda = ref('')

/** `constraints.kind` acota el selector a fotos o a vídeos. */
const kind = computed(() => props.campo.constraints?.kind as MediaKind | undefined)

const id = computed(() => (typeof props.valor === 'string' ? props.valor : ''))
const elegido = computed(() => biblioteca.porId(id.value))

/**
 * Un valor que NO es un id de la biblioteca: las URLs viejas que quedan en los
 * datos. Se muestra tal cual en vez de dejar el campo en blanco, porque el
 * campo en blanco parecería que no hay nada configurado cuando en realidad hay
 * una imagen publicada.
 */
const heredado = computed(() => id.value !== '' && !/^[0-9a-f]{8,64}$/.test(id.value))

const resultados = computed(() => biblioteca.filtrar(kind.value, busqueda.value))

/**
 * La proporción que la ficha espera, si el esquema la declara.
 *
 * YA NO ES UN FILTRO DE SUBIDA: el pipeline no recorta, así que una foto con
 * otra proporción se puede elegir igual y se verá recortada por el CSS. Esto
 * avisa; no bloquea. Convertirlo en error dejaría a Karol sin poder usar una
 * foto que sí quiere usar.
 */
const esperada = computed(() => {
  const a = props.campo.constraints?.aspectRatio as
    { width: number; height: number; tolerance?: number } | undefined
  return a ? { ...a, valor: a.width / a.height, tolerance: a.tolerance ?? 0.03 } : undefined
})

const desajuste = computed(() => {
  const e = esperada.value
  const real = elegido.value?.intrinsic.aspectRatio
  if (!e || real === undefined) return null
  const d = Math.abs(real - e.valor) / e.valor
  return d > e.tolerance ? { real, esperada: e } : null
})

/**
 * El resolutor que usa `ResponsiveImage` acá: la biblioteca VIVA, no el
 * `content.json` publicado. Una foto que se acaba de subir todavía no está en
 * el snapshot.
 */
const resolver = (id: string) => biblioteca.porId(id)

function elegir(a: MediaAsset) {
  emit('cambiar', a.id)
  abierta.value = false
  emit('salir')
}

async function subir() {
  const nuevo = await biblioteca.importar({ kind: kind.value })
  if (nuevo) elegir(nuevo)
}

onMounted(() => biblioteca.cargar())
</script>

<template>
  <CampoBase
    :label="campo.label"
    :error="error"
    :pista="campo.help"
    :opcional="campo.required === false"
  >
    <template #default="{ id: campoId, descritoPor, invalido }">
      <div class="space-y-4">
        <!-- ── Lo elegido ─────────────────────────────────────────────── -->
        <div v-if="elegido" class="flex flex-wrap items-start gap-5">
          <div
            class="w-32 shrink-0 overflow-hidden rounded-md border border-border"
            :style="{
              aspectRatio: String(elegido.intrinsic.aspectRatio),
              backgroundColor: elegido.colour.dominant ?? undefined,
            }"
          >
            <ResponsiveImage :media-id="elegido.id" :resolver="resolver" alt="" sizes="128px" />
          </div>

          <div class="min-w-0 flex-1 space-y-2">
            <p class="truncate text-base text-foreground">{{ elegido.title }}</p>
            <p class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              {{ elegido.intrinsic.width }}×{{ elegido.intrinsic.height }}
              <span class="mx-2 text-border">·</span>
              {{ elegido.kind === 'video' ? 'vídeo' : 'foto' }}
              <span v-if="elegido.tags?.includes('provisional')" class="ml-2 text-primary">
                provisional
              </span>
            </p>

            <!-- R12: sin alt no se publica. Se dice acá, donde se elige. -->
            <p v-if="elegido.alt === undefined" class="text-sm leading-relaxed text-primary">
              Esta imagen no tiene texto alternativo, así que no se va a publicar. Se escribe desde
              la biblioteca.
            </p>

            <p v-if="desajuste" class="max-w-prose text-sm leading-relaxed text-muted-foreground">
              Esta ficha está pensada para {{ desajuste.esperada.width }}:{{
                desajuste.esperada.height
              }}
              y la foto es {{ desajuste.real.toFixed(2) }}:1. Se va a recortar al mostrarla.
            </p>

            <div class="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
                @click="abierta = !abierta"
              >
                Cambiar
              </button>
              <button
                type="button"
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
                @click="(emit('cambiar', ''), emit('salir'))"
              >
                Quitar
              </button>
            </div>
          </div>
        </div>

        <!-- ── Un valor heredado: una URL de antes de la biblioteca ──── -->
        <div v-else-if="heredado" class="space-y-2">
          <div class="flex items-start gap-5">
            <div class="w-32 shrink-0 overflow-hidden rounded-md border border-border">
              <img :src="id" alt="" class="h-full w-full object-cover" />
            </div>
            <div class="min-w-0 flex-1 space-y-2">
              <p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
                Esta imagen es de antes de la biblioteca: está puesta como dirección web, no como
                archivo propio. Sigue funcionando, pero no tiene versiones para móvil.
              </p>
              <p class="truncate font-mono text-[0.6rem] text-muted-foreground/70">{{ id }}</p>
            </div>
          </div>
        </div>

        <!-- ── Nada elegido ──────────────────────────────────────────── -->
        <div v-else>
          <button
            :id="campoId"
            type="button"
            :aria-describedby="descritoPor"
            :aria-invalid="invalido"
            class="w-full rounded-md border border-dashed border-border px-6 py-8 text-left transition-colors duration-200 hover:border-primary"
            @click="abierta = true"
          >
            <span
              class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
            >
              Elegir {{ kind === 'video' ? 'un vídeo' : 'una imagen' }}
            </span>
          </button>
        </div>

        <!-- ── Progreso de una importación ───────────────────────────── -->
        <div
          v-if="biblioteca.progreso.value"
          class="rounded-md border border-primary bg-primary-soft/30 px-5 py-4"
        >
          <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary">
            {{
              {
                eligiendo: 'Eligiendo archivo',
                procesando: 'Preparando versiones',
                subiendo: 'Subiendo',
                guardando: 'Guardando',
              }[biblioteca.progreso.value.paso]
            }}
            <span v-if="biblioteca.progreso.value.porcentaje >= 0" class="ml-2">
              {{ biblioteca.progreso.value.porcentaje }}%
            </span>
          </p>
          <p class="mt-1 truncate text-sm text-muted-foreground">
            {{ biblioteca.progreso.value.archivo }}
          </p>
          <!--
            El procesado no informa de progreso: ffmpeg no lo reporta por
            archivo y fingir una barra sería mentir. Se dice cuánto tarda, que
            es lo que de verdad hace falta para no pensar que se colgó.
          -->
          <p
            v-if="biblioteca.progreso.value.paso === 'procesando'"
            class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground"
          >
            Una foto tarda unos segundos; un vídeo, cerca de medio minuto. Se generan todos los
            tamaños de una vez para que la web cargue rápido después.
          </p>
        </div>

        <p v-if="biblioteca.error.value" role="alert" class="text-sm leading-relaxed text-primary">
          {{ biblioteca.error.value }}
        </p>

        <!-- ── La biblioteca ─────────────────────────────────────────── -->
        <div v-if="abierta" class="space-y-4 border-t border-border pt-4">
          <div class="flex flex-wrap items-center gap-4">
            <input
              v-model="busqueda"
              type="search"
              placeholder="Buscar por título o etiqueta…"
              :class="CONTROL"
              class="min-w-0 flex-1"
            />
            <button
              type="button"
              :disabled="biblioteca.ocupado.value"
              class="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary disabled:opacity-50"
              @click="subir"
            >
              Subir nueva
            </button>
            <button
              type="button"
              class="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
              @click="abierta = false"
            >
              Cerrar
            </button>
          </div>

          <p
            v-if="biblioteca.estado.value === 'cargando'"
            class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Cargando…
          </p>

          <p
            v-else-if="!resultados.length"
            class="max-w-prose text-sm leading-relaxed text-muted-foreground"
          >
            {{
              busqueda
                ? 'Nada coincide con esa búsqueda.'
                : 'La biblioteca está vacía todavía. Subí la primera con «Subir nueva».'
            }}
          </p>

          <ul v-else class="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            <li v-for="a in resultados" :key="a.id">
              <button
                type="button"
                class="group w-full text-left"
                :aria-pressed="a.id === id"
                @click="elegir(a)"
              >
                <span
                  class="block overflow-hidden rounded-md border transition-colors duration-200"
                  :class="
                    a.id === id ? 'border-primary' : 'border-border group-hover:border-primary'
                  "
                  :style="{
                    aspectRatio: String(a.intrinsic.aspectRatio),
                    backgroundColor: a.colour.dominant ?? undefined,
                  }"
                >
                  <!--
                    `sizes` es lo que arregla un bug medido: sin él el
                    navegador bajaba el JPEG más grande de cada asset y la
                    cuadrícula de 45 miniaturas pesaba 6.21 MB en vez de
                    311 KB — 20 veces más. Declarando el ancho real de la
                    celda, el navegador elige el de 320.
                  -->
                  <ResponsiveImage
                    :media-id="a.id"
                    :resolver="resolver"
                    alt=""
                    sizes="(min-width: 640px) 160px, 120px"
                  />
                </span>
                <span class="mt-1.5 block truncate text-xs text-muted-foreground">
                  {{ a.title }}
                </span>
                <span
                  v-if="a.tags?.includes('provisional')"
                  class="block font-mono text-[0.55rem] uppercase tracking-[0.2em] text-primary"
                >
                  provisional
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </CampoBase>
</template>
