import { defineAsyncComponent, markRaw, type Component } from 'vue'
import CampoTexto from './CampoTexto.vue'
import CampoEntero from './CampoEntero.vue'
import CampoBooleano from './CampoBooleano.vue'
import CampoEnum from './CampoEnum.vue'
import CampoFecha from './CampoFecha.vue'
import CampoTupla from './CampoTupla.vue'
import CampoLista from './CampoLista.vue'
import CampoGrupo from './CampoGrupo.vue'
import CampoDesconocido from './CampoDesconocido.vue'

/**
 * `markRaw` EN CADA ENTRADA, y no es opcional.
 *
 * El registro se lee desde un `computed`, así que Vue lo alcanza con su proxy
 * reactivo. Sin `markRaw`, Vue intenta hacer reactiva la DEFINICIÓN del
 * componente —un objeto grande con render functions dentro— en cada acceso.
 *
 * Es el error clásico de los renderizadores dinámicos: el formulario va bien
 * con diez campos y se arrastra con cien, y el perfil no señala a ningún sitio
 * obvio porque el coste está repartido por todos los accesos al registro.
 */
export const REGISTRO: Record<string, Component> = {
  text: markRaw(CampoTexto),
  integer: markRaw(CampoEntero),
  boolean: markRaw(CampoBooleano),
  enum: markRaw(CampoEnum),
  date: markRaw(CampoFecha),
  tuple: markRaw(CampoTupla),
  list: markRaw(CampoLista),
  group: markRaw(CampoGrupo),
  // El selector de la biblioteca. Asíncrono: es el widget más pesado y no
  // entra en el bundle del login.
  media: markRaw(defineAsyncComponent(() => import('./CampoMedia.vue'))),
}

export const DESCONOCIDO: Component = markRaw(CampoDesconocido)

/**
 * Widgets a medida, registrados por nombre. Un `custom` cuyo widget no esté
 * aquí cae en DESCONOCIDO y avisa — mejor que fingir que se puede editar.
 *
 * Asíncrono: el editor de bloques arrastra el `ArticleContent` de la web para
 * la vista previa y solo hace falta al abrir un artículo.
 */
export const WIDGETS: Record<string, Component> = {
  blockEditor: markRaw(defineAsyncComponent(() => import('./EditorTexto.vue'))),
}
