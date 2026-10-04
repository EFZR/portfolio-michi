<script setup lang="ts">
import { ICONOS } from './iconos'

export interface Seccion {
  id: string
  label: string
  icono: keyof typeof ICONOS | string
  listo: boolean
}

defineProps<{ secciones: readonly Seccion[]; activa: string }>()
const emit = defineEmits<{ ir: [id: string] }>()
</script>

<template>
  <!--
    RAÍL — colapsado 4rem, expandido 14rem al hover.

    SIN SALTO DE LAYOUT, y esa es la única decisión estructural que importa
    aquí: el <aside> reserva SIEMPRE 4rem en el flujo, y lo que crece es una
    capa `absolute` por encima del contenido. Si el raíl empujara la columna
    principal, cada vez que el cursor lo rozara de paso la pantalla entera
    daría un tirón — que es exactamente lo que pasa en la mayoría de paneles
    con este patrón.
  -->
  <!--
    `sticky` a la altura de la ventana, no del documento. Antes el raíl medía lo
    que medía el contenido, así que en una página larga su pie —y con él el
    lomo— quedaba por debajo del pliegue. Además la navegación no debe irse con
    el scroll.
  -->
  <aside class="group sticky top-16 z-30 h-[calc(100vh-4rem)] w-16 shrink-0 self-start">
    <div
      class="absolute inset-y-0 left-0 flex w-16 flex-col overflow-hidden border-r border-border bg-background transition-[width,box-shadow] duration-300 ease-out group-hover:w-56 group-hover:shadow-[8px_0_32px_-24px_rgba(10,10,10,0.45)]"
    >
      <nav class="flex-1 py-4" aria-label="Secciones del panel">
        <ul>
          <li v-for="(seccion, i) in secciones" :key="seccion.id">
            <button
              type="button"
              :disabled="!seccion.listo"
              :aria-current="activa === seccion.id ? 'page' : undefined"
              class="relative flex h-12 w-full items-center text-left transition-colors duration-200 disabled:opacity-30"
              :class="
                activa === seccion.id
                  ? 'text-foreground'
                  : 'text-muted-foreground enabled:hover:text-foreground'
              "
              @click="seccion.listo && emit('ir', seccion.id)"
            >
              <!--
                Indicador activo: un filete UV de 2px pegado al canto, no un
                fondo de color. En una página hecha de reglas finas, el acento
                tiene que ser otra regla — un bloque relleno se lee como un
                botón y rompe la métrica.
              -->
              <span
                aria-hidden="true"
                class="absolute inset-y-2 left-0 w-0.5 origin-center bg-primary transition-transform duration-300 ease-out"
                :class="activa === seccion.id ? 'scale-y-100' : 'scale-y-0'"
              />

              <span class="grid w-16 shrink-0 place-items-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.25"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-[1.15rem] w-[1.15rem] transition-transform duration-300 ease-out"
                  :class="activa === seccion.id ? 'scale-110' : ''"
                  aria-hidden="true"
                >
                  <path :d="ICONOS[seccion.icono] ?? ICONOS.sumario" />
                </svg>
              </span>

              <!--
                Las etiquetas entran escalonadas (40ms por fila). Es la única
                animación "de lujo" del raíl y dura lo que dura el despliegue:
                escalonarlas hace que la barra se lea como algo que se ABRE, no
                como una caja que aparece.
              -->
              <span
                class="overflow-hidden whitespace-nowrap text-sm opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 -translate-x-1"
                :style="{ transitionDelay: `${60 + i * 40}ms` }"
              >
                {{ seccion.label }}
                <span
                  v-if="!seccion.listo"
                  class="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
                  >pronto</span
                >
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <!--
        LOMO. El nombre del producto escrito en vertical al pie del raíl, como
        el lomo de una revista en una estantería. Es el detalle que hace que
        esto no parezca un panel de administración genérico.
      -->
      <div class="mt-auto flex shrink-0 justify-center py-6">
        <span
          aria-hidden="true"
          class="font-mono text-[0.55rem] uppercase tracking-[0.3em] text-muted-foreground/50 [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180"
        >
          Princess
        </span>
      </div>
    </div>
  </aside>
</template>
