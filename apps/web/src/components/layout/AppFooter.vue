<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import { computed } from 'vue'
import BaseLogo from '@/components/ui/BaseLogo.vue'
import { UI, fill } from '@/data/ui'

const year = new Date().getFullYear()
const { email, author } = UI.site

const navLinks = UI.footer.links

// Hoy va VACÍO: los tres enlaces apuntaban a "#", que no es una URL y el
// esquema la rechaza. Sembrar un enlace roto lo vuelve invisible; una lista
// vacía se ve y pide que la llenen desde el panel.
const socials = UI.footer.social

const copyright = computed(() => fill(UI.footer.copyright, { year, author }))

/** El texto de estudio, partido por su palabra destacada. */
const studioParts = computed(() => UI.footer.studioText.split(UI.footer.studioHighlight))

// Volver arriba — respeta reduced-motion vía la preferencia del navegador
// (scroll-behavior smooth se anula solo si el usuario pidió reduce en su OS).
function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <!--
    Footer editorial CLARO (bg-background) — cierra la página sin romper la
    paleta. border-t marca el corte; el UV aparece solo en acentos puntuales.
  -->
  <footer class="border-t border-border bg-background">
    <!--
      El footer va CONTENIDO (size="wide", tope ~1280px centrado), no full-bleed:
      su contenido (CTA + columnas + barra inferior) se dispersaba con huecos
      enormes en desktop al ir edge-to-edge. Sigue usando el mismo gutter, así que
      en móvil respeta los márgenes del contenedor estándar.
    -->
    <BaseContainer size="wide" class="py-20 sm:py-28">
      <!--
        Bloque CTA — el email como link protagonista (estilo portfolio) + botón
        "Hablemos" reutilizando BaseCtaButton. Se apila hasta `xl` y solo pasa a
        fila en ≥1280px: el email es un token largo sin espacios para envolver y
        tope a 4.25rem mide ~800px, así que en tablet/laptop chico la fila dejaba
        al botón sin aire y se amontonaba. Apilado respira y se lee editorial.
      -->
      <div
        class="flex flex-col gap-8 border-b border-border pb-14 xl:flex-row xl:items-end xl:justify-between xl:gap-12"
      >
        <div>
          <p class="mb-5 text-xs font-medium uppercase tracking-[0.3em] text-primary">
            {{ UI.footer.kicker }}
          </p>
          <!--
            `break-words` (overflow-wrap) es la red de seguridad: el email es un
            token largo SIN espacios, así que en pantallas muy chicas (<~340px) no
            cabe en una línea y, sin esto, desbordaba/se amontonaba. El mínimo del
            clamp se bajó a 1.4rem para que quepa en una línea hasta ~320px; por
            debajo, break-words lo parte en dos en vez de desbordar.
          -->
          <a
            :href="`mailto:${email}`"
            data-cursor="grow"
            class="block break-words font-heading text-[clamp(1.4rem,6.5vw,4.25rem)] font-semibold leading-[0.95] tracking-tight text-foreground transition-colors duration-300 hover:text-primary"
          >
            {{ email }}
          </a>
        </div>

        <BaseCtaButton
          :href="`mailto:${email}`"
          :text="UI.footer.cta"
          size="lg"
          class="shrink-0 self-start xl:self-auto"
        />
      </div>

      <!-- Columnas de links -->
      <div class="mt-14 grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-8">
        <!-- Navegación (ocupa 2 columnas en sm+ para respirar) -->
        <nav :aria-label="UI.nav.drawerAria" class="col-span-2">
          <p class="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">{{ UI.footer.colNav }}</p>
          <ul class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <li v-for="link in navLinks" :key="link.to">
              <RouterLink
                :to="link.to"
                data-cursor="grow"
                class="text-foreground transition-colors duration-200 hover:text-primary"
              >
                {{ link.label }}
              </RouterLink>
            </li>
          </ul>
        </nav>

        <!-- Redes -->
        <div>
          <p class="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">{{ UI.footer.colSocial }}</p>
          <ul class="space-y-2 text-sm">
            <li v-for="social in socials" :key="social.label">
              <a
                :href="social.href"
                target="_blank"
                rel="noopener noreferrer"
                data-cursor="grow"
                class="text-foreground transition-colors duration-200 hover:text-primary"
              >
                {{ social.label }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Disponibilidad -->
        <div>
          <p class="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">{{ UI.footer.colStudio }}</p>
          <p class="text-sm leading-relaxed text-muted-foreground">
            <!--
              El texto lleva UNA palabra destacada. Se parte por ella para que
              el marcado quede en el componente y el texto siga siendo editable.
            -->
            <template v-for="(trozo, i) in studioParts" :key="i">
              {{ trozo
              }}<span v-if="i === 0" class="text-foreground">{{ UI.footer.studioHighlight }}</span>
            </template>
          </p>
        </div>
      </div>

      <!-- Barra inferior: logo · copyright · volver arriba -->
      <div
        class="mt-16 flex flex-col items-center gap-6 border-t border-border pt-8 sm:flex-row sm:justify-between sm:gap-4"
      >
        <RouterLink to="/" aria-label="Inicio" data-cursor="grow" class="h-8">
          <BaseLogo />
        </RouterLink>

        <p class="text-xs text-muted-foreground">
          {{ copyright }}
        </p>

        <button
          type="button"
          data-cursor="grow"
          class="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-foreground transition-colors duration-200 hover:text-primary"
          @click="scrollTop"
        >
          {{ UI.footer.backToTop }}
          <span
            aria-hidden="true"
            class="inline-block transition-transform duration-300 group-hover:-translate-y-0.5"
            >↑</span
          >
        </button>
      </div>
    </BaseContainer>
  </footer>
</template>
