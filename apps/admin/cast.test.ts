/**
 * Tests del CAST entre el documento del editor y los bloques tipados.
 *
 * Es la pieza donde un fallo no se ve: el artículo se guarda mal y nadie se
 * entera hasta que alguien lo abre publicado. Por eso se prueba sola, y sobre
 * todo se prueba la IDA Y VUELTA — que es lo que garantiza que abrir y guardar
 * sin tocar nada no destruya el contenido.
 */
import { describe, expect, it } from 'vitest'
import { bloquesADocumento, documentoABloques, type Bloque } from './src/components/fields/cast'

const ida = (bloques: Bloque[]) => documentoABloques(bloquesADocumento(bloques))

describe('los seis tipos sobreviven la ida y vuelta', () => {
  const casos: [string, Bloque][] = [
    ['párrafo', { type: 'paragraph', text: 'Un párrafo normal.' }],
    ['subtítulo', { type: 'heading', text: 'Lo que tenían en común' }],
    ['cita', { type: 'quote', text: 'Una cita corta.' }],
    ['lista', { type: 'list', ordered: false, items: ['uno', 'dos'] }],
    ['lista numerada', { type: 'list', ordered: true, items: ['primero'] }],
    ['código', { type: 'code', code: 'const x = 1', language: 'ts' }],
    ['imagen', { type: 'image', src: '/foto.jpg', caption: 'Un pie' }],
  ]

  it.each(casos)('%s', (_n, bloque) => {
    expect(ida([bloque])[0]).toMatchObject(bloque)
  })

  it('un artículo entero conserva el orden', () => {
    const bloques = casos.map(([, b]) => b)
    expect(ida(bloques).map((b) => b.type)).toEqual(bloques.map((b) => b.type))
  })
})

describe('el texto con formato', () => {
  it('conserva negrita, cursiva, código y enlace', () => {
    const bloque: Bloque = {
      type: 'paragraph',
      text: [
        { text: 'normal ' },
        { text: 'negrita', bold: true },
        { text: ' y ' },
        { text: 'enlace', href: 'https://example.com' },
      ],
    }
    expect(ida([bloque])[0]).toMatchObject(bloque)
  })

  it('un texto SIN marcas se guarda como cadena, no como fragmentos', () => {
    // Es la forma heredada: más corta de leer en la consola y la que ya tienen
    // los artículos sembrados.
    expect(ida([{ type: 'paragraph', text: 'Sin marcas' }])[0].text).toBe('Sin marcas')
  })

  it('funde fragmentos contiguos con las mismas marcas', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'uno ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'dos', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    }
    expect(documentoABloques(doc)[0].text).toEqual([{ text: 'uno dos', bold: true }])
  })
})

describe('los enlaces se saneen al guardar, no al pintar', () => {
  const conHref = (href: string) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'clic', marks: [{ type: 'link', attrs: { href } }] }],
      },
    ],
  })

  it('acepta http, https, rutas internas y mailto', () => {
    for (const href of ['https://a.com', 'http://a.com', '/blog/x', 'mailto:a@b.com']) {
      const t = documentoABloques(conHref(href))[0].text as { href?: string }[]
      expect(t[0].href).toBe(href)
    }
  })

  it('descarta javascript: y data: — mueren antes de llegar a Firestore', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>']) {
      const t = documentoABloques(conHref(href))[0].text
      // Sin marcas válidas, vuelve a ser cadena pelada.
      expect(t).toBe('clic')
    }
  })
})

describe('la limpieza al guardar', () => {
  it('descarta los párrafos vacíos del final', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [] },
      ],
    }
    expect(documentoABloques(doc)).toHaveLength(1)
  })

  it('un documento vacío da un array vacío, no basura', () => {
    expect(documentoABloques({ type: 'doc', content: [] })).toEqual([])
    expect(documentoABloques(null)).toEqual([])
  })

  it('un array vacío da un documento con un párrafo, o el editor no arranca', () => {
    expect(bloquesADocumento([]).content).toEqual([{ type: 'paragraph' }])
  })

  it('un salto manual se pega al fragmento anterior', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'línea' },
            { type: 'hardBreak' },
            { type: 'text', text: 'otra' },
          ],
        },
      ],
    }
    expect(documentoABloques(doc)[0].text).toBe('línea\notra')
  })
})

describe('los datos que ya existen', () => {
  it('un bloque sembrado (texto plano) entra y sale igual', () => {
    const sembrado: Bloque = {
      type: 'paragraph',
      text: 'Cuando alguien me enseña una foto que no funciona, lo primero que me dice es qué cámara usó.',
    }
    expect(ida([sembrado])[0]).toEqual(sembrado)
  })

  it('una lista sembrada de cadenas entra y sale igual', () => {
    const sembrado: Bloque = { type: 'list', ordered: true, items: ['uno', 'dos', 'tres'] }
    expect(ida([sembrado])[0]).toMatchObject(sembrado)
  })
})

/**
 * Las dos pérdidas de datos que el contenido real destapó.
 *
 * Los tests de arriba pasaban y aun así el editor destruía contenido: probaban
 * el CAST, que era correcto, mientras el que perdía cosas era el EDITOR, por no
 * tener esos nodos en su esquema. Estos fijan el contrato para que no vuelva.
 */
describe('lo que el contenido real tenía y se perdía', () => {
  it('una cita conserva su autor', () => {
    const bloque: Bloque = {
      type: 'quote',
      text: 'Un preset es una decisión que tomaste una vez.',
      cite: 'Karol',
    }
    expect(ida([bloque])[0]).toMatchObject(bloque)
  })

  it('una cita SIN autor no inventa el campo', () => {
    // Guardar `cite: ''` llenaría Firestore de cadenas vacías y además haría
    // que un bloque sin autor se viera distinto de uno con autor borrado.
    expect(ida([{ type: 'quote', text: 'Sin autor' }])[0]).not.toHaveProperty('cite')
  })

  it('una imagen conserva src y pie', () => {
    const bloque: Bloque = { type: 'image', src: '/foto.jpg', caption: 'Un pie que importa' }
    expect(ida([bloque])[0]).toMatchObject(bloque)
  })

  it('el artículo real con imagen y cita sobrevive entero', () => {
    const articulo: Bloque[] = [
      { type: 'paragraph', text: 'Primer párrafo.' },
      { type: 'heading', text: 'Un apartado' },
      { type: 'image', src: '/a.jpg', caption: 'Pie' },
      { type: 'quote', text: 'Una cita.', cite: 'Alguien' },
      { type: 'list', ordered: false, items: ['uno', 'dos'] },
      { type: 'code', code: 'const x = 1', language: 'ts' },
    ]
    expect(ida(articulo)).toMatchObject(articulo)
  })
})
