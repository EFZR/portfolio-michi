# Fase 2 · UI dinámica dirigida por metadatos

Validación y refinamiento de la arquitectura de _Dynamic UI Rendering_ para el
panel de escritorio: una colección de esquemas en el backend, consumida por
Tauri, que genera los controles del formulario.

Complementa [`fase-2-panel-admin.md`](./fase-2-panel-admin.md) y **corrige su §5
y su §4**: allí los formularios se generaban desde esquemas Zod escritos a mano
en el repo y las reglas de Firestore replicaban cada tope; aquí los esquemas
viven en Firestore y las reglas se simplifican (§5.5). El resto del documento
—modelo de datos, hoja de ruta— sigue vigente.

---

## 1. El requisito que manda: compilar el panel una sola vez

El panel es un binario instalado en la máquina de Karol. Cada versión nueva es
un `tauri build`, firmar el instalador, pasárselo y que ella lo instale. Así que
el requisito real del sistema es este:

> **El panel se publica una vez. Todo lo demás se dibuja desde los parámetros.**

Eso determina el resto del documento, y determina también dónde vive el esquema.

### 1.1 El flujo de trabajo que hay que soportar

```
1. Karol quiere una sección nueva y dice qué contenido lleva
2. Emerson publica el ESQUEMA de esa sección (un JSON en Firestore)
3. El panel que ella YA tiene instalado muestra el formulario nuevo
4. Ella llena el contenido mientras la sección se está desarrollando
5. Emerson publica la web con la sección ya montada, y el contenido ya está ahí
```

Los pasos 3 y 4 son lo que hace valiosa la arquitectura: **el contenido se
carga en paralelo al desarrollo**, no después. Y ninguno de los dos exige tocar
el binario del panel.

Con el esquema bundleado dentro del ejecutable, el paso 3 se convierte en
«compilar, firmar, enviar, instalar» y el paso 4 en «esperar». Es la fricción
que hay que eliminar, y es la razón por la que el esquema **vive en Firestore**.

### 1.2 Dónde vive cada cosa

| Pieza                                                        | Dónde                                             | Por qué                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Esquemas** (los parámetros)                                | **Firestore**, fuente de verdad                   | Cambian sin releasear el panel. Es el requisito.                                                                      |
| **Espejo de los esquemas**                                   | El repo, sincronizado con `npm run esquemas:pull` | Dos usos: que el panel arranque sin red, y tener historial en git de qué cambió y cuándo. Es un espejo, no el origen. |
| **Vocabulario** (tipos de campo, operadores, tipos de regla) | El binario del panel                              | Es lo único que exige un release. Por eso se construye completo de entrada (§1.4).                                    |
| **Contenido**                                                | Firestore                                         | Lo sube Karol desde el panel.                                                                                         |

### 1.3 Los límites que salen de la maquetación

Hay topes que no son preferencia editorial sino geometría. El más claro:
`contacto.arcoTitulo ≤ 26` existe porque `ContactSection.vue:263` dibuja una
bézier de ~1859 unidades y pinta el titular encima a 145 px — pasados ~34
caracteres (titular + acento) las letras de los extremos quedan volcadas.

**El tope se escribe en el esquema y punto.** Quien lo edita es la misma persona
que escribió el arco, así que no hay nada que proteger: el número y la curva
tienen el mismo autor.

Lo único que conviene es dejar una señal en el sitio donde vive la geometría,
para el día —dentro de seis meses— en que se aplane la curva o se cambie el
tamaño de letra y ya no se recuerde que hay un 26 en Firestore:

```html
<!--
  El tope de esta frase (26 + 10, 34 combinados) vive en `esquemas/contacto`.
  Si tocas la bézier o el font-size, actualízalo allí: el panel no puede
  enterarse solo de que la curva cambió.
-->
<svg viewBox="0 272 1800 410" class="w-full" fill="none"></svg>
```

Un comentario, no una arquitectura. `npm run esquemas:pull` + `git diff` da el
resto del rastro.

### 1.4 La consecuencia que hay que aceptar

En este diseño hay dos cosas con costes muy distintos:

|                                                                                             | Coste                                    |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Añadir una **instancia** — un campo, una regla de un tipo que ya existe, una sección entera | Publicar un JSON. Gratis.                |
| Añadir **vocabulario** — un tipo de campo nuevo, un operador nuevo, un tipo de regla nuevo  | Release del panel + reinstalación. Caro. |

De ahí sale la regla de diseño de todo el motor:

> **El vocabulario se construye completo en la v1, aunque hoy no se use.
> Las instancias se publican cuando hagan falta.**

Es lo contrario del consejo habitual de «construye lo mínimo y crece». Aquí
crecer cuesta un instalador, así que los 10 tipos de campo (§2.3), los 13
operadores (§2.4) y los 5 tipos de regla (§2.2) se implementan de entrada
—cuesten o no— y después no se vuelven a tocar.

### 1.5 «Una sola vez» es una aspiración, no una garantía

Conviene decirlo claro: **tarde o temprano habrá un release.** El día que Karol
quiera una sección con, por ejemplo, testimonios con puntuación de estrellas, o
un selector de color, eso es vocabulario nuevo. Dos cosas lo hacen raro en vez
de constante:

**1. El vocabulario es componible.** `grupo`, `lista` y `tupla` se anidan entre
sí, y eso cubre formas que no se anticiparon. Una sección de testimonios es
`lista` de `grupo{ texto, texto, entero }` — sin widget nuevo. La mayoría de
«tipos nuevos» que uno cree necesitar son composiciones de los que ya hay.

**2. El actualizador automático de Tauri.** El plugin `updater` hace que el
panel se actualice solo al abrirse: se firma el build, se publica un `latest.json`
(vale un archivo estático en Netlify) y la app se encarga del resto. Convierte
«compilar, firmar, enviar, instalar» en «Emerson publica y ella abre el panel».
Es ~1 h de configuración en el paso 6 y elimina la fricción que queda.

Con las dos, un release deja de ser un evento.

---

## 2. Esquema JSON de la colección de parámetros

### 2.1 Dónde vive

```
firestore/
└── esquemas/{seccionId}        ← un documento por sección
    ├── contacto                ← las 5 claves del arco y el statement
    ├── hero                    ← las 9 del Hero
    ├── proyecto                ← la ficha de proyecto (entidad)
    ├── articulo                ← la ficha de artículo (entidad)
    └── …                       ← 13 grupos de micro-copy + 4 entidades
```

Un documento por sección, no uno gigante: el panel carga el esquema del módulo
que se abre (§3.6), y Firestore factura por documento leído.

### 2.2 Documento completo — `esquemas/contacto`

```jsonc
{
  "id": "contacto",
  "etiqueta": "Contacto (portada)",
  "descripcion": "El titular en arco y la frase de cierre del Home.",

  // Versión del CONTENIDO del esquema. Sube en cada publicación; el panel la
  // usa como clave de caché del compilado.
  "version": 7,

  // Versión del FORMATO. El panel se niega a renderizar un formato que no
  // entiende, en vez de pintar medio formulario. Ver §3.2.
  "formato": 1,

  // Ruta del documento que este esquema describe.
  "destino": { "coleccion": "config", "documento": "ui", "prefijo": "contacto" },

  "campos": [
    {
      "clave": "arcoTitulo",
      "tipo": "texto",
      "etiqueta": "Titular del arco",
      "ayuda": "Va curvado sobre una bézier de 1859 unidades a 145px. No hay palanca de tamaño.",
      "requerido": true,
      "restricciones": { "minLength": 1, "maxLength": 26 },
      "ui": { "control": "input", "contador": true, "grupo": "arco", "orden": 1 },
    },
    {
      "clave": "arcoAcento",
      "tipo": "texto",
      "etiqueta": "Palabra acentuada",
      "ayuda": "Se pinta en cursiva Ultraviolet al final del arco.",
      "requerido": true,
      "restricciones": { "minLength": 1, "maxLength": 10 },
      "ui": { "control": "input", "contador": true, "grupo": "arco", "orden": 2 },
    },
    {
      "clave": "statement",
      "tipo": "texto",
      "etiqueta": "Frase principal",
      "requerido": true,
      "restricciones": { "maxLength": 60 },
      "ui": { "control": "input", "contador": true, "grupo": "bloque", "orden": 1 },
    },
    {
      "clave": "frase",
      "tipo": "texto",
      "etiqueta": "Frase de contacto",
      "ayuda": "Admite {email} y {lugar}.",
      "requerido": true,
      "restricciones": {
        "maxLength": 160,
        "plantilla": { "variables": ["email", "lugar"], "obligatorias": ["email"] },
      },
      "ui": { "control": "textarea", "filas": 3, "contador": true, "grupo": "bloque", "orden": 2 },
    },
  ],

  // Restricciones que NINGÚN campo puede validar por su cuenta (§4.3).
  "reglas": [
    {
      "id": "arco-cabe",
      "tipo": "longitudCombinada",
      "campos": ["arcoTitulo", "arcoAcento"],
      "separador": " ",
      "max": 34,
      "anclaje": "arcoTitulo",
      "mensaje": "El titular y el acento suman más de 34 caracteres: no caben en el arco.",
    },
  ],

  "grupos": [
    { "id": "arco", "etiqueta": "El arco", "orden": 1 },
    { "id": "bloque", "etiqueta": "El bloque de abajo", "orden": 2 },
  ],
}
```

### 2.3 Los tipos de campo

Cerrados. Un `tipo` desconocido no se renderiza: se avisa (§3.5).

| `tipo`     | Restricciones propias                           | Controles                                       |
| ---------- | ----------------------------------------------- | ----------------------------------------------- |
| `texto`    | `minLength`, `maxLength`, `patron`, `plantilla` | `input` · `textarea` · `slug` · `email` · `url` |
| `entero`   | `min`, `max`, `multiploDe`                      | `input` · `stepper`                             |
| `booleano` | —                                               | `switch` · `checkbox`                           |
| `enum`     | `opciones[]` **o** `origen` (§2.5)              | `select` · `radios`                             |
| `fecha`    | `min`, `max`                                    | `date`                                          |
| `imagen`   | `proporcion`, `tamanoMaxMB`, `formatos[]`       | `subidor`                                       |
| `tupla`    | `elementos[]` (longitud fija)                   | contenedor                                      |
| `lista`    | `elemento`, `minItems`, `maxItems`, `ordenable` | contenedor                                      |
| `grupo`    | `campos[]`                                      | contenedor                                      |
| `custom`   | `widget` (id registrado)                        | escotilla (§3.5)                                |

Tres de estos existen porque el proyecto los necesita y la mayoría de
generadores de formularios no los tienen:

**`tupla`** — el H1 del Hero son _exactamente_ cinco palabras: el template les
aplica sangrías distintas por índice. Una lista con `minItems: 5, maxItems: 5`
no es lo mismo: en una tupla cada posición tiene su propia etiqueta y su propio
límite.

```jsonc
{
  "clave": "palabras",
  "tipo": "tupla",
  "etiqueta": "Titular (5 palabras, una por línea)",
  "ayuda": "La quinta va en cursiva UV y es la que más sangra. Añadir una sexta no es copy: es rediseñar el Hero.",
  "elementos": [
    { "tipo": "texto", "etiqueta": "Palabra 1", "restricciones": { "maxLength": 12 } },
    { "tipo": "texto", "etiqueta": "Palabra 2", "restricciones": { "maxLength": 12 } },
    { "tipo": "texto", "etiqueta": "Palabra 3", "restricciones": { "maxLength": 12 } },
    { "tipo": "texto", "etiqueta": "Palabra 4", "restricciones": { "maxLength": 12 } },
    { "tipo": "texto", "etiqueta": "Palabra acentuada", "restricciones": { "maxLength": 10 } },
  ],
  "ui": { "control": "contenedor", "orientacion": "vertical" },
}
```

**`imagen` con `proporcion`** — la relación 4:5 de las fichas de proyecto _es_ el
layout de la retícula. Una imagen cuadrada no rompe nada (hay `object-cover`),
pero recorta la cabeza del retrato, que es exactamente el error que un panel
debe atrapar.

```jsonc
{
  "clave": "imagen",
  "tipo": "imagen",
  "etiqueta": "Imagen principal",
  "restricciones": {
    "proporcion": { "ancho": 4, "alto": 5, "tolerancia": 0.03 },
    "tamanoMaxMB": 5,
    "formatos": ["image/jpeg", "image/png", "image/webp", "image/avif"],
  },
  "ui": { "control": "subidor", "destino": "proyectos/{slug}/principal.webp" },
}
```

**`custom`** — la escotilla. El editor de bloques del blog es un árbol
polimórfico con arrastre y vista previa; expresarlo en JSON declarativo sería
reinventar un lenguaje de programación. Se declara y se implementa en TypeScript:

```jsonc
{
  "clave": "content",
  "tipo": "custom",
  "widget": "editorBloques",
  "etiqueta": "Contenido",
  "restricciones": { "minItems": 1, "maxItems": 120 },
}
```

### 2.4 Visibilidad condicional

```jsonc
{
  "clave": "fechaProgramada",
  "tipo": "fecha",
  "etiqueta": "Publicar el",
  "visible": { "campo": "borrador", "op": "eq", "valor": true },
}
```

Compuesta, con un árbol de tres combinadores (`todos` / `alguno` / `no`):

```jsonc
{
  "clave": "posicionPortada",
  "tipo": "entero",
  "etiqueta": "Posición en portada",
  "visible": {
    "todos": [
      { "campo": "priority", "op": "eq", "valor": "hero" },
      { "campo": "borrador", "op": "eq", "valor": false },
      { "no": { "campo": "coverImage", "op": "vacio" } },
    ],
  },
}
```

Operadores, cerrados: `eq` · `ne` · `in` · `noIn` · `gt` · `gte` · `lt` · `lte`
· `vacio` · `noVacio` · `longitudGt` · `longitudLt` · `coincide` (regex).

**Nunca strings de JavaScript evaluados.** Un `"visible": "datos.x > 3 && …"`
resuelto con `eval` o `new Function` convierte la base de datos en superficie de
ejecución de código, mata el tree-shaking, rompe la CSP que hay que configurar
igualmente para Firestore (`fase-2-panel-admin.md` §6.2) y hace indepurable
cualquier error. Un conjunto cerrado de operadores se puede tipar en TypeScript,
verificar en tiempo de compilación del esquema y reportar con un mensaje útil.

### 2.5 Opciones que salen de otra colección

`articulo.category` se elige de `blog.categorias[]`, y `proyecto.categoria` de la
colección `categorias`. Las opciones no pueden ser literales en el esquema.

```jsonc
{
  "clave": "categoria",
  "tipo": "enum",
  "etiqueta": "Rubro",
  "origen": {
    "coleccion": "categorias",
    "valor": "id",
    "etiqueta": "nombre",
    "ordenPor": "orden",
  },
  "ui": { "control": "select" },
}
```

El compilador no puede producir un `z.enum([...])` cerrado aquí — no conoce los
valores hasta que se resuelve el origen. Produce
`z.string().refine(v => contexto.opciones.categoria.has(v))`, donde `contexto`
se inyecta al compilar (§3.3). Es el motivo por el que **el compilador recibe un
contexto y no solo el JSON**.

### 2.6 Meta-esquema

El JSON que baja de Firestore es entrada no confiable: lo escribió un proceso de
build que puede tener un fallo, o una mano en la consola de Firebase. Antes de
tocarlo, se valida contra un esquema Zod **estático**, escrito a mano y
bundleado en el panel:

```typescript
// packages/contenido/src/meta/metaEsquema.ts
import { z } from 'zod'

const condicionHoja = z.object({
  campo: z.string(),
  op: z.enum([
    'eq',
    'ne',
    'in',
    'noIn',
    'gt',
    'gte',
    'lt',
    'lte',
    'vacio',
    'noVacio',
    'longitudGt',
    'longitudLt',
    'coincide',
  ]),
  valor: z.unknown().optional(),
})

// Recursiva: el árbol de condiciones se anida sin límite declarado, así que
// necesita el `get` diferido de z.lazy.
const condicion: z.ZodType = z.lazy(() =>
  z.union([
    condicionHoja,
    z.object({ todos: z.array(condicion).min(1) }),
    z.object({ alguno: z.array(condicion).min(1) }),
    z.object({ no: condicion }),
  ]),
)

const campo: z.ZodType = z.lazy(() =>
  z.object({
    clave: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    tipo: z.enum([
      'texto',
      'entero',
      'booleano',
      'enum',
      'fecha',
      'imagen',
      'tupla',
      'lista',
      'grupo',
      'custom',
    ]),
    etiqueta: z.string().min(1).max(60),
    ayuda: z.string().max(200).optional(),
    requerido: z.boolean().default(true),
    visible: condicion.optional(),
    restricciones: z.record(z.string(), z.unknown()).default({}),
    ui: z.record(z.string(), z.unknown()).default({}),
    // Contenedores
    elementos: z.array(campo).optional(), // tupla
    elemento: campo.optional(), // lista
    campos: z.array(campo).optional(), // grupo
    widget: z.string().optional(), // custom
    origen: z
      .object({
        coleccion: z.string(),
        valor: z.string(),
        etiqueta: z.string(),
        ordenPor: z.string().optional(),
      })
      .optional(),
  }),
)

export const metaEsquema = z.object({
  id: z.string(),
  etiqueta: z.string().max(60),
  descripcion: z.string().max(200).optional(),
  version: z.int().positive(),
  formato: z.literal(1),
  destino: z.object({
    coleccion: z.string(),
    documento: z.string().optional(),
    prefijo: z.string().optional(),
  }),
  campos: z.array(campo).min(1),
  reglas: z
    .array(
      z
        .object({
          id: z.string(),
          tipo: z.enum([
            'longitudCombinada',
            'unicoEnColeccion',
            'sumaMax',
            'requeridoSi',
            'exclusivoMutuo',
          ]),
          mensaje: z.string().max(200),
        })
        .passthrough(),
    )
    .default([]),
  grupos: z
    .array(
      z.object({
        id: z.string(),
        etiqueta: z.string().max(40),
        orden: z.int(),
      }),
    )
    .default([]),
})

export type Esquema = z.infer<typeof metaEsquema>
```

**Este archivo es el único que no se genera.** Es el contrato entre el
compilador de esquemas y el panel, y se escribe a mano precisamente porque es lo
que valida todo lo demás.

---

## 3. Arquitectura del frontend

Seis capas. Cada una recibe el resultado de la anterior y no conoce a las de
abajo — es lo que hace depurable un sistema donde el formulario es un dato.

```
   Firestore  esquemas/{id}  ──┐
                               │
 ① TRANSPORTE   carga + caché + snapshot bundleado de respaldo
                               ▼
 ② VALIDACIÓN   metaEsquema.parse(json)      → Esquema (tipado) | fallback
                               ▼
 ③ COMPILADOR   Esquema + contexto → { zod, grafo, orden }   (memoizado)
                               ▼
 ④ ESTADO       datos · visibles · errores · sucios          (reactivo)
                               ▼
 ⑤ RENDERIZADO  <CampoDinamico> recursivo → registro de widgets
                               ▼
 ⑥ WIDGETS      BaseField + input/textarea/select/subidor/custom
```

### 3.1 ① Transporte

```typescript
// apps/admin/src/esquemas/cargar.ts
import { doc, getDoc } from 'firebase/firestore'
import instantaneas from '@princess/contenido/instantaneas.json'

/**
 * El snapshot bundleado no es solo una optimización: es lo que hace que el
 * panel ARRANQUE sin red. Una app de escritorio que muestra una pantalla en
 * blanco porque el wifi del café va mal es una app rota.
 *
 * OJO con la dirección: Firestore es la FUENTE, el espejo es una copia que se
 * baja con `npm run esquemas:pull`. Que el espejo esté viejo es lo normal y no
 * es un error — solo significa que se publicaron esquemas desde la última
 * sincronización. Se avisa para que nadie confunda "mi git está atrasado" con
 * "el panel está roto".
 */
export async function cargarEsquema(id: string): Promise<{ json: unknown; fuente: Fuente }> {
  const local = instantaneas[id]
  try {
    const snap = await getDoc(doc(db, 'esquemas', id))
    if (!snap.exists()) return { json: local, fuente: 'instantanea' }

    const remoto = snap.data()
    if (local && remoto.version < local.version) {
      // Firestore más viejo que el espejo = alguien revirtió algo. Raro,
      // así que se dice; pero se usa el remoto igual, que es la fuente.
      avisar(
        `El esquema "${id}" en Firestore (v${remoto.version}) es más viejo que el espejo del repo (v${local.version}).`,
      )
    }
    return { json: remoto, fuente: 'remoto' }
  } catch {
    return { json: local, fuente: 'instantanea' }
  }
}
```

### 3.2 ② Validación del esquema

```typescript
const analizado = metaEsquema.safeParse(json)

if (!analizado.success) {
  // Se cae al snapshot ANTES de renderizar nada. Un esquema medio válido
  // produce un formulario medio pintado, que es peor que uno viejo.
  return usarInstantanea(id, analizado.error)
}
```

El campo `formato` es la puerta de compatibilidad. `z.literal(1)` hace que un
esquema con `formato: 2` —publicado por una web más nueva que el panel— falle
aquí y caiga al snapshot, en vez de renderizarse a medias con los campos que el
panel _sí_ entiende. **El fallo es explícito y el panel sigue usable.**

### 3.3 ③ Compilador

Función pura: `(Esquema, Contexto) → Compilado`. Memoizada por
`${id}@${version}` — compilar 105 campos cuesta, y solo cambia al publicar.

```typescript
// packages/contenido/src/compilador/compilar.ts
import { z } from 'zod'
import type { Esquema, Campo, Contexto } from '../meta/metaEsquema'

export interface Compilado {
  /** Esquema Zod del objeto completo, con las reglas cruzadas aplicadas. */
  zod: z.ZodTypeAny
  /** Esquema por campo, para validar uno solo sin parsear el objeto entero. */
  porCampo: Map<string, z.ZodTypeAny>
  /** clave → claves cuya visibilidad depende de ella (§4.2). */
  dependientes: Map<string, string[]>
  /** Orden topológico de evaluación de visibilidad. */
  orden: string[]
}

function compilarHoja(c: Campo, ctx: Contexto): z.ZodTypeAny {
  const r = c.restricciones

  switch (c.tipo) {
    case 'texto': {
      let s = z.string().trim()
      if (r.minLength) s = s.min(r.minLength as number)
      if (r.maxLength) s = s.max(r.maxLength as number, mensajeMax(c))
      if (r.patron) s = s.regex(new RegExp(r.patron as string))
      return s
    }
    case 'entero': {
      let n = z.int()
      if (r.min != null) n = n.min(r.min as number)
      if (r.max != null) n = n.max(r.max as number)
      if (r.multiploDe) {
        const m = r.multiploDe as number
        n = n.refine((v) => v % m === 0, `Tiene que ser múltiplo de ${m}.`)
      }
      return n
    }
    case 'booleano':
      return z.boolean()

    case 'enum': {
      // Opciones literales → enum cerrado. Opciones de otra colección → no se
      // pueden cerrar en tiempo de compilación: se validan contra el contexto.
      if (c.origen) {
        const validos = ctx.opciones.get(c.origen.coleccion) ?? new Set<string>()
        return z.string().refine((v) => validos.has(v), 'Ese valor ya no existe.')
      }
      return z.enum((r.opciones as string[]) ?? [])
    }
    case 'fecha':
      return z.iso.date()

    case 'imagen':
      // La proporción y el peso NO se validan aquí: se comprueban al subir,
      // sobre el File, antes de que exista una URL. Aquí solo queda la URL.
      return z.union([z.url(), z.string().regex(/^\/[\w\-./]+$/)])

    case 'tupla':
      return z.tuple(
        (c.elementos ?? []).map((e) => compilarCampo(e, ctx)) as [z.ZodTypeAny, ...z.ZodTypeAny[]],
      )

    case 'lista': {
      let a = z.array(compilarCampo(c.elemento!, ctx))
      if (r.minItems) a = a.min(r.minItems as number)
      if (r.maxItems) a = a.max(r.maxItems as number)
      return a
    }
    case 'grupo':
      return z.object(
        Object.fromEntries((c.campos ?? []).map((h) => [h.clave, compilarCampo(h, ctx)])),
      )

    case 'custom':
      // El widget trae su propio validador. Si no está registrado, el campo
      // pasa sin validar pero el renderizador avisa (§3.5) — nunca al revés:
      // un esquema estricto sobre un widget que no existe bloquea el guardado
      // de TODO el formulario por un campo que nadie puede editar.
      return ctx.validadores.get(c.widget!) ?? z.unknown()
  }
}

function compilarCampo(c: Campo, ctx: Contexto): z.ZodTypeAny {
  const base = compilarHoja(c, ctx)
  // Un campo oculto NUNCA es obligatorio (§4.4).
  return c.requerido ? base : base.optional()
}
```

Las reglas cruzadas se aplican encima del objeto, como `superRefine`, con un
despachador por `tipo` — **un `switch` cerrado, no un intérprete**:

```typescript
function aplicarReglas(objeto: z.ZodObject, reglas: Regla[]) {
  return objeto.superRefine((datos, ctx) => {
    for (const regla of reglas) {
      switch (regla.tipo) {
        case 'longitudCombinada': {
          const texto = regla.campos.map((k) => datos[k] ?? '').join(regla.separador ?? '')
          if (texto.length > regla.max) {
            ctx.addIssue({ code: 'custom', path: [regla.anclaje], message: regla.mensaje })
          }
          break
        }
        case 'requeridoSi':
          if (evaluar(regla.cuando, datos) && esVacio(datos[regla.campo])) {
            ctx.addIssue({ code: 'custom', path: [regla.campo], message: regla.mensaje })
          }
          break
        case 'sumaMax': {
          const suma = regla.campos.reduce((n, k) => n + String(datos[k] ?? '').length, 0)
          if (suma > regla.max) {
            ctx.addIssue({ code: 'custom', path: [regla.anclaje], message: regla.mensaje })
          }
          break
        }
        // 'unicoEnColeccion' y 'exclusivoMutuo' — mismo patrón.
      }
    }
  })
}
```

**Por qué un `switch` y no un evaluador genérico:** añadir un _caso nuevo_ de
regla exige publicar el panel. Añadir una _instancia_ de una regla existente, no.
Esa es exactamente la línea correcta: las 105 claves y las 4 entidades necesitan
cinco tipos de regla, y crecerán a siete. Un motor de expresiones genérico para
cubrir siete casos es más código, más difícil de depurar y con peores mensajes
de error que siete `case`.

### 3.4 ④ Estado

```typescript
// apps/admin/src/composables/useFormularioDinamico.ts
import { computed, reactive, ref, shallowRef } from 'vue'

export function useFormularioDinamico(compilado: Compilado, iniciales: Record<string, unknown>) {
  const datos = reactive({ ...iniciales })
  const errores = reactive<Record<string, string>>({})
  const tocados = reactive<Record<string, boolean>>({})

  /**
   * Visibilidad. Se recalcula SOLO para los dependientes del campo que cambió
   * (§4.2), no para los 105. `shallowRef` sobre un Map: la visibilidad se
   * reemplaza entera, nunca se muta por dentro, así que la reactividad profunda
   * sería puro coste.
   */
  const visibles = shallowRef(evaluarTodas(compilado, datos))

  function cambiar(clave: string, valor: unknown) {
    datos[clave] = valor
    tocados[clave] = true

    const afectados = compilado.dependientes.get(clave)
    if (afectados?.length) visibles.value = evaluarParciales(compilado, datos, afectados)

    // Validación por campo, no del objeto completo: parsear los 105 en cada
    // pulsación es lo que hunde a los formularios dinámicos (§5.2).
    const esquemaCampo = compilado.porCampo.get(clave)
    const r = esquemaCampo?.safeParse(valor)
    errores[clave] = r && !r.success ? r.error.issues[0].message : ''
  }

  /** Las reglas cruzadas solo corren al salir del campo y al guardar. */
  function alSalir(clave: string) {
    for (const regla of compilado.reglasQueTocan(clave)) revalidarRegla(regla, datos, errores)
  }

  function validarTodo(): boolean {
    // El esquema se re-estrecha a lo VISIBLE antes de parsear (§4.4).
    const r = estrechar(compilado, visibles.value).safeParse(datos)
    if (r.success) return true
    for (const i of r.error.issues) errores[i.path.join('.')] = i.message
    return false
  }

  return { datos, errores, tocados, visibles, cambiar, alSalir, validarTodo }
}
```

### 3.5 ⑤ Renderizado — el componente recursivo

```vue
<!-- apps/admin/src/componentes/CampoDinamico.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { REGISTRO, DESCONOCIDO } from './registro'
import type { Campo } from '@princess/contenido'

const props = defineProps<{
  campo: Campo
  valor: unknown
  error: string
  ruta: string // 'contacto.arcoTitulo' — clave de errores y de v-memo
}>()

const emit = defineEmits<{ cambiar: [ruta: string, valor: unknown] }>()

// El registro devuelve el componente ya pasado por markRaw (ver registro.ts).
const componente = computed(() => REGISTRO[props.campo.tipo] ?? DESCONOCIDO)
</script>

<template>
  <component
    :is="componente"
    :campo="campo"
    :valor="valor"
    :error="error"
    :ruta="ruta"
    @cambiar="(v: unknown) => emit('cambiar', ruta, v)"
  />
</template>
```

```typescript
// apps/admin/src/componentes/registro.ts
import { defineAsyncComponent, markRaw } from 'vue'
import CampoTexto from './campos/CampoTexto.vue'
import CampoEntero from './campos/CampoEntero.vue'
// …

/**
 * markRaw en CADA entrada, y no es opcional.
 *
 * El registro se lee desde un `computed`, así que Vue lo alcanza con su proxy
 * reactivo. Sin markRaw, Vue intenta hacer reactiva la DEFINICIÓN del
 * componente —un objeto grande con render functions dentro— en cada acceso.
 * Es el error clásico de los renderizadores dinámicos: el formulario va bien
 * con 10 campos y se arrastra con 100, y el perfil no señala a ningún sitio
 * obvio porque el coste está repartido por todos los accesos al registro.
 */
export const REGISTRO = {
  texto: markRaw(CampoTexto),
  entero: markRaw(CampoEntero),
  booleano: markRaw(CampoBooleano),
  enum: markRaw(CampoEnum),
  fecha: markRaw(CampoFecha),
  // Pesados y poco usados → asíncronos: no entran en el bundle del login.
  imagen: markRaw(defineAsyncComponent(() => import('./campos/CampoImagen.vue'))),
  tupla: markRaw(CampoTupla),
  lista: markRaw(CampoLista),
  grupo: markRaw(CampoGrupo),
  custom: markRaw(CampoCustom),
} as const

/**
 * Un tipo que este panel no conoce (esquema publicado por una web más nueva).
 * Pinta el valor crudo en solo lectura y dice por qué. Nunca deja un hueco:
 * un campo que desaparece en silencio es un campo que alguien va a dar por
 * guardado.
 */
export const DESCONOCIDO = markRaw(CampoDesconocido)
```

`CampoTupla`, `CampoLista` y `CampoGrupo` renderizan `<CampoDinamico>` **dentro
de sí mismos** — la recursión sale gratis en `<script setup>`, donde un
componente se referencia por su propio nombre de archivo.

### 3.6 ⑥ Widgets

Todos envuelven `BaseField`, que ya resuelve el cableado ARIA por slot
(`id`, `descritoPor`, `invalido`) y pinta el error en Ultraviolet. Ni un
componente de `ui/` cambia.

```vue
<!-- apps/admin/src/componentes/campos/CampoTexto.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import BaseField from '@/ui/BaseField.vue'

const props = defineProps<{ campo: Campo; valor: unknown; error: string }>()
const emit = defineEmits<{ cambiar: [valor: string] }>()

const texto = computed(() => String(props.valor ?? ''))
const tope = computed(() => props.campo.restricciones.maxLength as number | undefined)

/**
 * El contador NO se debounce. Es `length` contra un número: cuesta nada y tiene
 * que ir pegado a la tecla. Lo que se debounce es la VALIDACIÓN (§5.2) — que
 * son dos cosas distintas y confundirlas produce un contador que va a rastras.
 */
const usados = computed(() => texto.value.length)
const proporcion = computed(() => (tope.value ? usados.value / tope.value : 0))
const estado = computed(() =>
  !tope.value
    ? 'ok'
    : usados.value > tope.value
      ? 'error'
      : proporcion.value >= 0.9
        ? 'aviso'
        : 'ok',
)
</script>

<template>
  <BaseField
    :label="campo.etiqueta"
    :error="error"
    :pista="campo.ayuda"
    :opcional="!campo.requerido"
  >
    <template #default="{ id, descritoPor, invalido }">
      <textarea
        v-if="campo.ui.control === 'textarea'"
        :id="id"
        :value="texto"
        :rows="campo.ui.filas ?? 4"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        class="w-full rounded-md border border-border bg-surface px-4 py-3 …"
        @input="emit('cambiar', ($event.target as HTMLTextAreaElement).value)"
      />
      <input
        v-else
        :id="id"
        :value="texto"
        type="text"
        :aria-describedby="descritoPor"
        :aria-invalid="invalido"
        class="w-full rounded-md border border-border bg-surface px-4 py-3 …"
        @input="emit('cambiar', ($event.target as HTMLInputElement).value)"
      />

      <!--
        Al 90 % el contador muestra la AYUDA, no solo el número. El momento en
        que alguien está a punto de pasarse es justo cuando sirve saber por qué
        hay un tope: "máx. 26" parece arbitrario; "no caben más en el arco", no.
      -->
      <p
        v-if="tope"
        class="mt-1.5 text-right font-mono text-xs"
        :class="{
          'text-muted-foreground': estado === 'ok',
          'text-primary': estado === 'aviso',
          'font-semibold text-primary': estado === 'error',
        }"
        aria-live="polite"
      >
        <span v-if="estado !== 'ok' && campo.ayuda" class="me-2 font-body normal-case">
          {{ campo.ayuda }}
        </span>
        {{ usados }} / {{ tope }}
      </p>
    </template>
  </BaseField>
</template>
```

---

## 4. Condicionales entre campos

Es la parte que hunde estos sistemas, porque parece fácil hasta que deja de
serlo. Cuatro problemas distintos, con cuatro soluciones distintas.

### 4.1 El evaluador

```typescript
// packages/contenido/src/compilador/evaluar.ts
export function evaluar(c: Condicion, datos: Record<string, unknown>): boolean {
  if ('todos' in c) return c.todos.every((h) => evaluar(h, datos))
  if ('alguno' in c) return c.alguno.some((h) => evaluar(h, datos))
  if ('no' in c) return !evaluar(c.no, datos)

  const v = datos[c.campo]
  switch (c.op) {
    case 'eq':
      return v === c.valor
    case 'ne':
      return v !== c.valor
    case 'in':
      return Array.isArray(c.valor) && c.valor.includes(v)
    case 'noIn':
      return Array.isArray(c.valor) && !c.valor.includes(v)
    case 'gt':
      return Number(v) > Number(c.valor)
    case 'gte':
      return Number(v) >= Number(c.valor)
    case 'lt':
      return Number(v) < Number(c.valor)
    case 'lte':
      return Number(v) <= Number(c.valor)
    case 'vacio':
      return esVacio(v)
    case 'noVacio':
      return !esVacio(v)
    case 'longitudGt':
      return longitud(v) > Number(c.valor)
    case 'longitudLt':
      return longitud(v) < Number(c.valor)
    case 'coincide':
      return new RegExp(String(c.valor)).test(String(v ?? ''))
  }
}
```

Trece operadores y tres combinadores. Exhaustivo en TypeScript: si se añade un
operador al meta-esquema y no aquí, `vue-tsc` falla en el `switch` — que es
exactamente el aviso que hace falta.

### 4.2 Recalcular solo lo afectado

Reevaluar la visibilidad de los 105 campos en cada pulsación es O(n) por tecla y
además obliga a Vue a comparar 105 booleanos. Se resuelve con un grafo que se
construye **una vez, al compilar**:

```typescript
/** clave → claves cuya visibilidad depende de ella. */
function construirDependencias(campos: Campo[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  for (const campo of campos) {
    if (!campo.visible) continue
    for (const dep of clavesDe(campo.visible)) {
      const lista = mapa.get(dep) ?? []
      lista.push(campo.clave)
      mapa.set(dep, lista)
    }
  }
  return mapa
}
```

Editar `arcoTitulo` (del que no depende nadie) recalcula **cero** visibilidades.
Editar `borrador` recalcula las dos que dependen de él.

### 4.3 Ciclos

`A` visible si `B`, `B` visible si `A`. En tiempo de ejecución es un bucle
infinito o —peor— un estado que parpadea. Se detecta **al compilar**, con un
orden topológico, y se rechaza el esquema entero:

```typescript
function ordenTopologico(deps: Map<string, string[]>): string[] {
  const estado = new Map<string, 'visitando' | 'listo'>()
  const orden: string[] = []

  function visitar(clave: string, camino: string[]) {
    if (estado.get(clave) === 'listo') return
    if (estado.get(clave) === 'visitando') {
      throw new EsquemaInvalido(
        `Ciclo de visibilidad: ${[...camino, clave].join(' → ')}. ` +
          `Ninguno de esos campos podría decidir si se muestra.`,
      )
    }
    estado.set(clave, 'visitando')
    for (const siguiente of deps.get(clave) ?? []) visitar(siguiente, [...camino, clave])
    estado.set(clave, 'listo')
    orden.push(clave)
  }

  for (const clave of deps.keys()) visitar(clave, [])
  return orden.reverse()
}
```

El ciclo se detecta en el **build** de los esquemas (§6), no en el panel: nunca
llega a publicarse un esquema con un ciclo.

### 4.4 El campo oculto que sigue siendo obligatorio

El error más común y el más confuso de depurar: se pulsa **Guardar**, no pasa
nada, y el error está en un campo que la condición esconde. La persona ve un
formulario aparentemente correcto y un botón que no responde.

La regla: **lo que no se ve, no se valida y no se guarda.**

```typescript
/** Estrecha el esquema a los campos actualmente visibles, antes de parsear. */
export function estrechar(compilado: Compilado, visibles: Map<string, boolean>) {
  const forma: Record<string, z.ZodTypeAny> = {}
  for (const [clave, esquema] of compilado.porCampo) {
    // Oculto → opcional. No desaparece del tipo (rompería el consumidor),
    // simplemente deja de exigirse.
    forma[clave] = visibles.get(clave) === false ? esquema.optional() : esquema
  }
  return aplicarReglas(z.object(forma), compilado.reglasVisibles(visibles))
}
```

Y al guardar, los ocultos se omiten del documento — no se escriben como `''`,
que es un valor y no una ausencia:

```typescript
const payload = Object.fromEntries(
  Object.entries(datos).filter(([k]) => visibles.value.get(k) !== false),
)
```

Las **reglas cruzadas también se filtran**: `arco-cabe` no debe dispararse si
`arcoAcento` está oculto por una condición. Una regla solo corre si _todos_ sus
campos están visibles.

### 4.5 Cuándo dejar de usar JSON

La línea, dicha sin ambigüedad:

> **Si una condición necesita más de tres operadores, no necesita más
> operadores: necesita un nombre.**

Una condición de ocho cláusulas anidadas en JSON es código escrito en el peor
lenguaje posible — sin tipos, sin depurador, sin tests, sin `git blame` útil.
Cuando aparezca, se convierte en una regla con `tipo` propio, se implementa en
TypeScript con su test, y el JSON solo la referencia:

```jsonc
{ "visible": { "regla": "portadaDisponible" } }
```

```typescript
// packages/contenido/src/reglas/portadaDisponible.ts
export const portadaDisponible: ReglaVisibilidad = (datos, ctx) =>
  datos.priority === 'hero' && !datos.borrador && Boolean(datos.coverImage) && ctx.otrosHeroes === 0
```

Se gana un nombre que se lee, un sitio donde poner un test y un stack trace que
apunta a un archivo. Se pierde la capacidad de cambiarla sin publicar el panel
— que para una condición de esa complejidad es lo correcto.

---

## 5. Ventajas y riesgos

### 5.1 Lo que se gana

|                                                   |                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **105 formularios dejan de escribirse**           | Las claves de micro-copy son datos uniformes: etiqueta, ayuda, tope, control. Escritas a mano son ~1.400 líneas de `.vue` con el patrón repetido 105 veces — y cada repetición es un sitio donde el tope puede quedarse viejo.                                                      |
| **El tope y su contador no pueden discrepar**     | Los dos salen del mismo objeto. Hoy, en `ContactForm.vue`, el `minLength` del mensaje (10) vive en `validar()` y en ningún sitio más: no hay contador que lo refleje.                                                                                                               |
| **Una sección nueva no exige releasear el panel** | Es el requisito que manda (§1). Publicar un JSON hace aparecer el formulario en la app que Karol ya tiene instalada, y ella puede cargar el contenido **mientras la sección se desarrolla**. Con el esquema dentro del binario, ese paso sería compilar, firmar, enviar e instalar. |
| **Un solo sitio para la accesibilidad**           | `BaseField` cablea `aria-describedby`, `role="alert"` y el `useId()`. Hoy eso es correcto en `ContactForm` porque alguien se acordó; con 105 campos a mano, en algún punto no.                                                                                                      |
| **La vista previa es la web**                     | Los componentes de `apps/web` se importan en el panel. Mismo Vue, mismo Tailwind v4, mismos tokens.                                                                                                                                                                                 |

### 5.2 Rendimiento

Las cifras de este proyecto, no genéricas: **105 campos** en el peor caso
(`config/ui`), 21 en la ficha de artículo, 13 en la de proyecto.

| Coste                                    | Cuándo                        | Mitigación                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compilar el esquema** (~105 `ZodType`) | Al abrir el módulo            | Memoizado por `id@version`. Una vez por sesión y por sección.                                                                                                                      |
| **Parsear el objeto completo**           | Nunca en cada tecla           | Validación **por campo** (`porCampo.get(clave)`); el objeto entero solo al guardar. Es la diferencia entre 1 validación por pulsación y 105.                                       |
| **Reevaluar visibilidad**                | Solo los dependientes (§4.2)  | Grafo precalculado. Editar un campo sin dependientes: coste cero.                                                                                                                  |
| **Re-render de Vue**                     | El riesgo real con 105 inputs | Un módulo = un grupo (13 grupos de ~8 campos), nunca los 105 a la vez. `<CampoDinamico>` recibe props planas y estrechas, así que escribir en un campo no invalida a sus hermanos. |
| **Proxy reactivo sobre el registro**     | En cada acceso                | `markRaw` (§3.5). Es la trampa que no se ve en el perfil.                                                                                                                          |
| **Contador de caracteres**               | Cada tecla                    | No se toca: es `length` contra un número. Lo que se debounce (120 ms) es la validación, no el contador.                                                                            |

Con esas seis, un formulario de 105 campos va igual de fluido que uno escrito a
mano. Sin `markRaw` y con parseo completo por pulsación, se arrastra a partir de
~40 campos.

### 5.3 Los riesgos, por orden de lo que duelen

| Riesgo                                                  | Gravedad | Qué lo contiene                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **El tope y la maquetación derivan**                    | Media    | El `26` del arco vive en Firestore; la bézier, en un `.vue`. Nadie los ata. Contiene: un comentario en el componente que nombra la clave del esquema (§1.3), y `esquemas:pull` + `git diff` para ver el rastro. No es grave porque el editor del esquema y el autor de la curva son la misma persona.  |
| **Aparece vocabulario nuevo y hay que releasear**       | Media    | Es inevitable (§1.5). Lo vuelve raro: vocabulario completo desde la v1 (§1.4), composición `grupo`/`lista`/`tupla` que cubre formas no previstas, y el actualizador de Tauri para que el release no sea un evento.                                                                                     |
| **Se pierde la seguridad de tipos**                     | Alta     | `z.infer` de un esquema en runtime da `unknown`. **Reconciliación:** el panel usa la vista dinámica; la web sigue usando los tipos estáticos de `packages/contenido`. Dos vistas del mismo contrato, generadas del mismo origen. La web mantiene `vue-tsc` estricto, que es lo que el proyecto valora. |
| **Depurar deja de ser leer un `.vue`**                  | Alta     | Un formulario roto pasa a ser un problema de datos sin stack trace. Contiene: (a) `metaEsquema.parse` con mensajes concretos, (b) `CampoDesconocido` que nunca deja un hueco, (c) un inspector "ver JSON del esquema" en la vista de desarrollo.                                                       |
| **El panel arranca sin red**                            | Media    | Espejo bundleado (§3.1). Cubre el arranque; lo que se haya publicado después no está hasta que haya conexión.                                                                                                                                                                                          |
| **Las reglas de Firestore no leen el esquema dinámico** | Baja     | Deja de importar: los topes por campo protegían contra un cliente admin comprometido, y el único actor no confiable real es el visitante anónimo. Ver §5.5 — las reglas se simplifican en vez de duplicarse.                                                                                           |
| **Renombrar una clave huérfana los datos**              | Media    | `formato` + migraciones con nombre. Una clave renombrada sin migración deja el valor viejo en el documento y el campo nuevo vacío, en silencio.                                                                                                                                                        |
| **Sobreingeniería en las partes equivocadas**           | Media    | §6. El editor de bloques y el subidor de imágenes **no** son formularios genéricos.                                                                                                                                                                                                                    |
| **El JSON crece sin control**                           | Baja     | Un documento por sección, no uno global. El de `config/ui` completo ronda los 40 KB; el tope de Firestore es 1 MiB.                                                                                                                                                                                    |

### 5.4 La comparación honesta

|                                | A mano                                                          | Dinámico                                                                  |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Código del motor               | 0                                                               | ~1.200 líneas (meta-esquema, compilador, evaluador, registro, 10 widgets) |
| Código de los formularios      | ~1.400 líneas repetitivas                                       | ~0 (JSON publicado)                                                       |
| Añadir un campo                | Editar un `.vue` + compilar, firmar, enviar e instalar el panel | Publicar un JSON                                                          |
| Depurar un campo roto          | Stack trace → archivo → línea                                   | Inspeccionar JSON → compilador → widget                                   |
| Seguridad de tipos en el panel | Total                                                           | Se recupera en los bordes                                                 |

Para **105 claves uniformes**, el dinámico gana con claridad: el motor se
escribe una vez y los 1.400 de formularios no se escriben nunca. Para **cuatro
widgets complejos**, pierde — y por eso existe §6.

Si el proyecto tuviera 20 campos, la respuesta sería la contraria. Tiene 105 y
crecerán.

### 5.5 Las reglas de Firestore se simplifican (corrige §4 del plan)

Mover el esquema a Firestore parece romper la generación de `firestore.rules`
desde Zod que proponía el plan. Al revisarlo con cuidado, lo que rompe es la
premisa: **esos topes por campo no hacían falta.**

Los límites estrictos en las reglas defendían de un cliente admin comprometido.
Pero el modelo de amenaza real de este proyecto es un visitante anónimo de
internet, y solo puede hacer tres cosas:

| Operación anónima            | Riesgo                      | Regla                                |
| ---------------------------- | --------------------------- | ------------------------------------ |
| Leer contenido               | Ninguno, es público         | `allow read: if true`                |
| Sumar +1 a un like           | Inflar un contador          | Estricta: solo `likesCount`, solo +1 |
| Crear un mensaje de contacto | Llenar la bandeja de basura | Estricta: campos cerrados y topes    |

Todo lo que escribe la administradora autenticada ya pasó por el panel, que
valida con el esquema. Repetir los 105 topes en las reglas protege de un
escenario —ella extrayendo la `apiKey` del binario para escribir un resumen de
700 caracteres contra Firestore a mano— que no existe.

Así que las reglas de contenido quedan en esto:

```javascript
// Contenido: público para leer, la admin para escribir.
match /proyectos/{slug}   { allow read: if true; allow write: if esAdmin(); }
match /categorias/{id}    { allow read: if true; allow write: if esAdmin(); }
match /catalogo/{id}      { allow read: if true; allow write: if esAdmin(); }
match /config/{doc}       { allow read: if true; allow write: if esAdmin(); }

// Los esquemas los publica la admin y los lee el panel. No son públicos:
// describen la forma del backend y no aportan nada al visitante.
match /esquemas/{id}      { allow read: if esAdmin(); allow write: if esAdmin(); }

// Artículos: igual, salvo el like anónimo.
match /articulos/{slug} {
  allow read: if true;
  allow create, delete: if esAdmin();
  allow update: if (esAdmin() && !cambia().hasAny(['likesCount']))
             || esLikeAnonimo();
}
```

Se van ~80 líneas de reglas, se va el generador `generar-reglas.ts`, y se va la
necesidad de mantener sincronizados dos sitios. Las reglas que quedan —las tres
anónimas— son estables: no cambian aunque se publiquen cien esquemas.

**Lo que se conserva del plan §4:** `esAdmin()`, `esLikeAnonimo()`, las reglas
de `mensajes`, las de Storage (topes de 5 MB y `image/*`) y el `match
/{document=**} { allow read, write: if false }` de cierre. Eso no se toca.

---

## 6. Qué se renderiza dinámicamente y qué no

La decisión por pantalla. Un motor genérico que intenta cubrirlo todo acaba
siendo un framework mal documentado con un solo usuario.

| Pantalla                              | Modo                               | Por qué                                                                                                                                                                                 |
| ------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Configuración global** (105 claves) | **Dinámico**                       | Datos uniformes, mucha repetición, cero UI a medida. Es el caso que justifica el motor.                                                                                                 |
| **Ficha de proyecto** (13 campos)     | **Dinámico** + widget de imagen    | Todo genérico salvo la subida.                                                                                                                                                          |
| **Metadatos de artículo** (11 campos) | **Dinámico**                       | Ídem.                                                                                                                                                                                   |
| **Rubros y catálogo**                 | **Dinámico** (`lista` de `grupo`)  | Los 18 ítems del catálogo son dos campos repetidos: exactamente `lista`.                                                                                                                |
| **Editor de bloques del blog**        | **Componente a medida** (`custom`) | Árbol polimórfico de 6 tipos, reordenable por arrastre, con vista previa en vivo. Expresarlo en JSON declarativo es escribir un lenguaje de programación en JSON.                       |
| **Subidor de imágenes**               | **Componente a medida** (`custom`) | Diálogo nativo de Tauri, lectura de bytes, conversión a WebP en `<canvas>`, comprobación de proporción 4:5 sobre el `File`, subida a Storage con progreso. Nada de eso es un `<input>`. |
| **Login**                             | **A mano**                         | Dos campos. Y además tiene que funcionar **antes** de poder cargar ningún esquema.                                                                                                      |
| **Panel / Publicar**                  | **A mano**                         | No es un formulario.                                                                                                                                                                    |
| **Bandeja de mensajes**               | **A mano**                         | Es una lista de solo lectura.                                                                                                                                                           |

El `tipo: "custom"` es la bisagra entre los dos mundos: el esquema declara _que
hay un campo ahí, cómo se llama y qué ocupa_, y el widget registrado resuelve el
resto. El motor no necesita entender qué es un bloque de código.

---

## 7. Impacto en la hoja de ruta

Sustituye los pasos 2, 3 y 7 de `fase-2-panel-admin.md` §7.

| Paso                         | Antes                                 | Ahora                                                                  | Δ     |
| ---------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ----- |
| **2 · Esquemas**             | Zod a mano (~4 h)                     | Los esquemas se escriben como **JSON**, más el meta-esquema (~5 h)     | +1 h  |
| **3 · Reglas**               | Generadas desde Zod + emulador (~3 h) | Reglas cortas y estables, a mano + emulador (~2 h)                     | −1 h  |
| **6 · Tauri**                | Login + CSP (~3 h)                    | **+ actualizador automático** (§1.5) (~4 h)                            | +1 h  |
| **6b · Motor**               | —                                     | **Nuevo:** compilador, evaluador, estado, registro, 10 widgets (~12 h) | +12 h |
| **7 · Configuración global** | 105 formularios (~6 h)                | Publicar esquemas + 13 pantallas de grupo (~2 h)                       | −4 h  |
| **8 · Portafolio**           | Ficha a mano (~6 h)                   | Esquema + widget de imagen (~4 h)                                      | −2 h  |
| **9 · Blog**                 | Editor + metadatos (~10 h)            | Editor a medida + metadatos por esquema (~9 h)                         | −1 h  |

**Total: ~50 h frente a ~44 h.** Seis horas más, todas en el paso 6b, y a cambio
de que a partir de ahí **añadir contenido nuevo no vuelva a costar un release**.

El paso 6b sube de 10 a 12 h respecto de lo que estimé antes: el vocabulario se
construye completo de entrada (§1.4), incluidos los operadores y los tipos de
regla que hoy no tienen ni un caso de uso. Es deliberado — implementarlos ahora
cuesta dos horas; implementarlos después cuesta un instalador.

### Orden dentro del paso 6b

```
1. metaEsquema.ts          ← se escribe a mano; es el contrato y lo único fijo
2. compilar.ts             ← JSON → Zod, con tests sobre los esquemas reales
3. evaluar.ts + grafo      ← los 13 operadores, dependencias, detección de ciclos
4. useFormularioDinamico   ← estado, visibilidad, validación por campo
5. registro + CampoTexto   ← el widget que cubre ~80 de los 105 campos
6. los 9 widgets restantes ← incluidos los que hoy no se usan
```

Después del paso 3 ya se puede **validar el contenido real existente**:
compilar los esquemas y parsear los 48 documentos de `src/data/`. Ahí se
descubre si algún tope de la auditoría está mal calculado, antes de que exista
una interfaz que lo imponga.

### Un paso nuevo, pequeño y que paga solo

**Paso 2b · `esquemas:pull` y `esquemas:push` — ~1 h.** Dos scripts:

```bash
npm run esquemas:push    # repo → Firestore   (publicar)
npm run esquemas:pull    # Firestore → repo   (espejo + historial en git)
```

Sin ellos, publicar un esquema es editar JSON a mano en la consola de Firebase,
que es exactamente donde se cuelan las comas de más. Con ellos, el esquema se
escribe en el editor, pasa por `metaEsquema.parse` antes de subir y queda en git.

---

## Resumen

1. **El requisito que manda:** el panel se compila una vez; todo lo demás se
   dibuja desde los parámetros. Por eso los esquemas viven en Firestore y el
   repo guarda un espejo, no al revés.
2. **Los topes de maquetación se escriben en el esquema y ya está.** Quien los
   edita es quien escribió el componente. La única salvaguarda es un comentario
   en el `.vue` que nombre la clave (§1.3).
3. **El vocabulario se construye completo en la v1** — 10 tipos de campo, 13
   operadores, 5 tipos de regla — porque ampliarlo cuesta un release y usarlo no
   cuesta nada. Es lo contrario de «empieza mínimo y crece».
4. **La composición evita casi todos los releases:** `grupo` + `lista` + `tupla`
   anidados cubren formas que no se anticiparon. Una sección de testimonios con
   puntuación no necesita widget nuevo.
5. **El actualizador de Tauri** convierte el release que sí haga falta en «ella
   abre el panel y ya está actualizado» (~1 h en el paso 6).
6. **Las reglas de Firestore se simplifican** (§5.5): estrictas solo para las
   tres operaciones anónimas, `esAdmin()` a secas para el resto. Se va el
   generador de reglas y la duplicación que traía.
7. **La escotilla `custom`** mantiene fuera del motor las dos piezas que no son
   formularios: el editor de bloques y el subidor de imágenes.
