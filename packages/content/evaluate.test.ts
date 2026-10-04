/**
 * Tests del evaluador.
 *
 * El objetivo no es "los operadores funcionan" sino las tres cosas que hunden
 * estos motores: que los ciclos se detecten ANTES de renderizar, que el grafo
 * no reevalúe de más, y que los campos localizados no rompan la comparación.
 */
import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  evaluate,
  evaluateAffected,
  evaluateAll,
  SchemaCycleError,
} from './src/compiler/evaluate'
import type { Condition } from './src/meta/types'

const row = {
  priority: 'hero',
  draft: false,
  readTime: 7,
  title: { es: 'Hola', en: '' },
  empty: { es: '', en: '' },
  tags: ['a', 'b'],
}

describe('operadores', () => {
  const casos: [Condition, boolean][] = [
    [{ field: 'priority', op: 'eq', value: 'hero' }, true],
    [{ field: 'priority', op: 'ne', value: 'hero' }, false],
    [{ field: 'priority', op: 'in', value: ['hero', 'high'] }, true],
    [{ field: 'priority', op: 'notIn', value: ['hero'] }, false],
    [{ field: 'readTime', op: 'gt', value: 5 }, true],
    [{ field: 'readTime', op: 'gte', value: 7 }, true],
    [{ field: 'readTime', op: 'lt', value: 7 }, false],
    [{ field: 'readTime', op: 'lte', value: 7 }, true],
    [{ field: 'draft', op: 'eq', value: false }, true],
    [{ field: 'tags', op: 'lengthGt', value: 1 }, true],
    [{ field: 'tags', op: 'lengthLt', value: 5 }, true],
    [{ field: 'priority', op: 'matches', value: '^he' }, true],
  ]
  it.each(casos)('%o → %s', (condition, esperado) => {
    expect(evaluate(condition, row)).toBe(esperado)
  })
})

describe('campos localizados', () => {
  it('compara contra el idioma primario, no contra el objeto', () => {
    expect(evaluate({ field: 'title', op: 'eq', value: 'Hola' }, row)).toBe(true)
  })

  it('un localizado con el primario vacío cuenta como vacío', () => {
    expect(evaluate({ field: 'empty', op: 'empty' }, row)).toBe(true)
    expect(evaluate({ field: 'title', op: 'notEmpty' }, row)).toBe(true)
  })

  it('una clave que no existe está vacía, no revienta', () => {
    expect(evaluate({ field: 'noExiste', op: 'empty' }, row)).toBe(true)
  })
})

describe('combinadores', () => {
  it('all exige todas', () => {
    expect(
      evaluate(
        { all: [{ field: 'priority', op: 'eq', value: 'hero' }, { field: 'draft', op: 'eq', value: false }] },
        row,
      ),
    ).toBe(true)
  })

  it('any basta con una', () => {
    expect(
      evaluate(
        { any: [{ field: 'priority', op: 'eq', value: 'nope' }, { field: 'draft', op: 'eq', value: false }] },
        row,
      ),
    ).toBe(true)
  })

  it('not invierte, y se puede anidar', () => {
    expect(evaluate({ not: { not: { field: 'draft', op: 'eq', value: false } } }, row)).toBe(true)
  })
})

describe('el grafo de dependencias', () => {
  const fields = [
    { key: 'draft' },
    { key: 'priority' },
    { key: 'scheduledAt', visible: { field: 'draft', op: 'eq', value: true } as Condition },
    {
      key: 'coverPosition',
      visible: {
        all: [
          { field: 'priority', op: 'eq', value: 'hero' },
          { field: 'draft', op: 'eq', value: false },
        ],
      } as Condition,
    },
  ]

  it('mapea quién depende de quién', () => {
    const g = buildGraph(fields)
    expect(g.dependents.get('draft')).toEqual(['scheduledAt', 'coverPosition'])
    expect(g.dependents.get('priority')).toEqual(['coverPosition'])
  })

  it('un campo del que no depende nadie no reevalúa nada', () => {
    const g = buildGraph(fields)
    const antes = evaluateAll(g, row)
    // Identidad, no igualdad: se devuelve el MISMO Map, así que Vue no
    // invalida nada al escribir en un campo sin dependientes.
    expect(evaluateAffected(g, row, 'title', antes)).toBe(antes)
  })

  it('cambiar `draft` reevalúa sus dos dependientes', () => {
    const g = buildGraph(fields)
    const antes = evaluateAll(g, { ...row, draft: false })
    expect(antes.get('scheduledAt')).toBe(false)
    expect(antes.get('coverPosition')).toBe(true)

    const despues = evaluateAffected(g, { ...row, draft: true }, 'draft', antes)
    expect(despues.get('scheduledAt')).toBe(true)
    expect(despues.get('coverPosition')).toBe(false)
  })
})

describe('los ciclos', () => {
  it('se detectan al construir el grafo, no al renderizar', () => {
    expect(() =>
      buildGraph([
        { key: 'a', visible: { field: 'b', op: 'notEmpty' } },
        { key: 'b', visible: { field: 'a', op: 'notEmpty' } },
      ]),
    ).toThrow(SchemaCycleError)
  })

  it('también los indirectos', () => {
    expect(() =>
      buildGraph([
        { key: 'a', visible: { field: 'b', op: 'notEmpty' } },
        { key: 'b', visible: { field: 'c', op: 'notEmpty' } },
        { key: 'c', visible: { field: 'a', op: 'notEmpty' } },
      ]),
    ).toThrow(SchemaCycleError)
  })

  it('el mensaje nombra el camino, que es lo que hace falta para arreglarlo', () => {
    try {
      buildGraph([
        { key: 'a', visible: { field: 'b', op: 'notEmpty' } },
        { key: 'b', visible: { field: 'a', op: 'notEmpty' } },
      ])
    } catch (e) {
      expect((e as Error).message).toMatch(/a → b → a|b → a → b/)
    }
  })

  it('una cadena sin ciclo no molesta', () => {
    expect(() =>
      buildGraph([
        { key: 'a', visible: { field: 'b', op: 'notEmpty' } },
        { key: 'b', visible: { field: 'c', op: 'notEmpty' } },
      ]),
    ).not.toThrow()
  })
})
