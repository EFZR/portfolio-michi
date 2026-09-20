<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePreferredReducedMotion } from '@vueuse/core'
import BaseContainer from '@/components/ui/BaseContainer.vue'
import ContactForm from '@/components/contact/ContactForm.vue'

// ScrollTrigger vive dentro del paquete `gsap`. Registro idempotente a nivel módulo.
gsap.registerPlugin(ScrollTrigger)

const sectionRef = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

const email = 'karolmpalmam@gmail.com'
const lugar = 'Tegucigalpa, Honduras'

/**
 * Lo que pasa DESPUÉS de enviar. Va en la página y no en un correo automático
 * porque es justo lo que se pregunta quien duda antes de escribir: cuánto
 * tarda, qué le van a pedir y si le va a costar dinero preguntar.
 */
const pasos = [
  {
    indice: '01',
    titulo: 'Te respondo',
    detalle: 'En un par de días, con mis dudas y una idea de tiempos.',
  },
  {
    indice: '02',
    titulo: 'Nos llamamos',
    detalle: 'Media hora para ver si encajamos. No cobro por esta parte.',
  },
  {
    indice: '03',
    titulo: 'Te paso propuesta',
    detalle: 'Alcance, calendario y precio cerrado. Sin letra pequeña.',
  },
]

const triggers: ScrollTrigger[] = []
const timelines: gsap.core.Timeline[] = []

onMounted(() => {
  const section = sectionRef.value
  if (!section || reducedMotion.value === 'reduce') return

  const kicker = section.querySelector<HTMLElement>('.reveal-kicker')
  const titulo = section.querySelectorAll<HTMLElement>('.reveal-titulo')
  const cuerpo = section.querySelectorAll<HTMLElement>('.reveal-cuerpo')

  // Mismo reveal que el Portafolio: la web tiene una sola forma de entrar.
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 75%', toggleActions: 'play none none reverse' },
  })

  if (kicker) tl.from(kicker, { y: 20, opacity: 0, duration: 0.5 })
  tl.from(titulo, { yPercent: 110, duration: 0.9, stagger: 0.12, ease: 'power4.out' }, '-=0.25')
  tl.from(cuerpo, { y: 32, opacity: 0, duration: 0.7, stagger: 0.1 }, '-=0.5')

  timelines.push(tl)
  if (tl.scrollTrigger) triggers.push(tl.scrollTrigger)
})

onUnmounted(() => {
  triggers.forEach((t) => t.kill())
  timelines.forEach((tl) => tl.kill())
  triggers.length = 0
  timelines.length = 0
})
</script>

<template>
  <!--
    Página /contact — el formulario de verdad.

    El Home mantiene su propia sección de contacto (#contact), y no es una
    duplicación: allí el correo dentro de la frase ES el punto de contacto, una
    decisión de diseño escrita en ese componente. Esta vista es la otra puerta,
    para quien prefiere rellenar campos a redactar un correo en frío.

    Mismo esqueleto que la vista de Portafolio: `pt` corto porque el `pt-24` del
    <main> ya despeja la navbar, y `pb` propio porque el footer abre con un
    borde a todo el ancho y sin aire quedaría pegado.
  -->
  <section ref="sectionRef" class="pt-10 pb-24 sm:pt-14 sm:pb-32">
    <BaseContainer size="bleed">
      <header class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="reveal-kicker text-xs font-medium uppercase tracking-[0.3em] text-primary">
            Contacto
          </p>

          <!--
            H1 de la página. Cada línea va dentro de una máscara `overflow-hidden`
            y la palabra sube desde abajo; el reveal vive en el <span> interno,
            nunca en la máscara, o el recorte se movería con el texto.
          -->
          <h1 class="mt-4 text-4xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
            <span class="block overflow-hidden py-[0.1em]">
              <span class="reveal-titulo block">Cuéntame</span>
            </span>
            <span class="block overflow-hidden py-[0.1em]">
              <span class="reveal-titulo block font-heading italic">qué traes</span>
            </span>
          </h1>
        </div>

        <p
          class="reveal-cuerpo max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base"
        >
          No hace falta que lo tengas resuelto. Con que me digas qué quieres que pase, ya tenemos
          por dónde empezar.
        </p>
      </header>

      <!--
        Formulario a la izquierda con la medida acotada (7 de 12): un campo de
        texto de 1800px de ancho es incómodo de leer y de rellenar. A la derecha,
        lo que no cabe en el formulario pero decide si alguien lo rellena.
      -->
      <div class="mt-16 grid gap-14 sm:mt-20 lg:grid-cols-12 lg:gap-20">
        <div class="reveal-cuerpo lg:col-span-7">
          <ContactForm :email="email" />
        </div>

        <aside class="reveal-cuerpo lg:col-span-5">
          <div class="border-t border-border pt-8">
            <h2 class="text-xs font-medium uppercase tracking-[0.3em] text-primary">
              Cómo funciona
            </h2>

            <ol class="mt-8 space-y-8">
              <li v-for="paso in pasos" :key="paso.indice" class="flex gap-5">
                <span
                  aria-hidden="true"
                  class="shrink-0 font-mono text-xs tracking-[0.25em] text-muted-foreground"
                >
                  {{ paso.indice }}
                </span>
                <div>
                  <p class="font-heading text-xl font-semibold tracking-tight text-foreground">
                    {{ paso.titulo }}
                  </p>
                  <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {{ paso.detalle }}
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <!-- Salida directa: quien no quiera formulario, no debería necesitarlo. -->
          <div class="mt-12 border-t border-border pt-8">
            <h2 class="text-xs font-medium uppercase tracking-[0.3em] text-primary">O directo</h2>

            <p class="mt-6 text-lg leading-relaxed text-foreground">
              <a
                :href="`mailto:${email}`"
                data-cursor="grow"
                class="underline decoration-primary decoration-2 underline-offset-4 transition-colors duration-300 hover:text-primary"
                >{{ email }}</a
              >
            </p>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
              Trabajo desde {{ lugar }}, con la agenda abierta.
            </p>
          </div>
        </aside>
      </div>
    </BaseContainer>
  </section>
</template>
