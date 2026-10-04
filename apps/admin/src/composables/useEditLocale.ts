import { inject, provide, ref, type Ref } from 'vue'
import { PRIMARY_LOCALE, type Locale } from '@princess/content'

/**
 * IDIOMA QUE SE ESTÁ EDITANDO.
 *
 * Vive en el FORMULARIO, no en cada campo. Antes cada texto localizado pintaba
 * sus dos idiomas apilados, y un formulario de ocho campos se leía como uno de
 * dieciséis: el doble de altura, el doble de contadores y ninguna pista de en
 * qué idioma estabas trabajando.
 *
 * Ahora se escribe un idioma de corrido y se conmuta para repasar el otro.
 *
 * Se pasa por provide/inject y no por props porque entre el formulario y un
 * campo hoja hay hasta tres contenedores (grupo → lista → tupla); enhebrar la
 * prop por todos ellos ensuciaría un motor que precisamente no sabe qué campos
 * existen.
 */

const CLAVE = Symbol('edit-locale')

export function provideEditLocale(): Ref<Locale> {
  const locale = ref<Locale>(PRIMARY_LOCALE)
  provide(CLAVE, locale)
  return locale
}

/** Los widgets lo inyectan. Si nadie lo proveyó, caen al idioma primario. */
export function useEditLocale(): Ref<Locale> {
  return inject<Ref<Locale>>(CLAVE, ref(PRIMARY_LOCALE))
}

/**
 * Cuenta los textos que tienen español pero NO inglés.
 *
 * Recorre los datos, no el esquema: así cubre lo anidado (los pasos de
 * Contacto, los ítems del catálogo, las palabras del Hero) sin conocer la
 * forma de ninguno.
 */
export function contarSinTraducir(valor: unknown): number {
  if (Array.isArray(valor)) return valor.reduce<number>((n, v) => n + contarSinTraducir(v), 0)
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>
    const claves = Object.keys(o)
    const esLocalizado =
      claves.length > 0 &&
      claves.every((k) => k === 'es' || k === 'en') &&
      Object.values(o).every((v) => typeof v === 'string')

    if (esLocalizado) {
      return String(o.es ?? '').trim() && !String(o.en ?? '').trim() ? 1 : 0
    }
    return Object.values(o).reduce<number>((n, v) => n + contarSinTraducir(v), 0)
  }
  return 0
}
