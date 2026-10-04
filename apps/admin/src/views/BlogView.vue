<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { emptyDoc, t, type SchemaDoc } from '@princess/content'
import FormularioDinamico from '@/components/FormularioDinamico.vue'
import { useCollection, type Fila } from '@/composables/useCollection'
import { useSchema } from '@/composables/useSchema'

/**
 * PANTALLA 4/5 — BLOG.
 *
 * Índice y editor. La ficha entera —incluido el editor de bloques— sale del
 * esquema `article`; aquí solo vive el listado y las dos reglas que no caben en
 * un documento suelto: que haya EXACTAMENTE un destacado y que no se repitan
 * los slugs.
 */

const articulos = useCollection('articles')
const { cargar: cargarEsquema, error: errorEsquema } = useSchema()

const esquema = shallowRef<SchemaDoc | null>(null)
const editando = ref<Fila | null>(null)
const esNuevo = ref(false)
const aviso = ref('')
const guardando = ref(false)
const porBorrar = ref('')

const pad = (n: number) => String(n).padStart(2, '0')
const texto = (v: unknown) => t(v as { es: string; en?: string } | string | undefined)

/** Del más reciente al más antiguo: la prioridad decide la FORMA, no el sitio. */
const ordenados = computed(() =>
  [...articulos.filas.value].sort((a, b) =>
    String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')),
  ),
)

/**
 * Regla de colección: exactamente un destacado. No se puede comprobar
 * validando un documento suelto, así que se vigila aquí y se avisa en el
 * índice — que es donde se ve el conjunto.
 */
const destacados = computed(() =>
  articulos.filas.value.filter((a) => a.priority === 'hero' && !a.draft),
)
const avisoDestacados = computed(() => {
  const n = destacados.value.length
  if (n === 1) return ''
  return n === 0
    ? 'Ningún artículo está marcado como destacado: la portada del blog se queda sin pieza grande.'
    : `Hay ${n} artículos destacados; solo debería haber uno.`
})

const fecha = (iso: unknown) => {
  const v = String(iso ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '—'
  const [a, m, d] = v.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

onMounted(async () => {
  esquema.value = await cargarEsquema('article')
  await articulos.cargar()
})

function abrir(fila: Fila) {
  aviso.value = ''
  esNuevo.value = false
  editando.value = fila
}

function crear() {
  if (!esquema.value) return
  aviso.value = ''
  esNuevo.value = true
  editando.value = {
    ...emptyDoc(esquema.value),
    id: '',
    content: [],
    likesCount: 0,
    priority: 'normal',
    publishedAt: new Date().toISOString().slice(0, 10),
    draft: true,
  } as Fila
}

async function guardar(payload: Record<string, unknown>) {
  const actual = editando.value
  if (!actual) return

  const slug = String(payload.slug ?? '')
  if (!slug) {
    aviso.value = 'Falta el slug: es el identificador del documento.'
    return
  }

  guardando.value = true
  aviso.value = ''
  try {
    const anterior = esNuevo.value ? undefined : String(actual.id)
    /*
      `likesCount` se reenvía TAL CUAL, no se quita.

      La tentación es omitirlo, porque es del público y la admin no debe
      tocarlo. Pero el guardado escribe el documento entero (`merge: false`):
      omitir el campo no lo deja como estaba, lo BORRA — y para la regla
      `!changedKeys().hasAny(['likesCount'])` un borrado es un cambio, así que
      Firestore rechazaría la escritura completa con `permission-denied`.

      Reenviar el mismo valor hace que el `diff` no lo vea, que es justo lo que
      la regla pide: que la admin no lo altere.
    */
    const datos = esNuevo.value
      ? { ...payload, likesCount: 0 }
      : { ...payload, likesCount: actual.likesCount ?? 0 }

    await articulos.guardar(slug, datos, anterior)
    aviso.value =
      anterior && anterior !== slug
        ? `Guardado como "${slug}". La URL anterior (/blog/${anterior}) deja de funcionar.`
        : 'Guardado. Se verá en la web en el próximo despliegue.'
    editando.value = null
    esNuevo.value = false
  } catch (e) {
    const code = (e as { code?: string }).code ?? String(e)
    aviso.value =
      code === 'permission-denied'
        ? 'Firestore rechazó la escritura. Si tocaste los likes, ese campo es de solo lectura.'
        : `No se pudo guardar (${code}).`
  } finally {
    guardando.value = false
  }
}

async function borrar(fila: Fila) {
  await articulos.borrar(String(fila.id))
  aviso.value = `Se borró "${texto(fila.title)}".`
  porBorrar.value = ''
}
</script>

<template>
  <!-- ─────────────────────────── EL EDITOR ─────────────────────────── -->
  <div v-if="editando && esquema" class="mx-auto max-w-4xl">
    <button
      type="button"
      class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground transition-colors duration-200 hover:text-primary"
      @click="editando = null"
    >
      ← Volver al índice
    </button>

    <header class="mt-8 border-b border-border pb-8">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
        Blog<span class="mx-2 text-border">·</span>{{ esNuevo ? 'Nueva nota' : 'Nota' }}
        <span v-if="editando.draft" class="ms-2 text-primary">· borrador</span>
      </p>
      <h2
        class="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none tracking-tight"
      >
        {{ esNuevo ? 'Nota nueva' : texto(editando.title) || 'Sin título' }}
      </h2>
    </header>

    <div class="pt-10">
      <FormularioDinamico
        :key="String(editando.id) || 'nueva'"
        :esquema="esquema"
        :inicial="editando"
        @guardar="guardar"
      />
    </div>

    <p
      v-if="aviso"
      role="status"
      class="mt-8 border-l-2 border-primary py-2 ps-4 text-sm text-muted-foreground"
    >
      {{ guardando ? 'Guardando…' : aviso }}
    </p>
  </div>

  <!-- ────────────────────────── EL ÍNDICE ────────────────────────── -->
  <div v-else class="mx-auto max-w-6xl">
    <header class="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
      <div>
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-primary">Blog</p>
        <h2
          class="mt-3 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none tracking-tight"
        >
          {{ ordenados.length }}
          <span class="text-muted-foreground">{{ ordenados.length === 1 ? 'nota' : 'notas' }}</span>
        </h2>
      </div>

      <button
        type="button"
        class="group flex items-center gap-3 border-b border-foreground py-2 font-mono text-[0.7rem] uppercase tracking-[0.3em] transition-colors duration-300 hover:border-primary hover:text-primary"
        @click="crear"
      >
        Nota nueva
        <span aria-hidden="true" class="transition-transform duration-300 group-hover:translate-x-1"
          >+</span
        >
      </button>
    </header>

    <!-- La regla de colección, vigilada donde se ve el conjunto. -->
    <p
      v-if="avisoDestacados"
      role="status"
      class="mt-6 border-l-2 border-primary py-2 ps-4 text-sm text-muted-foreground"
    >
      {{ avisoDestacados }}
    </p>

    <p
      v-if="articulos.cargando.value"
      class="mt-10 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground"
    >
      Cargando…
    </p>
    <p
      v-else-if="articulos.error.value || errorEsquema"
      role="alert"
      class="mt-10 text-sm font-medium text-primary"
    >
      {{ articulos.error.value || errorEsquema }}
    </p>

    <ul v-else class="mt-10 border-t border-border">
      <li v-for="(a, i) in ordenados" :key="String(a.id)">
        <div
          class="group/f grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b border-border py-5"
        >
          <span class="font-mono text-xs tracking-[0.2em] text-muted-foreground">{{
            pad(i + 1)
          }}</span>

          <button type="button" class="min-w-0 text-left" @click="abrir(a)">
            <span
              class="font-heading text-xl font-semibold tracking-tight transition-colors duration-300 group-hover/f:text-primary sm:text-2xl"
            >
              {{ texto(a.title) || 'Sin título' }}
            </span>
            <span
              class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
            >
              <!-- La jerarquía decide la FORMA de la tarjeta en la web. -->
              <span v-if="a.priority === 'hero'" class="text-primary">Destacado</span>
              <span v-else-if="a.priority === 'high'">Alta</span>
              <span v-else>Normal</span>
              <span aria-hidden="true" class="text-border">·</span>
              <span>{{ fecha(a.publishedAt) }}</span>
              <span aria-hidden="true" class="text-border">·</span>
              <span>{{ Array.isArray(a.content) ? a.content.length : 0 }} bloques</span>
              <span aria-hidden="true" class="text-border">·</span>
              <span class="normal-case tracking-normal">{{ a.id }}</span>
              <span v-if="a.draft" class="text-primary">· borrador</span>
            </span>
          </button>

          <span
            class="flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover/f:opacity-100 focus-within:opacity-100"
          >
            <span class="font-mono text-[0.65rem] tabular-nums text-muted-foreground">
              ♥ {{ a.likesCount ?? 0 }}
            </span>
            <button
              type="button"
              class="ms-2 px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] transition-colors duration-200"
              :class="
                porBorrar === a.id ? 'text-primary' : 'text-muted-foreground hover:text-primary'
              "
              @click="porBorrar === a.id ? borrar(a) : (porBorrar = String(a.id))"
              @blur="porBorrar = ''"
            >
              {{ porBorrar === a.id ? '¿Seguro?' : 'Borrar' }}
            </button>
          </span>
        </div>
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
