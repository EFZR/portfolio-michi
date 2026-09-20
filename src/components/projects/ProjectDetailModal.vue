<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import { nombreCategoria, type Proyecto } from '@/data/proyectos'

interface Props {
  open: boolean
  /**
   * Proyecto mostrado. Es nullable porque al montar la sección todavía no hay
   * ninguno elegido. OJO: el padre NO debe volver a ponerlo en `null` al
   * cerrar — si lo hiciera, el contenido desaparecería de golpe y se perdería
   * la animación de salida del diálogo. Se cierra con `open = false` y el
   * proyecto se queda hasta que se abra otro.
   */
  proyecto: Proyecto | null
}

const { open, proyecto } = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

/**
 * Nombre accesible y kicker del diálogo. Se calculan con fallback porque
 * `BaseModal` se monta SIEMPRE (ver el comentario del template) y en el primer
 * render todavía no hay proyecto elegido.
 */
const titulo = computed(() => proyecto?.titulo ?? '')
const kicker = computed(() =>
  proyecto ? `${nombreCategoria(proyecto.categoria)} · ${proyecto.anio}` : '',
)

/**
 * Ficha técnica. Se arma como lista de pares para poder pintarla con un único
 * `v-for` sobre un `<dl>` — añadir un dato nuevo (presupuesto, agencia) es
 * meter una línea aquí, no tocar el template.
 */
const ficha = computed(() => {
  if (!proyecto) return []
  return [
    { etiqueta: 'Cliente', valor: proyecto.cliente },
    { etiqueta: 'Año', valor: String(proyecto.anio) },
    { etiqueta: 'Rol', valor: proyecto.rol },
    { etiqueta: 'Locación', valor: proyecto.locacion },
  ]
})
</script>

<template>
  <!--
    Ficha ampliada del proyecto. Toda la mecánica accesible (Esc, click en el
    backdrop, botón cerrar, bloqueo del scroll del body, focus trap y devolución
    del foco al cerrar) ya vive en `BaseModal` — aquí solo se aporta contenido.
    Duplicar esa lógica sería la forma más rápida de que las dos copias se
    desincronicen.

    `BaseModal` se monta SIEMPRE, aunque todavía no haya proyecto elegido. No es
    un descuido: su bloqueo de scroll y el traslado del foco viven en un
    `watch(() => open)` que NO es `immediate`, así que un componente que
    apareciera ya abierto (`v-if="proyecto"` en la primera ficha que se pulsa)
    se saltaría ambos — el diálogo se vería, pero el fondo seguiría
    scrolleando y el foco se quedaría en la tarjeta de atrás. Montarlo cerrado
    desde el principio no cuesta nada: su contenido vive tras un `v-if="open"`.
  -->
  <BaseModal
    :open="open"
    size="wide"
    :eyebrow="kicker"
    :title="titulo"
    close-label="Cerrar la historia"
    @close="emit('close')"
  >
    <template v-if="proyecto">
      <!--
      IMAGEN PRINCIPAL — la misma foto de la tarjeta (mismo `src`, así que el
      navegador la sirve de caché y aparece al instante, sin segundo fetch).
      Entra con su propio gesto: `appear` sobre un scale corto que la asienta
      un pelín después de que la hoja del diálogo termine de subir.
    -->
      <Transition
        appear
        enter-active-class="transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] delay-100"
        enter-from-class="scale-[1.04] opacity-0"
      >
        <figure class="overflow-hidden rounded-md bg-surface">
          <img
            :src="proyecto.imagen"
            :alt="`${proyecto.titulo} — trabajo para ${proyecto.cliente}`"
            class="aspect-[16/10] w-full object-cover"
          />
        </figure>
      </Transition>

      <!--
      Dos columnas en escritorio: relato a la izquierda (medida de lectura
      acotada), ficha técnica a la derecha. En móvil caen una debajo de otra
      con la ficha al final — primero se lee de qué va, después los datos.
    -->
      <div class="mt-10 grid gap-10 lg:grid-cols-5 lg:gap-14">
        <div class="lg:col-span-3">
          <p class="text-lg leading-relaxed text-foreground sm:text-xl">
            {{ proyecto.resumen }}
          </p>

          <p class="mt-5 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
            {{ proyecto.descripcion }}
          </p>

          <ul class="mt-8 flex flex-wrap gap-2">
            <li v-for="etiqueta in proyecto.etiquetas" :key="etiqueta">
              <BaseBadge variant="primary">{{ etiqueta }}</BaseBadge>
            </li>
          </ul>
        </div>

        <!-- Ficha técnica: `<dl>` real — pares término/definición, no una tabla falsa. -->
        <dl
          class="space-y-6 border-t border-border pt-8 lg:col-span-2 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
        >
          <div v-for="dato in ficha" :key="dato.etiqueta">
            <dt class="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-primary">
              {{ dato.etiqueta }}
            </dt>
            <dd class="mt-2 text-sm text-foreground sm:text-base">{{ dato.valor }}</dd>
          </div>
        </dl>
      </div>

      <!--
      Cierre con salida al formulario de contacto. Es un RouterLink a la ruta
      `/contact`, NO un `href="#contact"`: la ficha vive en /projects y aquel
      ancla está en el Home, así que un hash pelado solo ensuciaría la URL sin
      mover nada. Se cierra ANTES de navegar, para devolver foco y scroll.
    -->
      <p
        class="mt-12 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground sm:text-base"
      >
        ¿Te late esta misma mirada para lo tuyo?
        <RouterLink
          to="/contact"
          data-cursor="grow"
          class="text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors duration-300 hover:text-primary"
          @click="emit('close')"
          >Cuéntame qué traes</RouterLink
        >.
      </p>
    </template>
  </BaseModal>
</template>
