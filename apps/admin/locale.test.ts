/**
 * Tests del conteo de traducciones pendientes.
 *
 * Recorre los DATOS, no el esquema, así que tiene que aguantar todo lo que el
 * panel guarda: tuplas, listas de grupos, campos sin localizar y valores que no
 * son texto. Lo escribí sin probarlo y no puedo verlo en pantalla, así que va aquí.
 */
import { describe, expect, it } from 'vitest'
import { contarSinTraducir } from './src/composables/useEditLocale'

const es = (t: string) => ({ es: t, en: '' })
const ambos = (a: string, b: string) => ({ es: a, en: b })

describe('cuenta lo que tiene español pero no inglés', () => {
  it('un texto sin traducir cuenta 1', () => {
    expect(contarSinTraducir({ title: es('Hola') })).toBe(1)
  })

  it('uno traducido cuenta 0', () => {
    expect(contarSinTraducir({ title: ambos('Hola', 'Hello') })).toBe(0)
  })

  it('un español vacío no cuenta: no hay nada que traducir', () => {
    expect(contarSinTraducir({ title: es('') })).toBe(0)
    expect(contarSinTraducir({ title: { es: '   ', en: '' } })).toBe(0)
  })

  it('un inglés con solo espacios sigue contando como sin traducir', () => {
    expect(contarSinTraducir({ title: { es: 'Hola', en: '  ' } })).toBe(1)
  })
})

describe('aguanta las formas que el panel guarda', () => {
  it('la tupla de cinco palabras del Hero', () => {
    expect(
      contarSinTraducir({ words: [es('tu'), es('siguiente'), ambos('nivel', 'level'), es('empieza'), es('aquí')] }),
    ).toBe(4)
  })

  it('una lista de grupos, como los pasos de Contacto', () => {
    expect(
      contarSinTraducir({
        steps: [
          { title: es('Te respondo'), detail: ambos('En dos días', 'In two days') },
          { title: ambos('Nos llamamos', 'We talk'), detail: es('Media hora') },
        ],
      }),
    ).toBe(2)
  })

  it('anidamiento profundo — catálogo: grupos con listas de ítems', () => {
    expect(
      contarSinTraducir({
        catalog: [{ title: es('Marketing'), items: [{ name: es('Estrategia'), description: es('Calendario') }] }],
      }),
    ).toBe(3)
  })

  it('ignora lo que no es texto localizado', () => {
    expect(contarSinTraducir({ year: 2026, draft: false, slug: 'x', image: '/a.jpg', tags: [] })).toBe(0)
  })

  it('no confunde un objeto con otras claves', () => {
    // `aspectRatio` tiene claves que no son es/en: no es un texto localizado.
    expect(contarSinTraducir({ aspectRatio: { width: 4, height: 5 } })).toBe(0)
  })

  it('un documento entero suma lo suyo y nada más', () => {
    const proyecto = {
      slug: 'manifiesto-aurora',
      title: es('Manifiesto Aurora'),
      summary: ambos('Relanzamiento', 'Relaunch'),
      description: es('Aurora llevaba seis años…'),
      tags: [es('Marca'), ambos('Tono', 'Tone')],
      year: 2026,
      order: 0,
      draft: false,
    }
    expect(contarSinTraducir(proyecto)).toBe(3)
  })

  it('no revienta con null ni undefined', () => {
    expect(contarSinTraducir(null)).toBe(0)
    expect(contarSinTraducir(undefined)).toBe(0)
    expect(contarSinTraducir({ a: null, b: undefined })).toBe(0)
  })
})
