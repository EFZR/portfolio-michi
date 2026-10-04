<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { emptyDoc, t, type SchemaDoc } from '@princess/content'
import FormularioDinamico from '@/components/FormularioDinamico.vue'
import { useCollection, type Fila } from '@/composables/useCollection'
import { useSchema } from '@/composables/useSchema'

/**
 * PANTALLA 6/7 — PORTAFOLIO.
 *
 * Índice editorial y ficha. Ni un campo de la ficha está escrito aquí: sale del
 * esquema `project`, igual que la configuración global. Lo único propio de esta
 * pantalla es el listado, el filtro y el orden — que son datos, no formulario.
 */

const proyectos = useCollection('projects', 'order')
const rubros = useCollection('categories', 'order')
const { cargar: cargarEsquema, error: errorEsquema } = useSchema()

const esquema = shallowRef<SchemaDoc | null>(null)
const editando = ref<Fila | null>(null)
/** `true` mientras se crea uno nuevo: el slug aún no es el id de nada. */
const esNuevo = ref(false)
const filtro = ref<string>('todos')
const aviso = ref('')
const guardando = ref(false)

const pad = (n: number) => String(n).padStart(2, '0')
const texto = (v: unknown) => t(v as { es: string; en?: string } | string | undefined)

const visibles = computed(() =>
  filtro.value === 'todos'
    ? proyectos.filas.value
    : proyectos.filas.value.filter((p) => p.category === filtro.value),
)

const nombreRubro = (id: unknown) =>
  texto(rubros.filas.value.find((r) => r.id === id)?.name) || String(id ?? '')

onMounted(async () => {
  esquema.value = await cargarEsquema('project')
  await Promise.all([proyectos.cargar(), rubros.cargar()])
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
  // El orden nuevo va al final; el resto lo rellena el esquema.
  editando.value = {
    ...emptyDoc(esquema.value),
    id: '',
    order: proyectos.filas.value.length,
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
    await proyectos.guardar(slug, payload, anterior)
    aviso.value =
      anterior && anterior !== slug
        ? `Guardado como "${slug}". La URL anterior (/projects/${anterior}) deja de funcionar.`
        : 'Guardado. Se verá en la web en el próximo despliegue.'
    editando.value = null
    esNuevo.value = false
  } catch (e) {
    const code = (e as { code?: string }).code ?? String(e)
    aviso.value =
      code === 'permission-denied'
        ? 'Firestore rechazó la escritura. ¿La sesión sigue abierta?'
        : `No se pudo guardar (${code}).`
  } finally {
    guardando.value = false
  }
}

async function borrar(fila: Fila) {
  // Sin diálogo del navegador: bloquea el webview de Tauri. Se confirma con un
  // segundo clic sobre el mismo botón (ver `porBorrar`).
  await proyectos.borrar(String(fila.id))
  aviso.value = `Se borró "${texto(fila.title)}".`
  porBorrar.value = ''
}

const porBorrar = ref('')

async function mover(i: number, delta: number) {
  const orden = visibles.value.map((p) => String(p.id))
  const destino = i + delta
  if (destino < 0 || destino >= orden.length) return
  ;[orden[i], orden[destino]] = [orden[destino], orden[i]]
  await proyectos.reordenar(orden)
}
</script>

<template>
  <!-- ─────────────────────────── LA FICHA ─────────────────────────── -->
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
        Portafolio<span class="mx-2 text-border">·</span>{{ esNuevo ? 'Nueva ficha' : 'Ficha' }}
      </p>
      <h2
        class="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none tracking-tight"
      >
        {{ esNuevo ? 'Proyecto nuevo' : texto(editando.title) || 'Sin título' }}
      </h2>
    </header>

    <div class="pt-10">
      <FormularioDinamico
        :key="String(editando.id) || 'nuevo'"
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
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-primary">Portafolio</p>
        <h2
          class="mt-3 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none tracking-tight"
        >
          {{ visibles.length }}
          <span class="text-muted-foreground">
            {{ visibles.length === 1 ? 'ficha' : 'fichas' }}
          </span>
        </h2>
      </div>

      <button
        type="button"
        class="group flex items-center gap-3 border-b border-foreground py-2 font-mono text-[0.7rem] uppercase tracking-[0.3em] transition-colors duration-300 hover:border-primary hover:text-primary"
        @click="crear"
      >
        Nuevo proyecto
        <span aria-hidden="true" class="transition-transform duration-300 group-hover:translate-x-1"
          >+</span
        >
      </button>
    </header>

    <!-- Filtro por rubro: los mismos tres oficios que la web. -->
    <div class="mt-6 flex flex-wrap items-center gap-6">
      <button
        v-for="op in [{ id: 'todos', name: 'Todos' }, ...rubros.filas.value]"
        :key="String(op.id)"
        type="button"
        class="font-mono text-[0.65rem] uppercase tracking-[0.25em] transition-colors duration-200"
        :class="filtro === op.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="filtro = String(op.id)"
      >
        {{ op.id === 'todos' ? 'Todos' : nombreRubro(op.id) }}
        <span v-if="filtro === op.id" aria-hidden="true" class="ms-1">·</span>
      </button>
    </div>

    <p
      v-if="proyectos.cargando.value"
      class="mt-10 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground"
    >
      Cargando…
    </p>
    <p
      v-else-if="proyectos.error.value || errorEsquema"
      role="alert"
      class="mt-10 text-sm font-medium text-primary"
    >
      {{ proyectos.error.value || errorEsquema }}
    </p>

    <ul v-else class="mt-10 border-t border-border">
      <li v-for="(p, i) in visibles" :key="String(p.id)">
        <div
          class="group/f grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b border-border py-5 transition-colors duration-300"
        >
          <span class="font-mono text-xs tracking-[0.2em] text-muted-foreground">{{
            pad(i + 1)
          }}</span>

          <button type="button" class="min-w-0 text-left" @click="abrir(p)">
            <span
              class="font-heading text-xl font-semibold tracking-tight transition-colors duration-300 group-hover/f:text-primary sm:text-2xl"
            >
              {{ texto(p.title) || 'Sin título' }}
            </span>
            <span
              class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
            >
              <span>{{ nombreRubro(p.category) }}</span>
              <span aria-hidden="true" class="text-border">·</span>
              <span>{{ p.year }}</span>
              <span aria-hidden="true" class="text-border">·</span>
              <span class="normal-case tracking-normal">{{ p.id }}</span>
              <span v-if="p.draft" class="text-primary">· borrador</span>
            </span>
          </button>

          <!-- Controles: solo aparecen al acercarse a la fila. -->
          <span
            class="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/f:opacity-100 focus-within:opacity-100"
          >
            <button
              type="button"
              :disabled="i === 0 || filtro !== 'todos'"
              aria-label="Subir"
              class="px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-primary disabled:opacity-25"
              @click="mover(i, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              :disabled="i === visibles.length - 1 || filtro !== 'todos'"
              aria-label="Bajar"
              class="px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-primary disabled:opacity-25"
              @click="mover(i, 1)"
            >
              ↓
            </button>
            <!--
              Borrar pide dos clics en vez de un `confirm()`: los diálogos
              nativos BLOQUEAN el webview de Tauri, y además el segundo clic
              sobre un botón que ya dice "¿Seguro?" es tan explícito como un
              modal y no interrumpe.
            -->
            <button
              type="button"
              class="ms-2 px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] transition-colors duration-200"
              :class="
                porBorrar === p.id ? 'text-primary' : 'text-muted-foreground hover:text-primary'
              "
              @click="porBorrar === p.id ? borrar(p) : (porBorrar = String(p.id))"
              @blur="porBorrar = ''"
            >
              {{ porBorrar === p.id ? '¿Seguro?' : 'Borrar' }}
            </button>
          </span>
        </div>
      </li>
    </ul>

    <p
      v-if="filtro !== 'todos'"
      class="mt-6 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
    >
      El orden solo se puede cambiar sin filtro
    </p>

    <p
      v-if="aviso"
      role="status"
      class="mt-8 border-l-2 border-primary py-2 ps-4 text-sm text-muted-foreground"
    >
      {{ aviso }}
    </p>
  </div>
</template>
