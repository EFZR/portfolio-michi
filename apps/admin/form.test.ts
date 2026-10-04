/**
 * Tests del MOTOR DE FORMULARIOS.
 *
 * Se ejercita contra los esquemas REALES del repo, no contra maquetas: si
 * `contact.json` cambia y rompe el motor, estos tests lo dicen.
 */
import { describe, expect, it } from 'vitest'
import { metaSchema, type SchemaDoc } from '@princess/content'
import { useDynamicForm } from './src/composables/useDynamicForm'
import contactJson from '../../packages/content/src/schemas/contact.json'
import projectJson from '../../packages/content/src/schemas/project.json'

const contact = metaSchema.parse(contactJson) as SchemaDoc
const project = metaSchema.parse(projectJson) as SchemaDoc

const es = (t: string) => ({ es: t, en: '' })

const contactoValido = () => ({
  arcTitle: es('Estás listo para trabajar'),
  arcAccent: es('juntos'),
  statement: es('Hagamos algo que la gente'),
  statementAccent: es('recuerde'),
  phrase: es('Escríbeme a {email} — trabajo desde {location}.'),
})

describe('estado básico', () => {
  it('arranca limpio y se ensucia al escribir', () => {
    const f = useDynamicForm(contact, contactoValido())
    expect(f.dirty.value).toBe(false)
    f.change('arcAccent', es('contigo'))
    expect(f.dirty.value).toBe(true)
    expect(f.data.arcAccent).toEqual(es('contigo'))
  })

  it('reset devuelve al estado inicial', () => {
    const f = useDynamicForm(contact, contactoValido())
    f.change('arcAccent', es('xxx'))
    f.reset()
    expect(f.dirty.value).toBe(false)
    expect(f.data.arcAccent).toEqual(es('juntos'))
  })
})

describe('validación por campo', () => {
  it('no marca error antes de tocar el campo', () => {
    const f = useDynamicForm(contact, { ...contactoValido(), arcTitle: es('') })
    expect(f.errors.arcTitle ?? '').toBe('')
  })

  it('marca error al escribir de más', () => {
    const f = useDynamicForm(contact, contactoValido())
    f.change('arcTitle', es('x'.repeat(27)))
    expect(f.errors.arcTitle).toMatch(/26/)
  })

  it('el mensaje incluye el PORQUÉ del tope, no solo el número', () => {
    const f = useDynamicForm(contact, contactoValido())
    f.change('arcTitle', es('x'.repeat(27)))
    expect(f.errors.arcTitle).toMatch(/bézier|arco|tamaño/i)
  })

  it('el tope se aplica por idioma, no a la suma', () => {
    const f = useDynamicForm(contact, contactoValido())
    f.change('arcTitle', { es: 'Corto', en: 'x'.repeat(27) })
    expect(f.errors.arcTitle).not.toBe('')
  })
})

describe('reglas cruzadas', () => {
  it('validateAll acepta el texto actual', () => {
    expect(useDynamicForm(contact, contactoValido()).validateAll()).toBe(true)
  })

  it('rechaza el combinado aunque cada mitad quepa', () => {
    const f = useDynamicForm(contact, {
      ...contactoValido(),
      arcTitle: es('¿Estás listo para trabajar'), // 26, dentro de su tope
      arcAccent: es('conmigo ya'), // 10, dentro del suyo
    })
    expect(f.validateAll()).toBe(false)
    expect(f.errors.arcTitle).toMatch(/34|arco/i)
  })
})

describe('el payload', () => {
  it('sale con todos los campos visibles', () => {
    const f = useDynamicForm(contact, contactoValido())
    expect(Object.keys(f.payload()).sort()).toEqual(
      ['arcAccent', 'arcTitle', 'phrase', 'statement', 'statementAccent'].sort(),
    )
  })
})

describe('un esquema grande con lista y enum', () => {
  const valido = () => ({
    slug: 'manifiesto-aurora',
    title: es('Manifiesto Aurora'),
    category: 'marketing',
    summary: es('Relanzamiento de una casa de perfumería botánica.'),
    description: es('Aurora llevaba seis años vendiendo sin decir quién era.'),
    // El campo es `media`: el valor es el ID de la biblioteca, no una URL.
    image: 'a3019c0e70e8a473',
    client: es('Aurora Botánica'),
    year: 2026,
    role: es('Estrategia de marca'),
    location: es('Ciudad de México'),
    tags: [es('Posicionamiento')],
    order: 0,
    draft: false,
  })

  it('valida entero', () => {
    expect(useDynamicForm(project, valido()).validateAll()).toBe(true)
  })

  it('rechaza un slug con mayúsculas', () => {
    const f = useDynamicForm(project, { ...valido(), slug: 'Manifiesto Aurora' })
    expect(f.validateAll()).toBe(false)
  })

  it('rechaza más etiquetas de las que caben', () => {
    const f = useDynamicForm(project, {
      ...valido(),
      tags: Array.from({ length: 7 }, () => es('x')),
    })
    expect(f.validateAll()).toBe(false)
  })

  it('un campo opcional vacío no bloquea el guardado', () => {
    const f = useDynamicForm(project, { ...valido(), slugEn: undefined })
    expect(f.validateAll()).toBe(true)
  })
})

describe('visibilidad', () => {
  /** Ningún esquema real declara condiciones todavía; se prueba con uno hecho. */
  const conCondicion = metaSchema.parse({
    id: 'prueba',
    label: 'Prueba',
    version: 1,
    format: 1,
    target: { collection: 'x' },
    fields: [
      { key: 'draft', type: 'boolean', label: 'Borrador' },
      {
        key: 'scheduledAt',
        type: 'date',
        label: 'Publicar el',
        visible: { field: 'draft', op: 'eq', value: true },
      },
    ],
    rules: [],
    groups: [],
  }) as SchemaDoc

  it('oculta el campo cuando la condición no se cumple', () => {
    const f = useDynamicForm(conCondicion, { draft: false })
    expect(f.isVisible('scheduledAt')).toBe(false)
  })

  it('lo revela al cambiar el campo del que depende', () => {
    const f = useDynamicForm(conCondicion, { draft: false })
    f.change('draft', true)
    expect(f.isVisible('scheduledAt')).toBe(true)
  })

  it('un obligatorio OCULTO no bloquea el guardado', () => {
    // Es el bug más confuso de estos motores: pulsas Guardar, no pasa nada, y
    // el error está en un campo que nadie puede ver.
    const f = useDynamicForm(conCondicion, { draft: false })
    expect(f.validateAll()).toBe(true)
  })

  it('el mismo campo, visible y vacío, SÍ bloquea', () => {
    const f = useDynamicForm(conCondicion, { draft: true })
    expect(f.validateAll()).toBe(false)
  })

  it('lo oculto no se guarda', () => {
    const f = useDynamicForm(conCondicion, { draft: false, scheduledAt: '2026-01-01' })
    expect(f.payload()).toEqual({ draft: false })
  })
})
