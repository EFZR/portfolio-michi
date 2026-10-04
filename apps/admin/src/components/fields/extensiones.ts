import Blockquote from '@tiptap/extension-blockquote'
import Image from '@tiptap/extension-image'

/**
 * EXTENSIONES A MEDIDA DEL EDITOR.
 *
 * Existen por una razón concreta: **el editor descarta en silencio todo lo que
 * no está en su esquema**. Un bloque que la web sabe pintar pero el editor no
 * conoce desaparece al abrir el artículo, y se pierde al guardar sin que nadie
 * vea un error.
 *
 * Pasó con dos cosas del contenido real:
 *   - la imagen (1 bloque): el editor no traía nodo de imagen
 *   - el autor de una cita (1 bloque): `blockquote` no tiene dónde guardarlo
 *
 * Regla para el futuro: si `ContentBlock` gana un campo, tiene que tener sitio
 * aquí el mismo día.
 */

/** `blockquote` con autor. La web lo pinta como `<figcaption>` bajo la cita. */
export const CitaConAutor = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cite: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-cite'),
        renderHTML: (attrs) => (attrs.cite ? { 'data-cite': attrs.cite } : {}),
      },
    }
  },
})

/**
 * Imagen con pie. El pie viaja en `title` porque el nodo estándar no tiene
 * campo propio, y la web lo exige: una imagen sin pie en un artículo es
 * decoración.
 */
export const ImagenConPie = Image.configure({ inline: false, allowBase64: false })
