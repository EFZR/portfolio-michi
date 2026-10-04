/**
 * MICRO-COPYS DE LA INTERFAZ.
 *
 * Los ~94 textos que hasta ahora estaban incrustados en los componentes. Bajan
 * de `config/ui` en el prebuild y aquí llegan ya resueltos al idioma activo.
 *
 * El tipo se escribe a mano y NO se genera desde los esquemas. Es deliberado:
 * los esquemas viven en Firestore y cambian sin recompilar el panel, pero la
 * WEB sí se recompila — y si alguien borra una clave que un componente usa,
 * queremos que falle en `vue-tsc`, no en el navegador de un visitante.
 *
 * Es decir: el esquema manda sobre qué se puede editar; este tipo manda sobre
 * qué necesita la web para pintarse. Que se separen es información, no un bug:
 * significa que hay que tocar un componente.
 */

import { RAW } from './content'

export interface NavLink {
  label: string
  to: string
}

export interface Step {
  title: string
  detail: string
}

export interface SocialLink {
  label: string
  href: string
}

export interface UIContent {
  site: {
    name: string
    author: string
    email: string
    location: string
    description: string
    ogImage?: string
  }
  routes: Record<
    'home' | 'projects' | 'projectDetail' | 'contact' | 'blog' | 'blogPost' | 'notFound',
    string
  >
  nav: {
    cta: string
    open: string
    close: string
    logoAria: string
    drawerAria: string
    items: readonly NavLink[]
    drawer: readonly NavLink[]
  }
  hero: {
    /** Exactamente cinco: el template aplica sangrías distintas por índice. */
    words: readonly [string, string, string, string, string]
    aria: string
    copy: string
    scrollCue: string
    imageAlt: string
  }
  about: {
    kicker: string
    statement: readonly [string, string, string]
    aria: string
    copy: string
    cueText: string
  }
  services: {
    kicker: string
    subhead: string
    cta: string
    modalEyebrow: string
    modalTitle: string
    modalClosing: string
    modalClosingLink: string
  }
  contact: {
    arcTitle: string
    arcAccent: string
    statement: string
    statementAccent: string
    phrase: string
  }
  contactPage: {
    kicker: string
    title: readonly [string, string]
    subhead: string
    howItWorks: string
    direct: string
    locationPhrase: string
    steps: readonly Step[]
  }
  form: Record<
    | 'nameLabel'
    | 'namePlaceholder'
    | 'emailLabel'
    | 'emailPlaceholder'
    | 'disciplineLabel'
    | 'disciplineOther'
    | 'messageLabel'
    | 'messagePlaceholder'
    | 'errorName'
    | 'errorEmailEmpty'
    | 'errorEmailFormat'
    | 'errorDiscipline'
    | 'errorMessage',
    string
  >
  portfolio: {
    kicker: string
    title: readonly [string, string]
    subhead: string
    stateAll: string
    stateFiltered: string
    ctaShowAll: string
    ctaMore: string
    batch: number
  }
  blog: {
    kicker: string
    title: readonly [string, string]
    subhead: string
    emptyTitle: string
    emptyDetail: string
    ctaShowAll: string
    ctaBack: string
    recentDays: number
    archiveDays: number
    categories: readonly string[]
  }
  footer: {
    kicker: string
    cta: string
    colNav: string
    colSocial: string
    colStudio: string
    studioText: string
    studioHighlight: string
    backToTop: string
    copyright: string
    links: readonly NavLink[]
    social: readonly SocialLink[]
  }
  notFound: {
    kicker: string
    title: string
    copy: string
    cta: string
  }
}

export const UI = RAW.ui as unknown as UIContent

/**
 * Sustituye `{clave}` por su valor. Varios textos son plantillas —el copyright
 * lleva `{year}` y `{author}`, la frase de contacto `{email}` y `{location}`—
 * y resolverlas con `replace` suelto en cada componente acaba en cinco
 * implementaciones ligeramente distintas.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}
