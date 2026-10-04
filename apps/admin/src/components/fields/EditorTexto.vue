<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, onMounted } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { CitaConAutor, ImagenConPie } from './extensiones'
import type { Locale } from '@princess/content'
import { useEditLocale } from '@/composables/useEditLocale'
import { useUpload } from '@/composables/useUpload'
import { bloquesADocumento, documentoABloques, type Bloque } from './cast'
import type { FieldProps } from './tipos'
import ArticleContent from '@web/components/blog/ArticleContent.vue'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import { mediaUrl } from '@princess/content/media'

const BUCKET_MEDIA = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string

/**
 * Resolutor de medios para la vista previa: la biblioteca VIVA.
 *
 * `ArticleContent` es el MISMO componente que pinta el artículo publicado, y
 * por defecto resuelve contra el contenido ya desplegado. Acá hace falta lo
 * contrario: ver la foto que se acaba de subir.
 */
const biblioteca = useMediaLibrary()
const resolverMedio = (id: string) => biblioteca.porId(id)

/**
 * La misma resolución, pero devolviendo una URL: es lo que ProseMirror
 * necesita para pintar la imagen DENTRO del editor.
 *
 * Usa el ancho de 960 y no el mayor disponible: el editor mide unos 700 px y
 * bajar el de 1920 para un hueco de 700 es el mismo error que ya costó 6.21 MB
 * en la cuadrícula del selector.
 */
const resolverUrl = (id: string): string | undefined => {
  const a = biblioteca.porId(id)
  if (!a?.basePath) return undefined
  const ims = [...a.renditions.images, ...(a.poster?.formats ?? [])]
    .filter((r) => r.format === 'jpeg' || r.format === 'png')
    .sort((x, y) => x.width - y.width)
  const elegida = ims.find((r) => r.width >= 960) ?? ims[ims.length - 1]
  return elegida ? mediaUrl(BUCKET_MEDIA, a.basePath, elegida.path) : undefined
}
onMounted(() => biblioteca.cargar())

/**
 * EDITOR DEL ARTÍCULO — se escribe de corrido, no rellenando campos.
 *
 * El contenido sigue guardándose como bloques tipados: eso no cambia, porque es
 * lo que la web sabe pintar y lo que evita `v-html`. Lo que cambia es CÓMO se
 * escribe — aquí es un documento continuo con barra de formato, y el cast
 * reparte en bloques al soltar la tecla.
 *
 * Los atajos de Markdown funcionan al escribir, que es lo que hace que no se
 * sienta un formulario: `## ` abre un subtítulo, `> ` una cita, `- ` una lista,
 * ``` ``` ``` un bloque de código.
 *
 * ── BILINGÜE ────────────────────────────────────────────────────────────────
 * Un documento POR IDIOMA, cada uno con su propia estructura. Es deliberado:
 * una traducción no siempre parte los párrafos igual que el original, y
 * obligarla a calcar la estructura del español haría el inglés peor.
 */

const props = defineProps<FieldProps>()
const emit = defineEmits<{ cambiar: [valor: unknown]; salir: [] }>()

// El idioma lo manda el conmutador del formulario, no este widget: tener dos
// controles de idioma en la misma pantalla era justo la confusión a evitar.
const idioma = useEditLocale()
const previa = ref(false)
/** Se rellena si el contenido no encaja en el esquema del editor. */
const contentError = ref('')

/** `{ es: Bloque[], en: Bloque[] }`, tolerando el arreglo plano heredado. */
const porIdioma = computed<Record<Locale, Bloque[]>>(() => {
  const v = props.valor
  if (Array.isArray(v)) return { es: v as Bloque[], en: [] }
  const o = (v ?? {}) as Partial<Record<Locale, Bloque[]>>
  return { es: o.es ?? [], en: o.en ?? [] }
})

const editor = new Editor({
  extensions: [
    StarterKit.configure({
      // Solo H2: el H1 es el titular del artículo, y H3 en adelante no lo pinta
      // `ArticleContent`. Ofrecer niveles que no existen produce artículos que
      // se ven distinto de como se escribieron.
      heading: { levels: [2] },
      link: false,
      // Se sustituyen por las versiones con autor e imagen (ver `extensiones.ts`).
      blockquote: false,
    }),
    CitaConAutor,
    ImagenConPie,
    Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
  ],

  /**
   * RED DE SEGURIDAD. Por defecto el editor DESCARTA EN SILENCIO lo que no
   * encaja en su esquema: así es como se perdían la imagen y el autor de la
   * cita. Con esto, un bloque que no quepa dispara un error en vez de
   * evaporarse, y el editor se niega a cargar antes que destruir el artículo.
   */
  enableContentCheck: true,
  onContentError: ({ error: e }) => {
    contentError.value =
      `Este artículo tiene contenido que el editor no sabe representar ` +
      `(${e.message}). NO se ha cargado, para no perderlo al guardar.`
  },
  content: bloquesADocumento(porIdioma.value.es, resolverUrl),
  onUpdate: ({ editor: e }) => {
    emit('cambiar', {
      ...porIdioma.value,
      [idioma.value]: documentoABloques(e.getJSON() as never),
    })
  },
  onBlur: () => emit('salir'),
  editorProps: {
    attributes: {
      class:
        'prose-editor min-h-[24rem] max-w-prose focus:outline-none text-base leading-[1.75] text-foreground/90',
    },
  },
})

// Al cambiar de idioma se carga el documento de ESE idioma sin emitir: si
// emitiera, el `onUpdate` del editor recién cargado pisaría el otro idioma.
watch(idioma, (nuevo) => {
  editor.commands.setContent(bloquesADocumento(porIdioma.value[nuevo], resolverUrl), {
    emitUpdate: false,
  })
})

onBeforeUnmount(() => editor.destroy())

const bloques = computed(() => porIdioma.value[idioma.value])

/** Estado de los botones de la barra. */
const activo = (nombre: string, attrs?: Record<string, unknown>) =>
  editor.isActive(nombre, attrs) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'

function enlazar() {
  const previo = editor.getAttributes('link').href ?? ''
  // `prompt` bloquea el webview de Tauri igual que `confirm`, así que el enlace
  // se pide con un campo propio que aparece bajo la barra.
  pidiendoEnlace.value = true
  urlEnlace.value = String(previo)
}

const pidiendoEnlace = ref(false)
const urlEnlace = ref('')
const pidiendoImagen = ref(false)
const urlImagen = ref('')
const pieImagen = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const { subir, subiendo, progreso, error: errorSubida } = useUpload()

function insertarImagen() {
  const src = urlImagen.value.trim()
  const pie = pieImagen.value.trim()
  // Sin pie no se inserta: la web lo exige y un bloque sin él no valida.
  if (!src || !pie) return
  editor.chain().focus().setImage({ src, title: pie, alt: pie }).run()
  pidiendoImagen.value = false
  urlImagen.value = ''
  pieImagen.value = ''
}

/**
 * Las imágenes DENTRO de un artículo no llevan proporción fija: a diferencia de
 * las fichas y las portadas, aquí la foto se pinta tal cual y el texto se
 * acomoda. Por eso se sube sin comprobar el encuadre.
 */
async function alElegirArchivo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const r = await subir(file, 'articles/{slug}/bloque.webp', { slug: props.ruta })
  if (r) urlImagen.value = r.url
  if (fileInput.value) fileInput.value.value = ''
}

function confirmarEnlace() {
  const url = urlEnlace.value.trim()
  if (!url) editor.chain().focus().unsetLink().run()
  else editor.chain().focus().setLink({ href: url }).run()
  pidiendoEnlace.value = false
  urlEnlace.value = ''
}

const BOTON =
  'px-2 py-1 font-mono text-[0.7rem] uppercase tracking-[0.15em] transition-colors duration-200'
</script>

<template>
  <div class="border-t border-border pt-6">
    <div class="flex flex-wrap items-baseline justify-between gap-4">
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        {{ campo.label }}
        <span class="ms-2 normal-case tracking-normal">{{ bloques.length }} bloques</span>
      </p>

      <div class="flex items-center gap-5">
        <button
          type="button"
          class="font-mono text-[0.65rem] uppercase tracking-[0.25em] transition-colors duration-200"
          :class="previa ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
          @click="previa = !previa"
        >
          {{ previa ? 'Volver a editar' : 'Vista previa' }}
        </button>
      </div>
    </div>

    <p v-if="error" role="alert" class="mt-3 text-sm font-medium text-primary">{{ error }}</p>

    <p
      v-if="contentError"
      role="alert"
      class="mt-4 border-l-2 border-primary py-2 ps-4 text-sm leading-relaxed text-primary"
    >
      {{ contentError }}
    </p>

    <!-- ───────────────────── VISTA PREVIA ───────────────────── -->
    <div v-if="previa" class="mt-8 border-s border-border ps-6">
      <!--
        El resolutor apunta a la biblioteca VIVA, no al `content.json`
        publicado: en la vista previa hace falta ver la foto que se acaba de
        subir, y esa todavía no está en el snapshot del último despliegue.
      -->
      <ArticleContent
        v-if="bloques.length"
        :blocks="bloques as never[]"
        :resolver-medio="resolverMedio"
      />
      <p v-else class="text-sm text-muted-foreground">Todavía no hay nada que previsualizar.</p>
    </div>

    <template v-else>
      <!--
        BARRA DE FORMATO. Pegada arriba: en un artículo de dos mil palabras, una
        barra que se va con el scroll es una barra que hay que ir a buscar.
      -->
      <div
        class="sticky top-16 z-10 mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 border-y border-border bg-background/95 py-2 backdrop-blur-sm"
      >
        <button
          type="button"
          :class="[BOTON, activo('bold')]"
          title="Negrita · Ctrl+B"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          :class="[BOTON, activo('italic')]"
          title="Cursiva · Ctrl+I"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          :class="[BOTON, activo('code')]"
          title="Código en línea"
          @click="editor.chain().focus().toggleCode().run()"
        >
          &lt;/&gt;
        </button>
        <button type="button" :class="[BOTON, activo('link')]" title="Enlace" @click="enlazar">
          Enlace
        </button>

        <span aria-hidden="true" class="mx-2 h-4 w-px bg-border" />

        <button
          type="button"
          :class="[BOTON, activo('heading', { level: 2 })]"
          title="Subtítulo · ##"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          Subtítulo
        </button>
        <button
          type="button"
          :class="[BOTON, activo('blockquote')]"
          title="Cita · &gt;"
          @click="editor.chain().focus().toggleBlockquote().run()"
        >
          Cita
        </button>
        <button
          type="button"
          :class="[BOTON, activo('bulletList')]"
          title="Lista · -"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          Lista
        </button>
        <button
          type="button"
          :class="[BOTON, activo('orderedList')]"
          title="Numerada · 1."
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          1. 2. 3.
        </button>
        <button
          type="button"
          :class="[BOTON, activo('codeBlock')]"
          title="Código · ```"
          @click="editor.chain().focus().toggleCodeBlock().run()"
        >
          Código
        </button>
        <button
          type="button"
          :class="[BOTON, activo('image')]"
          title="Insertar imagen"
          @click="pidiendoImagen = true"
        >
          Imagen
        </button>

        <span
          class="ms-auto hidden font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground/70 lg:inline"
        >
          ## subtítulo · &gt; cita · - lista
        </span>
      </div>

      <!-- Campo de enlace, en vez de un `prompt()` que congelaría el webview. -->
      <div v-if="pidiendoEnlace" class="mt-3 flex items-center gap-3">
        <input
          v-model="urlEnlace"
          type="url"
          placeholder="https://…"
          class="flex-1 border-0 border-b border-border bg-transparent px-0 py-2 text-sm focus:border-primary focus:outline-none"
          @keydown.enter.prevent="confirmarEnlace"
          @keydown.esc="pidiendoEnlace = false"
        />
        <button type="button" :class="[BOTON, 'text-primary']" @click="confirmarEnlace">
          {{ urlEnlace.trim() ? 'Poner' : 'Quitar' }}
        </button>
      </div>

      <!-- Insertar imagen: URL y pie. El pie es obligatorio en la web. -->
      <div v-if="pidiendoImagen" class="mt-3 flex flex-wrap items-center gap-3">
        <input
          v-model="urlImagen"
          type="url"
          placeholder="https://… o /ruta-en-public.jpg"
          class="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-0 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <input
          v-model="pieImagen"
          type="text"
          placeholder="Pie de foto (obligatorio)"
          class="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-0 py-2 text-sm focus:border-primary focus:outline-none"
          @keydown.enter.prevent="insertarImagen"
        />
        <button
          type="button"
          :disabled="subiendo"
          :class="[BOTON, 'text-muted-foreground hover:text-primary disabled:opacity-50']"
          @click="fileInput?.click()"
        >
          {{ subiendo ? progreso : 'Subir archivo' }}
        </button>
        <button type="button" :class="[BOTON, 'text-primary']" @click="insertarImagen">
          Poner
        </button>
      </div>

      <p v-if="errorSubida" role="alert" class="mt-2 text-sm leading-relaxed text-primary">
        {{ errorSubida }}
      </p>

      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        class="hidden"
        @change="alElegirArchivo"
      />

      <!--
        Autor de la cita. Solo aparece con el cursor DENTRO de una cita: es el
        único momento en que significa algo, y fuera de ahí sería un campo
        huérfano en la barra.
      -->
      <div v-if="editor.isActive('blockquote')" class="mt-3 flex items-center gap-3">
        <span class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
          A quién se cita
        </span>
        <input
          :value="editor.getAttributes('blockquote').cite ?? ''"
          type="text"
          placeholder="opcional"
          class="flex-1 border-0 border-b border-border bg-transparent px-0 py-1.5 text-sm focus:border-primary focus:outline-none"
          @input="
            editor
              .chain()
              .updateAttributes('blockquote', {
                cite: ($event.target as HTMLInputElement).value || null,
              })
              .run()
          "
        />
      </div>

      <EditorContent :editor="editor" class="mt-6" />
    </template>
  </div>
</template>

<style>
/*
  El editor pinta su propio árbol, así que no le alcanzan las utilities de
  Tailwind puestas en el template. Se le da el mismo ritmo tipográfico que
  `ArticleContent` para que escribir se parezca a leer lo publicado.
*/
.prose-editor > * + * {
  margin-top: 1.25rem;
}
.prose-editor h2 {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin-top: 2.5rem;
}
.prose-editor blockquote {
  border-left: 2px solid var(--color-primary);
  padding-left: 1.5rem;
  font-family: var(--font-heading);
  font-style: italic;
  font-size: 1.25rem;
  line-height: 1.4;
}
.prose-editor ul,
.prose-editor ol {
  padding-left: 1.5rem;
}
.prose-editor ul {
  list-style: disc;
}
.prose-editor ol {
  list-style: decimal;
}
.prose-editor li::marker {
  color: var(--color-primary);
}
.prose-editor pre {
  background: var(--color-surface);
  border-radius: 0.375rem;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.875rem;
}
.prose-editor code {
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.prose-editor :not(pre) > code {
  background: var(--color-surface);
  border-radius: 0.375rem;
  padding: 0.1rem 0.35rem;
}
.prose-editor a {
  text-decoration: underline;
  text-decoration-color: var(--color-primary);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}
/* El marcador de párrafo vacío: sin esto, un documento en blanco no dice nada. */
.prose-editor p.is-editor-empty:first-child::before {
  content: 'Escribe aquí. Los atajos de Markdown funcionan al teclear.';
  color: var(--color-muted-foreground);
  opacity: 0.6;
  float: left;
  height: 0;
  pointer-events: none;
}
</style>
