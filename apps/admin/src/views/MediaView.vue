<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BaseModal from '@web/components/ui/BaseModal.vue'
import ResponsiveImage from '@web/components/ui/ResponsiveImage.vue'
import { CONTROL } from '@/components/fields/tipos'
import { useMediaLibrary, type EditableMedia } from '@/composables/useMediaLibrary'
import type { MediaAsset } from '@princess/content/media'

/**
 * LA BIBLIOTECA.
 *
 * UNA sola galería. La primera versión partía las imágenes en cuatro filtros
 * —sin describir, provisionales, listas, todas— y era un error de bulto: el
 * `alt` ya no bloquea nada, así que esas pestañas dividían por un estado que
 * no cambia lo que se puede hacer con la foto. Y obligaban a entender una
 * taxonomía antes de ver una imagen.
 *
 * La ficha se abre en un DIÁLOGO y no en una columna al lado. Con la columna
 * había que bajar el scroll de la página entera para ver los datos de una foto
 * que estaba arriba, y los botones quedaban fuera de vista.
 */

const biblioteca = useMediaLibrary()

const busqueda = ref('')
const seleccionado = ref<string | null>(null)
const guardando = ref(false)
const guardado = ref(false)
const borrando = ref(false)
const confirmandoBorrado = ref(false)

/** Borrador de edición. Se copia al abrir para no escribir en cada tecla. */
const forma = ref<EditableMedia>({})

const lista = computed(() => biblioteca.filtrar(undefined, busqueda.value))
const abierto = computed(() => biblioteca.porId(seleccionado.value ?? undefined))

function abrir(a: MediaAsset) {
  seleccionado.value = a.id
  guardado.value = false
  confirmandoBorrado.value = false
  forma.value = {
    title: a.title,
    alt: a.alt ?? '',
    caption: a.caption ?? '',
    credit: a.credit ?? '',
  }
}

function cerrar() {
  seleccionado.value = null
  confirmandoBorrado.value = false
}

// Si el medio abierto desaparece de la lista —se borró, o se recargó— el
// diálogo se cierra en vez de quedar mostrando datos de nadie.
watch(abierto, (a) => {
  if (!a && seleccionado.value) seleccionado.value = null
})

async function guardar() {
  const a = abierto.value
  if (!a) return
  guardando.value = true
  guardado.value = false

  guardado.value = await biblioteca.guardar(a.id, {
    title: forma.value.title?.trim() || a.title,
    // El `alt` es opcional: se guarda lo que haya, vacío incluido. Ya no hay
    // que distinguir «no escrito» de «decorativa», porque ninguno de los dos
    // impide publicar.
    alt: (forma.value.alt ?? '').trim(),
    caption: (forma.value.caption ?? '').trim(),
    credit: (forma.value.credit ?? '').trim(),
  })
  guardando.value = false
}

async function borrar() {
  const a = abierto.value
  if (!a) return
  borrando.value = true
  const ok = await biblioteca.borrar(a.id)
  borrando.value = false
  confirmandoBorrado.value = false
  if (ok) cerrar()
}

/** Quita la etiqueta `provisional`: ya no es una imagen de relleno. */
async function confirmarDefinitiva(a: MediaAsset) {
  await biblioteca.guardar(a.id, { tags: (a.tags ?? []).filter((t) => t !== 'provisional') })
}

const esProvisional = (a: MediaAsset) => (a.tags ?? []).includes('provisional')

const kb = (b: number) => `${Math.round(b / 1024).toLocaleString('es')} KB`
const versiones = (a: MediaAsset) => a.renditions.images.length + a.renditions.videos.length
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
  <div class="space-y-8">
    <!-- ── Una línea: cuántas hay, buscar, subir ─────────────────────────── -->
    <header class="flex flex-wrap items-center gap-x-8 gap-y-4">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        {{ biblioteca.assets.value.length }}
        {{ biblioteca.assets.value.length === 1 ? 'imagen' : 'imágenes' }}
      </p>

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

    <!-- ── La galería, sin dividir ───────────────────────────────────────── -->
    <p
      v-if="biblioteca.estado.value === 'cargando'"
      class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
    >
      Cargando…
    </p>

    <p v-else-if="!lista.length" class="max-w-prose text-sm leading-relaxed text-muted-foreground">
      {{
        busqueda
          ? 'Nada coincide con esa búsqueda.'
          : 'La biblioteca está vacía. Subí la primera con «Subir archivo».'
      }}
    </p>

    <ul v-else class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <li v-for="a in lista" :key="a.id">
        <button type="button" class="group w-full text-left" @click="abrir(a)">
          <span
            class="relative block overflow-hidden rounded-md border border-border transition-colors duration-200 group-hover:border-primary"
            :style="{ aspectRatio: String(a.intrinsic.aspectRatio) }"
          >
            <ResponsiveImage
              :media-id="a.id"
              :resolver="resolver"
              alt=""
              sizes="(min-width: 1280px) 200px, (min-width: 640px) 28vw, 45vw"
            />
          </span>
          <span class="mt-2 block truncate text-sm text-foreground">{{ a.title }}</span>
          <span
            v-if="esProvisional(a)"
            class="block font-mono text-[0.55rem] uppercase tracking-[0.2em] text-primary"
          >
            provisional
          </span>
        </button>
      </li>
    </ul>

    <!-- ── La ficha, en diálogo ──────────────────────────────────────────── -->
    <BaseModal
      :open="!!abierto"
      :title="abierto?.title ?? ''"
      eyebrow="Imagen"
      size="wide"
      close-label="Cerrar la ficha de la imagen"
      @close="cerrar"
    >
      <div v-if="abierto" class="space-y-8">
        <div
          class="overflow-hidden rounded-md border border-border"
          :style="{ aspectRatio: String(abierto.intrinsic.aspectRatio) }"
        >
          <ResponsiveImage
            :media-id="abierto.id"
            :resolver="resolver"
            :alt="abierto.alt ?? ''"
            sizes="(min-width: 1024px) 60vw, 90vw"
          />
        </div>

        <!--
          Cada dato con su etiqueta encima y su valor debajo. La primera
          versión los ponía en línea («Tamaño 1920x1080») y se leían pegados.
        -->
        <dl class="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <dt class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              Tamaño
            </dt>
            <dd class="mt-1.5 text-base text-foreground">
              {{ abierto.intrinsic.width }} × {{ abierto.intrinsic.height }}
            </dd>
          </div>
          <div>
            <dt class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              Versiones
            </dt>
            <dd class="mt-1.5 text-base text-foreground">{{ versiones(abierto) }}</dd>
          </div>
          <div>
            <dt class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              Peso
            </dt>
            <dd class="mt-1.5 text-base text-foreground">{{ kb(pesoTotal(abierto)) }}</dd>
          </div>
          <div>
            <dt class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              Original
            </dt>
            <dd class="mt-1.5 text-base text-foreground">{{ kb(abierto.source.bytes) }}</dd>
          </div>
        </dl>

        <!--
          Dónde se usa. Determina si se puede borrar, así que va antes de los
          botones y no escondido al final.
        -->
        <div class="border-t border-border pt-6">
          <p class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
            {{
              biblioteca.usosDe(abierto.id).length
                ? `En uso en ${biblioteca.usosDe(abierto.id).length} ${
                    biblioteca.usosDe(abierto.id).length === 1 ? 'sitio' : 'sitios'
                  }`
                : 'No se usa en ningún sitio'
            }}
          </p>
          <ul v-if="biblioteca.usosDe(abierto.id).length" class="mt-2 space-y-1">
            <li
              v-for="(u, i) in biblioteca.usosDe(abierto.id)"
              :key="`${u.coleccion}-${u.documento}-${i}`"
              class="truncate text-base text-foreground"
            >
              {{ u.etiqueta }}
            </li>
          </ul>
        </div>

        <form
          id="ficha-medio"
          class="space-y-7 border-t border-border pt-6"
          @submit.prevent="guardar"
        >
          <label class="block">
            <span
              class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
            >
              Título
            </span>
            <input v-model="forma.title" type="text" :class="CONTROL" class="mt-2" />
          </label>

          <label class="block">
            <span
              class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground"
            >
              Qué se ve en la imagen
              <span class="normal-case tracking-normal opacity-60">opcional</span>
            </span>
            <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              Lo lee quien no puede ver la foto, y los buscadores. La imagen se publica igual sin
              esto.
            </p>
            <textarea
              v-model="forma.alt"
              rows="3"
              placeholder="Una modelo de perfil contra una pared de cemento, luz lateral dura."
              :class="CONTROL"
              class="mt-2 resize-y"
            />
          </label>

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
              ffmpeg no escribe EXIF en imágenes, así que `-metadata copyright`
              no sobrevive al re-encode.
            -->
            <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              No viaja dentro del archivo: se muestra en la web desde acá.
            </p>
          </label>

          <button
            v-if="esProvisional(abierto)"
            type="button"
            class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
            @click="confirmarDefinitiva(abierto)"
          >
            Esta ya no es provisional
          </button>
        </form>
      </div>

      <!--
        El footer del diálogo: fuera del scroll, siempre visible. Antes era un
        `sticky bottom-0` dentro del cuerpo, que flota sobre el contenido en
        vez de ser parte del marco.
      -->
      <template v-if="abierto" #footer>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <button
            type="submit"
            form="ficha-medio"
            :disabled="guardando"
            class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary disabled:opacity-50"
          >
            {{ guardando ? 'Guardando…' : 'Guardar' }}
          </button>

          <span
            v-if="guardado"
            class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Guardado
          </span>

          <!-- Borrar queda a la derecha: es lo único que no se puede deshacer. -->
          <template v-if="!biblioteca.usosDe(abierto.id).length">
            <button
              v-if="!confirmandoBorrado"
              type="button"
              class="ms-auto font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
              @click="confirmandoBorrado = true"
            >
              Borrar
            </button>
            <span v-else class="ms-auto flex flex-wrap items-center gap-4">
              <span
                class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
              >
                ¿Borrar esta imagen y sus {{ versiones(abierto) }} versiones?
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
          <span
            v-else
            class="ms-auto max-w-xs text-sm leading-relaxed text-muted-foreground sm:text-right"
          >
            Para borrarla, quitala primero de donde se usa.
          </span>
        </div>
      </template>
    </BaseModal>
  </div>
</template>
