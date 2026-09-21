/**
 * Datos del BLOG — mockup editorial.
 *
 * Única fuente de verdad de `/blog` y `/blog/:slug`. Los componentes solo
 * pintan lo que sale de aquí, así que sustituir este archivo por una llamada a
 * Firestore en Fase 2 no obliga a tocar la interfaz.
 *
 * Los nombres de campo van en INGLÉS porque así se especificaron (`title`,
 * `excerpt`, `publishedAt`…). Es la excepción a `proyectos.ts`, que usa el
 * dominio en español; los comentarios y el contenido siguen en español.
 */

// ─────────────────────────── BLOQUES DE CONTENIDO ───────────────────────────

/**
 * El contenido NO es una cadena de Markdown ni de HTML: es un arreglo de
 * bloques tipados.
 *
 * Tres razones, por orden de peso:
 *  1. No entra `v-html` en el proyecto. Hoy no hay ni uno, y cada uno que se
 *     añade es una puerta que alguien tiene que acordarse de cerrar el día que
 *     el contenido deje de ser local.
 *  2. La tipografía sale del design system. Un `<h2>` de Markdown hereda lo que
 *     pille; aquí cada bloque se pinta con las clases del sistema.
 *  3. TypeScript valida el contenido. Una cita sin texto no compila.
 *
 * El día que llegue un CMS con Markdown, convertirlo a estos bloques es una
 * función — y el renderizador no se entera.
 */
export interface ParagraphBlock {
  type: 'paragraph'
  text: string
}

export interface HeadingBlock {
  type: 'heading'
  text: string
}

export interface QuoteBlock {
  type: 'quote'
  text: string
  /** A quién se cita. Opcional: hay citas que son del propio texto. */
  cite?: string
}

export interface ListBlock {
  type: 'list'
  items: readonly string[]
  /** `true` pinta una lista numerada (pasos); por defecto va con viñetas. */
  ordered?: boolean
}

export interface CodeBlock {
  type: 'code'
  code: string
  /** Etiqueta visible del lenguaje. No hay resaltado de sintaxis, a propósito. */
  language?: string
}

export interface ImageBlock {
  type: 'image'
  src: string
  /** Pie de foto. Obligatorio: una imagen sin pie en un artículo es decoración. */
  caption: string
}

export type ContentBlock =
  ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock | CodeBlock | ImageBlock

// ──────────────────────────────── ARTÍCULO ──────────────────────────────────

/** Jerarquía visual. Decide la forma de la tarjeta, no su posición en la lista. */
export type ArticlePriority = 'hero' | 'high' | 'normal'

export interface Article {
  /** Identificador estable. La URL acepta esto o el `slug`. */
  id: string
  title: string
  slug: string
  /** Entradilla de una o dos frases — la que se lee en el listado. */
  excerpt: string
  content: readonly ContentBlock[]
  coverImage: string
  category: string
  author: string
  /** ISO `YYYY-MM-DD`. De aquí salen la insignia "Nuevo" y el tono de archivo. */
  publishedAt: string
  /** Minutos de lectura. */
  readTime: number
  /** Likes de partida. El del visitante se suma encima (ver `useLikes`). */
  likesCount: number
  priority: ArticlePriority
  tags: readonly string[]
}

/**
 * Placeholder estable: `picsum.photos/seed/<slug>` devuelve siempre la misma
 * foto para la misma semilla. Mismo aviso que en `proyectos.ts`: es un tercero
 * y ya falló antes en algunas redes, por eso vive detrás de una función — al
 * pasar a imágenes reales se cambia solo aquí.
 */
function portada(semilla: string): string {
  return `https://picsum.photos/seed/${semilla}/1600/900`
}

export const BLOG_CATEGORIES = [
  'Dirección de arte',
  'Detrás de cámara',
  'Marketing',
  'Oficio',
  'Herramientas',
] as const

export const ARTICLES: readonly Article[] = [
  {
    id: '1861864',
    title: 'El encuadre no es el tema',
    slug: 'el-encuadre-no-es-el-tema',
    excerpt:
      'Llevo un año revisando por qué mis fotos buenas son buenas. No es la luz, no es la cámara y casi nunca es la modelo.',
    coverImage: portada('el-encuadre-no-es-el-tema'),
    category: 'Dirección de arte',
    author: 'Karol',
    publishedAt: '2026-09-18',
    readTime: 7,
    likesCount: 128,
    priority: 'hero',
    tags: ['composición', 'dirección', 'método'],
    content: [
      {
        type: 'paragraph',
        text: 'Cuando alguien me enseña una foto que no funciona, lo primero que me dice es qué cámara usó. Lo segundo, qué hora era. Nunca me dice qué quería contar, y ese es exactamente el problema: el encuadre no es el tema, es la consecuencia de haber decidido un tema.',
      },
      {
        type: 'paragraph',
        text: 'Durante el último año guardé las cincuenta imágenes con las que me quedé de cada trabajo y las puse juntas, sin metadatos, sin saber de qué sesión venía cada una. Quería ver si había un patrón. Lo hay, y no es el que esperaba.',
      },
      { type: 'heading', text: 'Lo que tenían en común' },
      {
        type: 'paragraph',
        text: 'Ninguna estaba bien compuesta en el sentido de manual. Casi la mitad rompía la regla de los tercios de forma grosera. Lo que sí compartían todas era una decisión visible: algo estaba cortado, tapado o fuera de foco a propósito, y esa ausencia era el asunto de la imagen.',
      },
      {
        type: 'list',
        items: [
          'Una silueta que tapa la mitad del titular, y por eso lo hace legible.',
          'Un rostro cortado por el borde, que obliga a mirar las manos.',
          'Un fondo desenfocado hasta el punto de que deja de ser un lugar.',
        ],
      },
      {
        type: 'quote',
        text: 'Una foto no se compone: se decide qué se le quita a la realidad hasta que queda una sola cosa.',
      },
      {
        type: 'paragraph',
        text: 'Esto cambió cómo preparo un set. Antes llegaba con referencias de encuadre. Ahora llego con una frase escrita en la primera página del cuaderno, y si al final de la jornada la frase no se sostiene, no importa cuántas imágenes limpias tenga: la sesión no salió.',
      },
      {
        type: 'image',
        src: portada('encuadre-set'),
        caption:
          'Prueba de encuadre antes de la primera toma. La frase del día iba escrita en cinta, pegada al trípode.',
      },
      { type: 'heading', text: 'Cómo lo estoy aplicando' },
      {
        type: 'paragraph',
        text: 'La prueba que hago ahora es tonta y funciona: describo la foto por teléfono a alguien que no estaba. Si necesito más de una frase, la imagen tiene dos temas y hay que tirar uno.',
      },
    ],
  },
  {
    id: '1861702',
    title: 'Cinco preguntas antes de encender una luz',
    slug: 'cinco-preguntas-antes-de-encender-una-luz',
    excerpt:
      'El equipo es lo último que decido. Antes hay cinco preguntas que me ahorran media jornada y varias discusiones en set.',
    coverImage: portada('cinco-preguntas-luz'),
    category: 'Detrás de cámara',
    author: 'Karol',
    publishedAt: '2026-09-16',
    readTime: 5,
    likesCount: 74,
    priority: 'high',
    tags: ['iluminación', 'preproducción', 'set'],
    content: [
      {
        type: 'paragraph',
        text: 'Montar luces antes de saber qué se está contando es la forma más cara de perder una mañana. Estas cinco preguntas van siempre antes que el primer trípode.',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          '¿A qué hora del día pertenece esta imagen? No qué hora es: a cuál pertenece.',
          '¿De dónde viene la luz en ese mundo? Una ventana, una farola, un flash de prensa.',
          '¿Qué textura tiene que verse? La piel, la tela y el metal no piden lo mismo.',
          '¿Qué NO se debe ver? Casi siempre es más decisivo que lo anterior.',
          '¿Qué pasa si se va la corriente? Si no hay plan B, el plan A es un deseo.',
        ],
      },
      {
        type: 'paragraph',
        text: 'La quinta parece una broma y es la que más veces me ha salvado. En locación, la mitad de las sesiones acaban resolviéndose con luz natural y un reflector porque algo falló.',
      },
      {
        type: 'quote',
        text: 'Si tu esquema de luz solo funciona con todo el equipo encendido, no es un esquema: es una apuesta.',
      },
    ],
  },
  {
    id: '1861530',
    title: 'Tu marca no necesita más contenido',
    slug: 'tu-marca-no-necesita-mas-contenido',
    excerpt:
      'Casi todos los clientes que llegan pidiendo publicar más tienen el problema contrario: publican demasiado y no dicen nada.',
    coverImage: portada('mas-contenido'),
    category: 'Marketing',
    author: 'Karol',
    publishedAt: '2026-08-28',
    readTime: 6,
    likesCount: 213,
    priority: 'high',
    tags: ['estrategia', 'contenido', 'marca'],
    content: [
      {
        type: 'paragraph',
        text: 'La petición llega siempre igual: necesitamos publicar más, el algoritmo nos está castigando. Casi nunca es cierto. Lo que pasa es que hay treinta piezas al mes y ninguna se puede recordar al día siguiente.',
      },
      { type: 'heading', text: 'La prueba de la semana en blanco' },
      {
        type: 'paragraph',
        text: 'Antes de proponer un calendario, pido una semana sin publicar nada. Al séptimo día miramos qué pasó. En dos años haciendo esto, las ventas nunca cayeron. Lo que sí cae, y mucho, es la ansiedad del equipo.',
      },
      {
        type: 'list',
        items: [
          'Menos piezas, más largas, con algo que solo esa marca puede decir.',
          'Un pilar fijo de "lo que este producto no hace". Genera más confianza que diez testimonios.',
          'Una métrica de lectura completa en vez de alcance.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Con Salvia Skincare el resultado fue medible: el guardado por publicación subió y las devoluciones bajaron, porque la gente compraba sabiendo qué estaba comprando.',
      },
      {
        type: 'quote',
        text: 'Publicar todos los días no es una estrategia. Es una forma elegante de no haber decidido nada.',
        cite: 'Lo que le digo a todos mis clientes en la primera llamada',
      },
    ],
  },
  {
    id: '1861388',
    title: 'Cómo leer una convocatoria de casting',
    slug: 'como-leer-una-convocatoria-de-casting',
    excerpt:
      'Lo que una convocatoria dice, lo que calla y las tres señales que llevan años avisándome de que no vale la pena ir.',
    coverImage: portada('convocatoria-casting'),
    category: 'Oficio',
    author: 'Karol',
    publishedAt: '2026-07-11',
    readTime: 8,
    likesCount: 96,
    priority: 'high',
    tags: ['modelaje', 'casting', 'consejos'],
    content: [
      {
        type: 'paragraph',
        text: 'He ido a castings buenos con convocatorias horribles y a castings horribles con convocatorias impecables. Aun así, hay patrones que aciertan más de lo que fallan.',
      },
      { type: 'heading', text: 'Las tres señales' },
      {
        type: 'list',
        ordered: true,
        items: [
          'No dice quién es el cliente. Una marca que no se nombra suele ser una marca que no ha cerrado el presupuesto.',
          'Pide fotos nuevas con ropa específica antes de la primera llamada. Eso es trabajo sin contrato.',
          'Habla de "exposición" en la parte donde debería hablar de dinero.',
        ],
      },
      {
        type: 'paragraph',
        text: 'La tercera es la más común y la más cara. La exposición no paga el transporte y, en mi experiencia, las marcas que la ofrecen tampoco acaban publicando.',
      },
      { type: 'heading', text: 'Lo que sí quiero ver' },
      {
        type: 'paragraph',
        text: 'Fechas concretas, horas de jornada, uso de la imagen y por cuánto tiempo. Una convocatoria que responde esas cuatro cosas en el primer mensaje es, casi siempre, un trabajo que existe de verdad.',
      },
    ],
  },
  {
    id: '1861204',
    title: 'El día que dejé de retocar la piel',
    slug: 'el-dia-que-deje-de-retocar-la-piel',
    excerpt:
      'Perdí un cliente por esto y gané tres. Un año después no volvería atrás, aunque la primera semana fue incómoda.',
    coverImage: portada('retocar-piel'),
    category: 'Detrás de cámara',
    author: 'Karol',
    publishedAt: '2026-06-02',
    readTime: 4,
    likesCount: 187,
    priority: 'normal',
    tags: ['retoque', 'retrato', 'criterio'],
    content: [
      {
        type: 'paragraph',
        text: 'No fue una decisión ética, al principio. Fue que el retoque me estaba comiendo más horas que la sesión y el resultado empezaba a parecerse al de todo el mundo.',
      },
      {
        type: 'paragraph',
        text: 'Lo que hago ahora: corrijo lo que no estará ahí la semana que viene —un grano, una pestaña suelta— y no toco lo que la persona verá en el espejo mañana. La regla cabe en una frase y por eso funciona en set, cuando alguien pregunta.',
      },
      {
        type: 'quote',
        text: 'Si tengo que borrarlo para que la foto funcione, la foto no funcionaba.',
      },
    ],
  },
  {
    id: '1861077',
    title: 'Un moodboard no es un collage',
    slug: 'un-moodboard-no-es-un-collage',
    excerpt:
      'Veinte imágenes bonitas juntas no son una dirección de arte. Son veinte imágenes bonitas y un cliente confundido.',
    coverImage: portada('moodboard-collage'),
    category: 'Dirección de arte',
    author: 'Karol',
    publishedAt: '2026-05-19',
    readTime: 5,
    likesCount: 64,
    priority: 'normal',
    tags: ['moodboard', 'método', 'cliente'],
    content: [
      {
        type: 'paragraph',
        text: 'El moodboard que entrego tiene como mucho seis imágenes, y cada una viene con una frase que dice qué se toma de ella. Sin esa frase, el cliente se queda con lo que más le gusta de cada foto, que casi nunca es lo que yo señalaba.',
      },
      {
        type: 'list',
        items: [
          'De esta, la temperatura de color. Nada más.',
          'De esta, la distancia a la que está la cámara.',
          'De esta, el desorden controlado del fondo.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Desde que trabajo así, las rondas de revisión bajaron de cuatro a una. No porque acierte más, sino porque discutimos lo correcto desde el principio.',
      },
    ],
  },
  {
    id: '1860941',
    title: 'Precio cerrado o por hora',
    slug: 'precio-cerrado-o-por-hora',
    excerpt:
      'Cobré por hora durante tres años. Cambiar a precio cerrado me subió los ingresos y, sobre todo, me quitó las conversaciones incómodas.',
    coverImage: portada('precio-cerrado'),
    category: 'Oficio',
    author: 'Karol',
    publishedAt: '2026-04-07',
    readTime: 6,
    likesCount: 152,
    priority: 'normal',
    tags: ['tarifas', 'negocio', 'freelance'],
    content: [
      {
        type: 'paragraph',
        text: 'Cobrar por hora premia ser lento. Es una frase que suena a consultor, pero la viví: cuanto mejor me volvía, menos ganaba por el mismo trabajo.',
      },
      { type: 'heading', text: 'Cómo calculo un precio cerrado' },
      {
        type: 'list',
        ordered: true,
        items: [
          'Horas que creo que me va a llevar, honestamente.',
          'Por 1,4, que es lo que históricamente me he equivocado.',
          'Más los gastos reales: transporte, asistente, alquiler de equipo.',
          'Más una ronda de revisión incluida. La segunda se cobra.',
        ],
      },
      {
        type: 'paragraph',
        text: 'El 1,4 no es superstición: salió de revisar veinte proyectos anteriores y comparar lo estimado con lo real. Recomiendo hacer ese número propio antes que copiar el mío.',
      },
    ],
  },
  {
    id: '1860818',
    title: 'La luz de las once',
    slug: 'la-luz-de-las-once',
    excerpt:
      'Todo el mundo rueda en hora dorada. Llevo dos años rodando a mediodía a propósito y estas son las condiciones en las que gana.',
    coverImage: portada('luz-de-las-once'),
    category: 'Detrás de cámara',
    author: 'Karol',
    publishedAt: '2026-02-24',
    readTime: 5,
    likesCount: 88,
    priority: 'normal',
    tags: ['luz natural', 'exteriores', 'editorial'],
    content: [
      {
        type: 'paragraph',
        text: 'La luz de mediodía tiene mala fama porque hace sombras duras bajo los ojos. Eso es cierto en asfalto. Sobre superficies que devuelven luz desde abajo —sal, arena clara, hormigón pulido, agua— deja de serlo.',
      },
      {
        type: 'paragraph',
        text: 'La serie de las salinas se rodó entera entre las once y la una, sin rebotadores. El suelo hacía de rebotador gigante y rellenaba exactamente lo que sobraba.',
      },
      {
        type: 'quote',
        text: 'No hay luz mala. Hay luz en el sitio equivocado.',
      },
    ],
  },
  {
    id: '1860664',
    title: 'Escribir para que se lea, no para que se comparta',
    slug: 'escribir-para-que-se-lea',
    excerpt:
      'Los textos que más me han servido son los que nadie compartió. Una nota sobre métricas que engañan y las que no.',
    coverImage: portada('escribir-para-leer'),
    category: 'Marketing',
    author: 'Karol',
    publishedAt: '2025-12-15',
    readTime: 7,
    likesCount: 119,
    priority: 'normal',
    tags: ['copywriting', 'métricas', 'contenido'],
    content: [
      {
        type: 'paragraph',
        text: 'Compartir es una acción social: se comparte lo que dice algo de quien comparte. Leer es una acción privada. Son cosas distintas y casi nunca se dan a la vez.',
      },
      {
        type: 'paragraph',
        text: 'Cuando monté el tablero de Pauta cambiamos la métrica principal a tiempo de lectura por encima del 70%. La fórmula que usamos era deliberadamente simple, para que nadie la tuviera que explicar dos veces:',
      },
      {
        type: 'code',
        language: 'SQL',
        code: 'SELECT pieza,\n       COUNT(*) FILTER (WHERE avance >= 0.7) * 1.0 / COUNT(*) AS lectura_real\nFROM eventos_scroll\nGROUP BY pieza\nORDER BY lectura_real DESC;',
      },
      {
        type: 'paragraph',
        text: 'El artículo más compartido del trimestre quedó el penúltimo en esa tabla. El que nadie compartió llevaba tres meses trayendo clientes.',
      },
    ],
  },
  {
    id: '1860502',
    title: 'Mi maleta de locación',
    slug: 'mi-maleta-de-locacion',
    excerpt:
      'Lo que llevo siempre, lo que dejé de llevar y las dos cosas baratas que me han sacado de más apuros que la cámara.',
    coverImage: portada('maleta-locacion'),
    category: 'Herramientas',
    author: 'Karol',
    publishedAt: '2025-10-30',
    readTime: 4,
    likesCount: 71,
    priority: 'normal',
    tags: ['equipo', 'locación', 'práctico'],
    content: [
      {
        type: 'paragraph',
        text: 'Cargo menos que hace cinco años y resuelvo más. La lista se redujo sola: lo que no usé en tres sesiones seguidas, salió.',
      },
      {
        type: 'list',
        items: [
          'Cinta de gaffer negra. Sujeta, tapa reflejos y marca posiciones en el suelo.',
          'Pinzas de madera. Sostienen tela, cierran ropa por detrás, fijan reflectores.',
          'Un espejo de cuerpo entero plegable, desde el lookbook de Oaxaca.',
          'Baterías de sobra. Nunca son suficientes, siempre son pocas.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Lo que dejé de llevar: tres objetivos que usaba una vez al año y un flash que no encendía desde 2023.',
      },
    ],
  },
  {
    id: '1860341',
    title: 'Lo que aprendí en mi primera pasarela',
    slug: 'lo-que-aprendi-en-mi-primera-pasarela',
    excerpt:
      'Llegué dos horas antes, no comí y me equivoqué en casi todo. Sigue siendo el trabajo del que más aprendí.',
    coverImage: portada('primera-pasarela'),
    category: 'Oficio',
    author: 'Karol',
    publishedAt: '2025-03-18',
    readTime: 6,
    likesCount: 243,
    priority: 'normal',
    tags: ['pasarela', 'principios', 'modelaje'],
    content: [
      {
        type: 'paragraph',
        text: 'Nadie te explica que el desfile es la parte corta. Lo largo son las seis horas anteriores, de pie, con la ropa a medio ajustar y sin saber cuándo te toca.',
      },
      {
        type: 'list',
        items: [
          'Come antes. No habrá momento después y nadie te lo va a recordar.',
          'Aprende el recorrido con los zapatos puestos, no con los tuyos.',
          'El ritmo lo marca quien abre. Si abres tú, lo marcas para veintidós personas.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Aquel día fui la número once y salí demasiado rápido. Se nota en las fotos. Dos temporadas después abrí un desfile y me acordé de esto en cada paso.',
      },
    ],
  },
  {
    id: '1860187',
    title: 'Por qué dejé Lightroom seis meses',
    slug: 'por-que-deje-lightroom-seis-meses',
    excerpt:
      'Un experimento incómodo: revelar todo un semestre sin presets, sin curvas guardadas y sin copiar ajustes entre fotos.',
    coverImage: portada('deje-lightroom'),
    category: 'Herramientas',
    author: 'Karol',
    publishedAt: '2024-11-05',
    readTime: 5,
    likesCount: 58,
    priority: 'normal',
    tags: ['revelado', 'experimento', 'flujo'],
    content: [
      {
        type: 'paragraph',
        text: 'Me di cuenta de que todas mis fotos del año tenían el mismo revelado porque tenían el mismo preset, no porque tuvieran la misma intención. Así que lo quité todo durante seis meses.',
      },
      {
        type: 'paragraph',
        text: 'Fue lento y bastante peor al principio. Hacia el tercer mes empecé a ver qué hacía realmente cada control, y volví a los presets con una diferencia: ahora los construyo por proyecto, no por gusto.',
      },
      {
        type: 'quote',
        text: 'Un preset es una decisión que tomaste una vez y sigues aplicando sin acordarte de por qué.',
      },
    ],
  },
]

/** Busca por `slug` o, si no hay, por `id` — la URL admite los dos. */
export function articlePorRuta(parametro: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === parametro) ?? ARTICLES.find((a) => a.id === parametro)
}

/**
 * Relacionados: primero los de la misma categoría, y si no llegan a `limite`
 * se completan con los que comparten alguna etiqueta. Nunca devuelve el actual
 * ni repetidos, y nunca devuelve una lista vacía habiendo otros artículos.
 */
export function relacionados(articulo: Article, limite = 3): Article[] {
  const otros = ARTICLES.filter((a) => a.id !== articulo.id)
  const porCategoria = otros.filter((a) => a.category === articulo.category)
  const porEtiqueta = otros.filter(
    (a) => !porCategoria.includes(a) && a.tags.some((t) => articulo.tags.includes(t)),
  )
  const resto = otros.filter((a) => !porCategoria.includes(a) && !porEtiqueta.includes(a))
  return [...porCategoria, ...porEtiqueta, ...resto].slice(0, limite)
}
