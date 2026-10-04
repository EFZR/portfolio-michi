<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ResponsiveImage from '@web/components/ui/ResponsiveImage.vue'
import { CONTROL } from '@/components/fields/tipos'
import { useMediaLibrary, type EditableMedia } from '@/composables/useMediaLibrary'
import type { MediaAsset } from '@princess/content/media'

/**
 * LA BIBLIOTECA.
 *
 * Existe por una razón que no es «tener una galería»: los medios entran sin
 * texto alternativo, y sin `alt` no se publican (R12). Esta es la pantalla
 * donde eso se escribe. Sin ella, 45 fotos procesadas no sirven para nada.
 *
 * El segundo trabajo es saber QUÉ FALTA. 42 de los 45 son placeholders
 * importados de la fase anterior, etiquetados `provisional`. Sin una lista
 * filtrable, dentro de dos meses nadie recuerda cuáles eran de relleno.
 *
 * NO borra medios, y es deliberado: borrar uno referenciado desde un proyecto
 * dejaría un hueco en la web publicada, así que hace falta comprobar las
 * referencias antes. Es su propia pieza, y poner un botón que no la comprueba
 * sería peor que no tenerlo.
 */

const biblioteca = useMediaLibrary()

/**
 * DOS EJES INDEPENDIENTES, y conviene no confundirlos:
 *
 *   - DESCRITA o no (`alt`). Sin descripción no se publica (R12).
 *   - PROVISIONAL o definitiva (etiqueta `provisional`). Una provisional es un
 *     placeholder importado de la fase anterior, no una foto de Karol.
 *
 * Son ortogonales: una placeholder puede estar descrita. La primera versión de
 * esta pantalla definía «Listos» solo por el `alt`, así que una provisional
 * descrita salía en «Provisionales» Y en «Listos» a la vez — que es exactamente
 * lo que hizo que no se entendiera.
 *
 * Ahora LISTA significa lista en los dos ejes: descrita y no provisional.
 */
type Filtro = 'todos' | 'sin-alt' | 'provisional' | 'listos'

// Arranca en «sin describir» a propósito: es lo que bloquea publicar, así que
// es lo primero que hay que ver al abrir la pantalla.
const filtro = ref<Filtro>('sin-alt')
const busqueda = ref('')
const seleccionado = ref<string | null>(null)
const guardando = ref(false)
const guardado = ref(false)

/** Borrador de edición. Se copia al abrir para no escribir en cada tecla. */
const forma = ref<EditableMedia>({})

const lista = computed(() => {
  const base = biblioteca.filtrar(undefined, busqueda.value)
  switch (filtro.value) {
    case 'sin-alt':
      return base.filter((a) => a.alt === undefined)
    case 'provisional':
      return base.filter((a) => (a.tags ?? []).includes('provisional'))
    case 'listos':
      return base.filter((a) => a.alt !== undefined && !(a.tags ?? []).includes('provisional'))
    default:
      return base
  }
})

const abierto = computed(() => biblioteca.porId(seleccionado.value ?? undefined))

const conteos = computed(() => {
  const todos = biblioteca.assets.value
  return {
    todos: todos.length,
    'sin-alt': todos.filter((a) => a.alt === undefined).length,
    provisional: todos.filter((a) => (a.tags ?? []).includes('provisional')).length,
    listos: todos.filter((a) => a.alt !== undefined && !(a.tags ?? []).includes('provisional'))
      .length,
  }
})

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'sin-alt', label: 'Sin describir' },
  { id: 'provisional', label: 'Provisionales' },
  { id: 'listos', label: 'Listas' },
  { id: 'todos', label: 'Todas' },
]

/**
 * `alt` vacío significa «decorativa» y es un estado VÁLIDO (R12), así que no
 * se puede distinguir de «no escrito» mirando la cadena. De ahí la casilla:
 * marcarla guarda la cadena vacía a propósito.
 */
const decorativa = ref(false)

function abrir(a: MediaAsset) {
  seleccionado.value = a.id
  guardado.value = false
  decorativa.value = a.alt === ''
  forma.value = {
    title: a.title,
    alt: a.alt ?? '',
    caption: a.caption ?? '',
    credit: a.credit ?? '',
  }
}

// Si la lista cambia bajo los pies (una subida nueva), la ficha abierta se
// cierra en vez de quedar mostrando datos de otro medio.
watch(abierto, (a) => {
  if (!a) seleccionado.value = null
})

async function guardar() {
  const a = abierto.value
  if (!a) return
  guardando.value = true
  guardado.value = false

  const cambios: EditableMedia = {
    title: forma.value.title?.trim() || a.title,
    alt: decorativa.value ? '' : (forma.value.alt ?? '').trim(),
    caption: (forma.value.caption ?? '').trim(),
    credit: (forma.value.credit ?? '').trim(),
  }
  // Un `alt` vacío SIN marcar «decorativa» sería volver al estado «no
  // escrito», y eso no se hace desde acá: se deja de guardar el campo en vez
  // de escribir una cadena vacía que significaría otra cosa.
  if (!decorativa.value && !cambios.alt) delete cambios.alt

  guardado.value = await biblioteca.guardar(a.id, cambios)
  guardando.value = false
}

/** Quita la etiqueta `provisional`: ya no es una imagen de relleno. */
async function confirmar(a: MediaAsset) {
  await biblioteca.guardar(a.id, { tags: (a.tags ?? []).filter((t) => t !== 'provisional') })
}

/**
 * Borrado en DOS PASOS y sin `confirm()`.
 *
 * Un diálogo nativo del navegador bloquea el webview entero, y en Tauri eso
 * puede dejar la ventana sin responder. Dos clics en el mismo sitio hacen el
 * mismo trabajo sin ese riesgo.
 */
const confirmandoBorrado = ref(false)
const borrando = ref(false)

watch(abierto, () => {
  confirmandoBorrado.value = false
})

async function borrar() {
  const a = abierto.value
  if (!a) return
  borrando.value = true
  const ok = await biblioteca.borrar(a.id)
  borrando.value = false
  confirmandoBorrado.value = false
  if (ok) seleccionado.value = null
}

const kb = (b: number) => `${Math.round(b / 1024)} KB`
const pesoTotal = (a: MediaAsset) =>
  a.renditions.images.reduce((n, r) => n + r.bytes, 0) +
  a.renditions.videos.reduce((n, r) => n + r.bytes, 0)

/**
 * `ResponsiveImage` resuelve el id contra la biblioteca VIVA, no contra el
 * `content.json` publicado: una foto que se acaba de subir todavía no está en
 * el snapshot.
 */
const resolver = (id: string) => biblioteca.porId(id)

onMounted(() => biblioteca.cargar())
</script>

<template>
  <div class="space-y-10">
    <!-- ── Cabecera: lo primero es cuánto falta ──────────────────────────── -->
    <header class="space-y-4">
      <p class="max-w-prose text-base leading-relaxed text-muted-foreground">
        <template v-if="biblioteca.sinAlt.value">
          <span class="text-foreground">{{ biblioteca.sinAlt.value }}</span> de {{ conteos.todos }}
          {{ conteos.todos === 1 ? 'imagen' : 'imágenes' }} no se
          {{ biblioteca.sinAlt.value === 1 ? 'puede' : 'pueden' }} publicar todavía: falta describir
          qué se ve en {{ biblioteca.sinAlt.value === 1 ? 'ella' : 'ellas' }}.
        </template>
        <template v-else-if="conteos.todos">
          Las {{ conteos.todos }} imágenes están descritas y se pueden publicar.
        </template>
        <template v-else> La biblioteca está vacía. </template>
      </p>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          v-for="f in FILTROS"
          :key="f.id"
          type="button"
          class="font-mono text-[0.65rem] uppercase tracking-[0.25em] transition-colors duration-200"
          :class="
            filtro === f.id
              ? 'text-primary underline decoration-primary/50 underline-offset-[6px]'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="filtro = f.id"
        >
          {{ f.label }}
          <span class="ml-1.5 normal-case tracking-normal opacity-60">{{ conteos[f.id] }}</span>
        </button>

        <span aria-hidden="true" class="hidden h-4 w-px bg-border sm:block" />

        <input
          v-model="busqueda"
          type="search"
          placeholder="Buscar…"
          :class="CONTROL"
          class="min-w-0 max-w-xs flex-1"
        />

        <button
          type="button"
          :disabled="biblioteca.ocupado.value"
          class="ms-auto shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary disabled:opacity-50"
          @click="biblioteca.importar()"
        >
          Subir archivo
        </button>
      </div>
    </header>

    <div
      v-if="biblioteca.progreso.value"
      class="border-y border-primary bg-primary-soft/30 px-5 py-4"
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
    </div>

    <p v-if="biblioteca.error.value" role="alert" class="text-sm leading-relaxed text-primary">
      {{ biblioteca.error.value }}
    </p>

    <!-- ── Retícula asimétrica: la ficha abierta ocupa la columna derecha ── -->
    <div class="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div :class="abierto ? 'lg:col-span-7' : 'lg:col-span-12'">
        <p
          v-if="biblioteca.estado.value === 'cargando'"
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
        >
          Cargando…
        </p>

        <p
          v-else-if="!lista.length"
          class="max-w-prose text-sm leading-relaxed text-muted-foreground"
        >
          {{
            busqueda
              ? 'Nada coincide con esa búsqueda.'
              : filtro === 'sin-alt'
                ? 'Todas las imágenes están descritas.'
                : 'No hay nada en este filtro.'
          }}
        </p>

        <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <li v-for="a in lista" :key="a.id">
            <button type="button" class="group w-full text-left" @click="abrir(a)">
              <span
                class="relative block overflow-hidden rounded-md border transition-colors duration-200"
                :class="
                  a.id === seleccionado
                    ? 'border-primary'
                    : 'border-border group-hover:border-primary'
                "
                :style="{ aspectRatio: String(a.intrinsic.aspectRatio) }"
              >
                <ResponsiveImage
                  :media-id="a.id"
                  :resolver="resolver"
                  alt=""
                  sizes="(min-width: 1024px) 180px, (min-width: 640px) 30vw, 45vw"
                />
                <!--
                  Una imagen sin describir se marca EN la cuadrícula, no solo en
                  su ficha: es lo que hay que ir a arreglar, y tiene que verse
                  sin abrir nada.
                -->
                <span
                  v-if="a.alt === undefined"
                  class="absolute inset-x-0 bottom-0 bg-foreground/85 px-2 py-1 text-center font-mono text-[0.55rem] uppercase tracking-[0.2em] text-background"
                >
                  sin describir
                </span>
              </span>
              <span class="mt-2 block truncate text-sm text-foreground">{{ a.title }}</span>
              <span
                class="block font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground"
              >
                {{ a.intrinsic.width }}×{{ a.intrinsic.height }}
                <span v-if="(a.tags ?? []).includes('provisional')" class="ml-1 text-primary">
                  provisional
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <!-- ── La ficha ──────────────────────────────────────────────────── -->
      <aside v-if="abierto" class="lg:col-span-5">
        <div class="sticky top-24 space-y-6">
          <div
            class="overflow-hidden rounded-md border border-border"
            :style="{ aspectRatio: String(abierto.intrinsic.aspectRatio) }"
          >
            <ResponsiveImage
              :media-id="abierto.id"
              :resolver="resolver"
              :alt="abierto.alt ?? ''"
              sizes="(min-width: 1024px) 40vw, 92vw"
            />
          </div>

          <dl
            class="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            <div>
              <dt class="inline">Tamaño</dt>
              <dd class="inline text-foreground">
                {{ abierto.intrinsic.width }}×{{ abierto.intrinsic.height }}
              </dd>
            </div>
            <div>
              <dt class="inline">Versiones</dt>
              <dd class="inline text-foreground">
                {{ abierto.renditions.images.length + abierto.renditions.videos.length }}
              </dd>
            </div>
            <div>
              <dt class="inline">Peso</dt>
              <dd class="inline text-foreground">{{ kb(pesoTotal(abierto)) }}</dd>
            </div>
            <div>
              <dt class="inline">Original</dt>
              <dd class="inline text-foreground">{{ kb(abierto.source.bytes) }}</dd>
            </div>
          </dl>

          <!--
            Dónde está usada. Va ANTES del formulario porque cambia lo que se
            puede hacer: si está en uso, no se puede borrar, y es mejor saberlo
            al abrir que al intentarlo.
          -->
          <div
            v-if="biblioteca.usosDe(abierto.id).length"
            class="space-y-1 border-t border-border pt-4"
          >
            <p class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              En uso en {{ biblioteca.usosDe(abierto.id).length }}
              {{ biblioteca.usosDe(abierto.id).length === 1 ? 'sitio' : 'sitios' }}
            </p>
            <ul class="space-y-0.5">
              <li
                v-for="(u, i) in biblioteca.usosDe(abierto.id)"
                :key="`${u.coleccion}-${u.documento}-${i}`"
                class="truncate text-sm text-foreground"
              >
                {{ u.etiqueta }}
              </li>
            </ul>
          </div>
          <p
            v-else
            class="border-t border-border pt-4 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            No se usa en ningún sitio
          </p>

          <form class="space-y-6" @submit.prevent="guardar">
            <label class="block">
              <span
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
              >
                Título
              </span>
              <input v-model="forma.title" type="text" :class="CONTROL" class="mt-2" />
            </label>

            <div>
              <label class="block">
                <span
                  class="font-mono text-[0.65rem] uppercase tracking-[0.25em]"
                  :class="abierto.alt === undefined ? 'text-primary' : 'text-muted-foreground'"
                >
                  Qué se ve en la imagen
                </span>
                <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                  Lo lee quien no puede ver la foto, y los buscadores. Sin esto la imagen no se
                  publica.
                </p>
                <textarea
                  v-model="forma.alt"
                  rows="3"
                  :disabled="decorativa"
                  placeholder="Una modelo de perfil contra una pared de cemento, luz lateral dura."
                  :class="CONTROL"
                  class="mt-2 resize-y disabled:opacity-40"
                />
              </label>

              <label class="mt-3 flex items-start gap-3">
                <input v-model="decorativa" type="checkbox" class="mt-1 accent-primary" />
                <span class="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  Es decorativa: no aporta información y no hace falta describirla.
                </span>
              </label>
            </div>

            <label class="block">
              <span
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
              >
                Pie de foto
                <span class="normal-case tracking-normal opacity-60">opcional</span>
              </span>
              <input v-model="forma.caption" type="text" :class="CONTROL" class="mt-2" />
            </label>

            <label class="block">
              <span
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
              >
                Crédito
                <span class="normal-case tracking-normal opacity-60">opcional</span>
              </span>
              <input
                v-model="forma.credit"
                type="text"
                placeholder="© Karol Palma"
                :class="CONTROL"
                class="mt-2"
              />
              <!--
                La autoría vive ACÁ y no dentro del archivo. MEDIDO con exiv2:
                ffmpeg no escribe EXIF en imágenes, así que `-metadata
                copyright` no sobrevive al re-encode. Este campo es la fuente de
                verdad y lo tiene que pintar la web.
              -->
              <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                No viaja dentro del archivo: se muestra en la web desde acá.
              </p>
            </label>

            <div class="flex flex-wrap items-center gap-6 border-t border-border pt-6">
              <button
                type="submit"
                :disabled="guardando"
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary disabled:opacity-50"
              >
                {{ guardando ? 'Guardando…' : 'Guardar' }}
              </button>

              <button
                v-if="(abierto.tags ?? []).includes('provisional')"
                type="button"
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
                @click="confirmar(abierto)"
              >
                Ya no es provisional
              </button>

              <button
                type="button"
                class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
                @click="seleccionado = null"
              >
                Cerrar
              </button>

              <!--
                Borrar queda a la derecha y separado: es la única acción de esta
                ficha que no se puede deshacer.
              -->
              <template v-if="!biblioteca.usosDe(abierto.id).length">
                <button
                  v-if="!confirmandoBorrado"
                  type="button"
                  class="ms-auto font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
                  @click="confirmandoBorrado = true"
                >
                  Borrar
                </button>
                <span v-else class="ms-auto flex items-center gap-4">
                  <span
                    class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    ¿Borrar las
                    {{
                      abierto.renditions.images.length + abierto.renditions.videos.length + 1
                    }}
                    versiones?
                  </span>
                  <button
                    type="button"
                    :disabled="borrando"
                    class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary disabled:opacity-50"
                    @click="borrar"
                  >
                    {{ borrando ? 'Borrando…' : 'Sí, borrar' }}
                  </button>
                  <button
                    type="button"
                    class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    @click="confirmandoBorrado = false"
                  >
                    No
                  </button>
                </span>
              </template>
            </div>

            <p
              v-if="guardado"
              class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-primary"
            >
              Guardado
            </p>
          </form>
        </div>
      </aside>
    </div>
  </div>
</template>
