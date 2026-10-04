<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/shell/AppShell.vue'
import AvisoToolchain from '@/components/shell/AvisoToolchain.vue'
import type { Seccion } from '@/components/shell/RailNav.vue'
import SumarioView from './SumarioView.vue'
import SettingsView from './SettingsView.vue'
import ProjectsView from './ProjectsView.vue'
import BlogView from './BlogView.vue'
import InboxView from './InboxView.vue'
import MediaView from './MediaView.vue'
import { useSession } from '@/composables/useSession'
import { useUpdater } from '@/composables/useUpdater'
import { useToolchain } from '@/composables/useToolchain'
import contenido from '@web/data/content.json'

const { usuario, salir } = useSession()

const SECCIONES: readonly Seccion[] = [
  { id: 'sumario', label: 'Sumario', icono: 'sumario', listo: true },
  { id: 'settings', label: 'Configuración global', icono: 'settings', listo: true },
  { id: 'projects', label: 'Portafolio', icono: 'projects', listo: true },
  { id: 'blog', label: 'Blog', icono: 'blog', listo: true },
  { id: 'media', label: 'Biblioteca', icono: 'media', listo: true },
  { id: 'inbox', label: 'Bandeja', icono: 'inbox', listo: true },
]

const activa = ref('sumario')

/**
 * Cifras de la edición. Salen del `content.json` que el prebuild de la web dejó
 * en el repo — no de una consulta nueva. Es la misma foto que se publicó, que
 * es justo lo que interesa mirar desde aquí.
 */
const estado = computed(() => {
  const c = contenido as {
    fetchedAt: string
    projects: unknown[]
    articles: unknown[]
    categories: unknown[]
    ui: Record<string, unknown>
  }
  const claves = Object.values(c.ui).reduce<number>(
    (n, grupo) => n + Object.keys((grupo ?? {}) as object).length,
    0,
  )
  return [
    { etiqueta: 'Proyectos', valor: String(c.projects.length) },
    { etiqueta: 'Artículos', valor: String(c.articles.length) },
    { etiqueta: 'Rubros', valor: String(c.categories.length) },
    { etiqueta: 'Textos de interfaz', valor: String(claves) },
    {
      etiqueta: 'Última bajada',
      valor: new Date(c.fetchedAt).toLocaleDateString('es', {
        day: '2-digit',
        month: 'short',
      }),
    },
  ]
})

const folio = computed(() =>
  new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' }).toUpperCase(),
)

const actualizacion = useUpdater()
const toolchain = useToolchain()

/**
 * Las dos comprobaciones de arranque. No se esperan la una a la otra: son
 * independientes y ninguna debe retrasar la pintada del panel.
 *
 * El sondeo de ffmpeg es el R1 del pipeline de medios: saber qué se va a poder
 * generar ANTES de que alguien invierta el tiempo de subir una foto de 30 MB.
 */
onMounted(() => {
  void actualizacion.buscar()
  void toolchain.sondear()
})
</script>

<template>
  <AppShell
    :secciones="SECCIONES"
    :activa="activa"
    :email="usuario?.email ?? ''"
    :folio="folio"
    @ir="activa = $event"
    @salir="salir"
  >
    <!--
      Aviso de actualización: una banda a todo el ancho bajo la mancheta, no un
      diálogo. Solo aparece cuando hay algo que hacer — «al día», «sin red» y
      «esto no es la app nativa» se callan, porque no hay nada que el usuario
      pueda hacer con esa información.
    -->
    <template #aviso>
      <!-- Primero el toolchain: condiciona si se puede trabajar, no solo si hay versión nueva. -->
      <AvisoToolchain />

      <div
        v-if="['disponible', 'descargando'].includes(actualizacion.estado.value)"
        class="flex items-center justify-between gap-6 border-b border-primary bg-primary-soft/40 px-8 py-3"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em]">
          Versión nueva disponible · v{{ actualizacion.version.value }}
          <span v-if="actualizacion.estado.value === 'descargando'" class="ml-2 text-primary">
            {{ actualizacion.progreso.value }}%
          </span>
        </p>
        <button
          type="button"
          :disabled="actualizacion.estado.value === 'descargando'"
          class="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary disabled:opacity-50"
          @click="actualizacion.instalarYReiniciar()"
        >
          Instalar y reiniciar
        </button>
      </div>
    </template>

    <SumarioView
      v-if="activa === 'sumario'"
      :secciones="SECCIONES"
      :estado="estado"
      @ir="activa = $event"
    />
    <SettingsView v-else-if="activa === 'settings'" />
    <ProjectsView v-else-if="activa === 'projects'" />
    <BlogView v-else-if="activa === 'blog'" />
    <MediaView v-else-if="activa === 'media'" />
    <InboxView v-else-if="activa === 'inbox'" />
  </AppShell>
</template>
