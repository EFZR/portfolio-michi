<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@princess/content'
import CampoDinamico from './CampoDinamico.vue'
import { BLOQUES, ORDEN_BLOQUES, normalizar, nuevoBloque } from './bloques'
import type { FieldProps } from './tipos'
import ArticleContent from '@web/components/blog/ArticleContent.vue'

/**
 * EDITOR DE BLOQUES — el widget `custom` del contenido del blog.
 *
 * El contenido NO es Markdown ni HTML: es un arreglo de bloques tipados, igual
 * que en `apps/web/src/data/articles.ts`. Esa decisión es de la web y aquí solo
 * se respeta — por eso no hay ningún editor de texto enriquecido: produciría
 * una forma que `ArticleContent.vue` no sabe pintar.
 *
 * El editor no tiene formularios propios: cada tipo de bloque es una lista de
 * descriptores (`bloques.ts`) y se monta con `CampoDinamico`. Así hereda
 * contadores, pestañas de idioma y accesibilidad sin duplicar una línea.
 */

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

const lista = computed(() =>
  (Array.isArray(props.valor) ? props.valor : []).map((b) =>
    normalizar(b as Record<string, unknown>),
  ),
)

const previa = ref(false)
const abierto = ref<number | null>(0)

function emitir(bloques: Record<string, unknown>[]) {
  emit('cambiar', bloques)
}

function cambiarCampo(indice: number, ruta: string, v: unknown) {
  const clave = ruta.split('.').pop()!
  const copia = [...lista.value]
  copia[indice] = { ...copia[indice], [clave]: v }
  emitir(copia)
}

function anadir(type: string) {
  emitir([...lista.value, nuevoBloque(type)])
  abierto.value = lista.value.length
}

function quitar(i: number) {
  const copia = [...lista.value]
  copia.splice(i, 1)
  emitir(copia)
  abierto.value = null
}

function mover(i: number, delta: number) {
  const destino = i + delta
  if (destino < 0 || destino >= lista.value.length) return
  const copia = [...lista.value]
  ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
  emitir(copia)
  abierto.value = destino
}

/** Primeras palabras del bloque, para reconocerlo con el editor plegado. */
function resumen(bloque: Record<string, unknown>): string {
  const campo = BLOQUES[String(bloque.type)]?.campos[0]
  if (!campo) return ''
  const v = bloque[campo.key]
  const texto = Array.isArray(v)
    ? t(v[0] as { es: string })
    : t(v as { es: string } | string | undefined)
  return texto.length > 70 ? `${texto.slice(0, 70)}…` : texto
}

/**
 * Vista previa con el componente REAL de la web. No es una imitación: es el
 * mismo `ArticleContent.vue` que pinta el artículo publicado, así que lo que se
 * ve aquí es literalmente lo que se verá allí.
 *
 * Necesita los textos resueltos a una cadena, que es justo lo que hace el
 * prebuild de la web al bajar el contenido.
 */
const bloquesResueltos = computed(() => resolver(lista.value) as never[])

function resolver(valor: unknown): unknown {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    const o = valor as Record<string, unknown>
    const claves = Object.keys(o)
    if (claves.length && claves.every((k) => k === 'es' || k === 'en')) {
      return t(o as { es: string; en?: string })
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolver(v)]))
  }
  if (Array.isArray(valor)) return valor.map(resolver)
  return valor
}
</script>

<template>
  <div class="border-t border-border pt-6">
    <div class="flex flex-wrap items-baseline justify-between gap-4">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        {{ campo.label }}
        <span class="ms-2 normal-case tracking-normal">{{ lista.length }} bloques</span>
      </p>

      <button
        type="button"
        class="font-mono text-[0.65rem] uppercase tracking-[0.25em] transition-colors duration-200"
        :class="previa ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="previa = !previa"
      >
        {{ previa ? 'Volver a editar' : 'Vista previa' }}
      </button>
    </div>

    <p v-if="error" role="alert" class="mt-3 text-sm font-medium text-primary">{{ error }}</p>

    <!-- ───────────────────── VISTA PREVIA ───────────────────── -->
    <div v-if="previa" class="mt-8 border-s border-border ps-6">
      <ArticleContent v-if="lista.length" :blocks="bloquesResueltos" />
      <p v-else class="text-sm text-muted-foreground">Todavía no hay nada que previsualizar.</p>
    </div>

    <!-- ─────────────────────── EDICIÓN ─────────────────────── -->
    <template v-else>
      <ul class="mt-6">
        <li v-for="(bloque, i) in lista" :key="i" class="border-t border-border">
          <!--
            Plegado por defecto: un artículo largo son catorce bloques, y con
            todos abiertos la pantalla deja de ser navegable. El resumen basta
            para reconocer cuál es cada uno.
          -->
          <div class="flex items-center gap-4 py-3">
            <span class="w-8 shrink-0 font-mono text-xs tracking-[0.2em] text-muted-foreground">
              {{ String(i + 1).padStart(2, '0') }}
            </span>
            <span
              class="w-8 shrink-0 text-center font-mono text-sm"
              :class="abierto === i ? 'text-primary' : 'text-muted-foreground'"
              aria-hidden="true"
            >
              {{ BLOQUES[String(bloque.type)]?.marca ?? '?' }}
            </span>

            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-sm transition-colors duration-200 hover:text-primary"
              :aria-expanded="abierto === i"
              @click="abierto = abierto === i ? null : i"
            >
              <span class="text-muted-foreground">
                {{ BLOQUES[String(bloque.type)]?.label ?? bloque.type }}
              </span>
              <span v-if="resumen(bloque)" class="ms-3">{{ resumen(bloque) }}</span>
            </button>

            <span class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                :disabled="i === 0"
                aria-label="Subir"
                class="px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-primary disabled:opacity-25"
                @click="mover(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                :disabled="i === lista.length - 1"
                aria-label="Bajar"
                class="px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-primary disabled:opacity-25"
                @click="mover(i, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Quitar bloque"
                class="px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-primary"
                @click="quitar(i)"
              >
                ✕
              </button>
            </span>
          </div>

          <div v-if="abierto === i" class="space-y-6 pb-8 ps-16">
            <CampoDinamico
              v-for="hijo in BLOQUES[String(bloque.type)]?.campos ?? []"
              :key="hijo.key"
              :campo="hijo"
              :valor="bloque[hijo.key]"
              :error="''"
              :ruta="`${ruta}.${i}.${hijo.key}`"
              @cambiar="(r, v) => cambiarCampo(i, r, v)"
              @salir="emit('salir')"
            />
          </div>
        </li>
      </ul>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-5">
        <span class="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
          Añadir
        </span>
        <button
          v-for="type in ORDEN_BLOQUES"
          :key="type"
          type="button"
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-200 hover:text-primary"
          @click="anadir(type)"
        >
          {{ BLOQUES[type].marca }} {{ BLOQUES[type].label }}
        </button>
      </div>
    </template>
  </div>
</template>
