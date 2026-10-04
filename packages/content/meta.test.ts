/**
 * Tests del META-ESQUEMA.
 *
 * Dos trabajos distintos, y el segundo importa más que el primero:
 *   1. Que los esquemas reales del repo sean válidos.
 *   2. Que el meta-esquema RECHACE lo que tiene que rechazar. Un validador que
 *      acepta todo pasa el test 1 sin esfuerzo y no protege de nada.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { metaSchema } from './src/meta/metaSchema'
import { compileField } from './src/compiler/compile'
import { t, onlyPrimary } from './src/meta/locales'

const DIR = fileURLToPath(new URL('./src/schemas/', import.meta.url))
const archivos = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const cargar = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'))

/** Base válida para mutarla en cada test de rechazo. */
const base = () => cargar('contact.json')

describe('los esquemas del repo', () => {
  it('hay al menos uno', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos)('%s es válido', (archivo) => {
    const r = metaSchema.safeParse(cargar(archivo))
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2))
    expect(r.success).toBe(true)
  })

  it.each(archivos)('%s no repite claves', (archivo) => {
    const claves = cargar(archivo).fields.map((f: { key: string }) => f.key)
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('el meta-esquema rechaza', () => {
  function falla(mutar: (d: Record<string, unknown>) => void) {
    const d = base()
    mutar(d)
    return metaSchema.safeParse(d).success
  }

  it('un formato que el panel no entiende', () => {
    expect(falla((d) => void (d.format = 2))).toBe(false)
  })

  it('una clave que no es un identificador', () => {
    expect(falla((d) => void ((d.fields as { key: string }[])[0].key = 'arco-titulo'))).toBe(false)
  })

  it('un tipo de campo inventado', () => {
    expect(falla((d) => void ((d.fields as { type: string }[])[0].type = 'colorpicker'))).toBe(false)
  })

  it('un operador inventado en una condición', () => {
    expect(
      falla(
        (d) =>
          void ((d.fields as Record<string, unknown>[])[0].visible = {
            field: 'x',
            op: 'casiIgual',
          }),
      ),
    ).toBe(false)
  })

  it('una regla que apunta a un campo inexistente', () => {
    expect(falla((d) => void ((d.rules as { fields: string[] }[])[0].fields = ['noExiste']))).toBe(
      false,
    )
  })

  it('un campo que cita un grupo no declarado', () => {
    expect(
      falla((d) => void (((d.fields as Record<string, unknown>[])[0].ui as Record<string, unknown>).group = 'fantasma')),
    ).toBe(false)
  })

  it('una lista sin decir de qué es lista', () => {
    expect(
      falla((d) => {
        ;(d.fields as Record<string, unknown>[])[0].type = 'list'
      }),
    ).toBe(false)
  })

  it('localizar algo que no es texto', () => {
    expect(
      falla((d) => {
        const f = (d.fields as Record<string, unknown>[])[0]
        f.type = 'integer'
        f.localized = true
      }),
    ).toBe(false)
  })

  it('claves repetidas entre campos', () => {
    expect(
      falla((d) => {
        const fields = d.fields as Record<string, unknown>[]
        fields.push({ ...fields[0] })
      }),
    ).toBe(false)
  })
})

describe('el campo `media`', () => {
  /** Mete un campo media en un esquema válido y devuelve los problemas. */
  function conCampo(campo: Record<string, unknown>) {
    const d = base()
    ;(d.fields as unknown[]).push({ key: 'foto', label: 'Foto', type: 'media', ...campo })
    const r = metaSchema.safeParse(d)
    return r.success ? [] : r.error.issues.map((i) => i.message)
  }

  it('sin constraints es válido', () => {
    expect(conCampo({})).toEqual([])
  })

  it('acepta kind image y video', () => {
    expect(conCampo({ constraints: { kind: 'image' } })).toEqual([])
    expect(conCampo({ constraints: { kind: 'video' } })).toEqual([])
  })

  it('rechaza un kind que la biblioteca no entiende', () => {
    // Si se colara, el selector filtraría por un valor inexistente y
    // aparecería vacío sin explicar por qué.
    const p = conCampo({ constraints: { kind: 'gif' } })
    expect(p.join(' ')).toContain('solo vale "image" o "video"')
  })

  it('rechaza los constraints del widget viejo', () => {
    // Dejarlos puestos no rompe nada, y eso es justo el problema: parecerían
    // estar surtiendo efecto. La ruta la decide el pipeline y los topes las
    // reglas de Storage.
    for (const obsoleto of ['destino', 'maxSizeMB', 'formats']) {
      const p = conCampo({ constraints: { [obsoleto]: 'x' } })
      expect(p.join(' '), obsoleto).toContain(obsoleto)
    }
  })

  it('no puede ser localized: un id no se traduce', () => {
    expect(conCampo({ localized: true }).join(' ')).toContain('localized')
  })

  describe('al compilar', () => {
    const v = (over: Record<string, unknown> = {}) =>
      compileField({ key: 'foto', label: 'Foto', type: 'media', ...over } as never)

    it('acepta el id hexadecimal que produce el pipeline', () => {
      // El id sale del sha256 del original: 16 caracteres en la
      // implementación actual.
      expect(v().safeParse('a3019c0e70e8a473').success).toBe(true)
    })

    it('rechaza una URL con un mensaje que dice qué hacer', () => {
      // Es el caso REAL: quedan 43 URLs de picsum en los datos. Que fallen
      // acá es la señal de la migración, no un accidente.
      const r = v().safeParse('https://picsum.photos/seed/x/1000/1250')
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues[0].message).toContain('biblioteca')
        expect(r.error.issues[0].message).toContain('imagen vieja')
      }
    })

    it('rechaza una ruta de /public y un id con mayúsculas', () => {
      expect(v().safeParse('/servicio-fotografia.jpg').success).toBe(false)
      expect(v().safeParse('A3019C0E').success).toBe(false)
      expect(v().safeParse('').success).toBe(false)
    })
  })
})

describe('el resolutor de idioma', () => {
  it('devuelve el idioma pedido', () => {
    expect(t({ es: 'Hola', en: 'Hello' }, 'en')).toBe('Hello')
  })

  it('cae al español cuando el inglés está vacío', () => {
    expect(t({ es: 'Hola', en: '' }, 'en')).toBe('Hola')
    expect(t({ es: 'Hola' }, 'en')).toBe('Hola')
  })

  it('acepta texto plano — durante la migración conviven los dos', () => {
    expect(t('Hola', 'en')).toBe('Hola')
  })

  it('no revienta con undefined', () => {
    expect(t(undefined)).toBe('')
  })

  it('onlyPrimary deja el inglés vacío, no ausente', () => {
    expect(onlyPrimary('Hola')).toEqual({ es: 'Hola', en: '' })
  })
})

describe('el arco cabe', () => {
  it('el texto actual está dentro del tope combinado', () => {
    const regla = cargar('contact.json').rules[0]
    const actual = 'Estás listo para trabajar juntos'
    expect(actual.length).toBeLessThanOrEqual(regla.max)
  })
})
