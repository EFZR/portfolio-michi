<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import BaseCtaButton from '@/components/ui/BaseCtaButton.vue'
import BaseLogo from '@/components/ui/BaseLogo.vue'

const year = new Date().getFullYear()
const email = 'karolmpalmam@gmail.com'

// Navegación — mismo set que el drawer (superset de la navbar).
const navLinks = [
  { label: 'Inicio', to: '/' },
  { label: 'Portafolio', to: '/#projects' },
  { label: 'Blog', to: '/blog' },
  { label: 'Proceso', to: '/#process' },
  { label: 'Sobre mí', to: '/#about' },
  { label: 'Contacto', to: '/#contact' },
]

// Redes — placeholders por ahora (href '#'); se cambian por las reales luego.
const socials = [
  { label: 'Instagram', href: '#' },
  { label: 'Behance', href: '#' },
  { label: 'LinkedIn', href: '#' },
]

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
            ¿Trabajamos juntos?
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
          text="Hablemos"
          size="lg"
          class="shrink-0 self-start xl:self-auto"
        />
      </div>

      <!-- Columnas de links -->
      <div class="mt-14 grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-8">
        <!-- Navegación (ocupa 2 columnas en sm+ para respirar) -->
        <nav aria-label="Navegación del pie" class="col-span-2">
          <p class="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Navegación</p>
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
          <p class="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Redes</p>
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
          <p class="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Estudio</p>
          <p class="text-sm leading-relaxed text-muted-foreground">
            Disponible para proyectos
            <span class="text-foreground">freelance</span> y colaboraciones.
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
          &copy; {{ year }} Emerson Zapata. Todos los derechos reservados.
        </p>

        <button
          type="button"
          data-cursor="grow"
          class="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-foreground transition-colors duration-200 hover:text-primary"
          @click="scrollTop"
        >
          Volver arriba
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
