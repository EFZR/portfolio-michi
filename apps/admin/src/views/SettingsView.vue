<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getFirestoreDb, type SchemaDoc } from '@princess/content'
import FormularioDinamico from '@/components/FormularioDinamico.vue'
import { useSchema } from '@/composables/useSchema'

/**
 * CONFIGURACIÓN GLOBAL — doble página de revista.
 *
 * Columna estrecha a la izquierda con el índice de secciones (la "portadilla"),
 * columna ancha a la derecha con el formulario. Ni un campo está escrito aquí:
 * todo sale de los esquemas.
 *
 * Un grupo por pantalla, y no es solo composición: con 94 inputs montados a la
 * vez, escribir en uno obliga a Vue a comparar los otros 93 en cada pulsación.
 */

const GRUPOS = [
  { id: 'site', label: 'Sitio' },
  { id: 'routes', label: 'Títulos de pestaña' },
  { id: 'nav', label: 'Navegación' },
  { id: 'hero', label: 'Hero' },
  { id: 'about', label: 'Sobre mí' },
  { id: 'services', label: 'Servicios' },
  { id: 'contact', label: 'Contacto (portada)' },
  { id: 'contactPage', label: 'Página de contacto' },
  { id: 'form', label: 'Formulario' },
  { id: 'portfolio', label: 'Portafolio' },
  { id: 'blog', label: 'Blog' },
  { id: 'footer', label: 'Pie de página' },
  { id: 'notFound', label: 'Página 404' },
] as const

const { cargar, fuente, error: errorEsquema, cargando } = useSchema()

const activo = ref<string>('hero')
const esquema = shallowRef<SchemaDoc | null>(null)
const valores = shallowRef<Record<string, unknown>>({})
const guardando = ref(false)
const aviso = ref('')

const pad = (n: number) => String(n).padStart(2, '0')
const indice = computed(() => GRUPOS.findIndex((g) => g.id === activo.value) + 1)

async function abrir(id: string) {
  activo.value = id
  aviso.value = ''
  esquema.value = null

  const doc_ = await cargar(id)
  if (!doc_) return

  const snap = await getDoc(doc(getFirestoreDb(import.meta.env), 'config', 'ui'))
  const todo = (snap.data() ?? {}) as Record<string, unknown>
  const prefijo = doc_.target.prefix ?? id

  valores.value = (todo[prefijo] ?? {}) as Record<string, unknown>
  esquema.value = doc_
}

async function guardar(payload: Record<string, unknown>) {
  const doc_ = esquema.value
  if (!doc_) return

  guardando.value = true
  aviso.value = ''
  try {
    const prefijo = doc_.target.prefix ?? activo.value
    // `merge` para no pisar los otros doce grupos del mismo documento.
    await setDoc(
      doc(getFirestoreDb(import.meta.env), 'config', 'ui'),
      { [prefijo]: payload },
      { merge: true },
    )
    valores.value = payload
    aviso.value = 'Guardado. Se verá en la web en el próximo despliegue.'
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

onMounted(() => abrir(activo.value))
</script>

<template>
  <div class="mx-auto grid max-w-6xl gap-x-12 gap-y-10 lg:grid-cols-12">
    <!-- PORTADILLA — el índice de grupos. -->
    <nav aria-label="Secciones de la web" class="lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground">
        Secciones
      </p>
      <ul class="mt-5 border-t border-border">
        <li v-for="(grupo, i) in GRUPOS" :key="grupo.id">
          <button
            type="button"
            :aria-current="activo === grupo.id ? 'true' : undefined"
            class="group/g flex w-full items-baseline gap-3 border-b border-border py-2.5 text-left transition-colors duration-200"
            :class="activo === grupo.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="abrir(grupo.id)"
          >
            <span
              class="font-mono text-[0.65rem] tracking-[0.2em]"
              :class="activo === grupo.id ? 'text-primary' : 'text-muted-foreground/60'"
            >
              {{ pad(i + 1) }}
            </span>
            <span class="text-sm">{{ grupo.label }}</span>
            <span
              aria-hidden="true"
              class="ms-auto h-px w-4 origin-right bg-primary transition-transform duration-300 ease-out"
              :class="activo === grupo.id ? 'scale-x-100' : 'scale-x-0'"
            />
          </button>
        </li>
      </ul>
    </nav>

    <!-- CUERPO — el formulario. -->
    <div class="lg:col-span-8 lg:col-start-5">
      <p
        v-if="cargando"
        class="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground"
      >
        Cargando esquema…
      </p>

      <p v-else-if="errorEsquema" role="alert" class="text-sm font-medium text-primary">
        {{ errorEsquema }}
      </p>

      <template v-else-if="esquema">
        <header class="border-b border-border pb-8">
          <p class="font-mono text-[0.65rem] tracking-[0.3em] text-muted-foreground">
            {{ pad(indice) }}<span class="mx-1 text-border">/</span>{{ pad(GRUPOS.length) }}
          </p>
          <h2
            class="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none tracking-tight"
          >
            {{ esquema.label }}
          </h2>
          <p
            v-if="esquema.description"
            class="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground"
          >
            {{ esquema.description }}
          </p>
          <p class="mt-5 font-mono text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
            v{{ esquema.version }}
            <span class="mx-2 text-border">·</span>
            <!-- Si el esquema salió del espejo hay que decirlo: significa que no
                 hay red y que puede estar atrasado respecto de Firestore. -->
            <span :class="fuente === 'espejo' ? 'text-primary' : ''">{{ fuente }}</span>
          </p>
        </header>

        <div class="pt-10">
          <FormularioDinamico
            :key="esquema.id"
            :esquema="esquema"
            :inicial="valores"
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
      </template>
    </div>
  </div>
</template>
