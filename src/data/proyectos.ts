/**
 * Datos del PORTAFOLIO — mockup editorial.
 *
 * Es la única fuente de verdad de la sección `#projects`: categorías (rubros) y
 * proyectos. Los componentes (`ProjectCategoryCard`, `ProjectCard`,
 * `ProjectDetailModal`) solo pintan lo que sale de aquí, así que sustituir este
 * archivo por una llamada a Firestore en Fase 2 no obliga a tocar la UI.
 *
 * El dominio está nombrado en ESPAÑOL (proyecto, categoría, rubro) igual que el
 * catálogo de `ServicesSection`: el contenido de la web es español y mezclar
 * `title`/`titulo` entre archivos de la misma familia envejece mal.
 */

/** Los tres rubros. Son también los tres servicios — mismo orden y mismos ids. */
export type CategoriaId = 'marketing' | 'fotografia' | 'modelaje'

/** Estado del filtro: un rubro concreto o la vista completa. */
export type FiltroId = CategoriaId | 'todos'

export interface Categoria {
  id: CategoriaId
  /** Nombre visible — encabezado de la tarjeta de rubro. */
  nombre: string
  /** Kicker corto en mayúsculas, sobre el nombre. */
  kicker: string
  /** Una línea que explica el rubro; se revela al hover de la tarjeta. */
  descripcion: string
  /**
   * Imagen del rubro. Son las MISMAS fotos de `ServicesSection`, servidas desde
   * `public/`: el rubro y el servicio son la misma cosa, así que reutilizarlas
   * refuerza la lectura y no añade ni un byte de descarga nueva.
   */
  imagen: string
}

export interface Proyecto {
  /** Slug único — clave de `v-for` y futura ruta `/projects/:slug`. */
  id: string
  titulo: string
  categoria: CategoriaId
  /** Marca ficticia para la que se hizo el trabajo. */
  cliente: string
  anio: number
  /** Rol desempeñado en el proyecto. */
  rol: string
  /** Dónde se produjo — da contexto de escala en la ficha. */
  locacion: string
  /** Una línea para la tarjeta del grid. */
  resumen: string
  /** Párrafo de la ficha ampliada (modal). */
  descripcion: string
  etiquetas: readonly string[]
  imagen: string
}

/**
 * Placeholder estable: `picsum.photos/seed/<slug>` devuelve SIEMPRE la misma
 * foto para la misma semilla, así que el grid no baila entre recargas.
 *
 * OJO — es un tercero y ya nos mordió antes: las fotos de servicios estaban en
 * picsum y en algunas redes fallaban con `ERR_ADDRESS_UNREACHABLE` (la petición
 * la hace el navegador del visitante; ni el build ni Netlify pueden evitarlo).
 * Por eso vive detrás de esta función: al pasar a fotos reales se cambia SOLO
 * aquí por `/proyectos/<slug>.jpg` y las 30 entradas quedan igual.
 *
 * 1000×1250 (4:5 vertical) recortado con `object-cover`: sirve para las cajas
 * horizontales del grid, para las verticales y para la ficha.
 */
function imagenMock(slug: string): string {
  return `https://picsum.photos/seed/${slug}/1000/1250`
}

export const CATEGORIAS: readonly Categoria[] = [
  {
    id: 'marketing',
    nombre: 'Marketing',
    kicker: 'Estrategia & marca',
    descripcion: 'Campañas, identidad y contenido que sostienen una temporada entera.',
    imagen: '/servicio-marketing.jpg',
  },
  {
    id: 'fotografia',
    nombre: 'Fotografía',
    kicker: 'Editorial & producto',
    descripcion: 'Series con concepto, luz dirigida y una paleta que se reconoce.',
    imagen: '/servicio-fotografia.jpg',
  },
  {
    id: 'modelaje',
    nombre: 'Modelaje',
    kicker: 'Pasarela & campaña',
    descripcion: 'Presencia frente a cámara con dirección propia, del casting al cierre.',
    imagen: '/servicio-modelaje.jpg',
  },
]

/** Etiqueta legible de un rubro — la usan la tarjeta del grid y la ficha. */
export function nombreCategoria(id: CategoriaId): string {
  return CATEGORIAS.find((c) => c.id === id)?.nombre ?? id
}

export const PROYECTOS: readonly Proyecto[] = [
  // ─────────────────────────────── MARKETING ───────────────────────────────
  {
    id: 'manifiesto-aurora',
    titulo: 'Manifiesto Aurora',
    categoria: 'marketing',
    cliente: 'Aurora Botánica',
    anio: 2026,
    rol: 'Estrategia de marca y dirección de contenido',
    locacion: 'Ciudad de México',
    resumen: 'Relanzamiento de una casa de perfumería botánica en clave de manifiesto.',
    descripcion:
      'Aurora llevaba seis años vendiendo sin decir quién era. Reescribimos la marca desde una sola frase —"el olor de lo que todavía no pasa"— y de ahí bajaron el tono de voz, la paleta y un calendario de doce semanas con tres piezas por semana. El relanzamiento abrió con un manifiesto impreso que se metía dentro de cada caja.',
    etiquetas: ['Posicionamiento', 'Tono de voz', 'Lanzamiento'],
    imagen: imagenMock('manifiesto-aurora'),
  },
  {
    id: 'temporada-cero',
    titulo: 'Temporada Cero',
    categoria: 'marketing',
    cliente: 'Norte Denim',
    anio: 2025,
    rol: 'Dirección de campaña',
    locacion: 'Monterrey',
    resumen: 'La colección que se anunció antes de existir: nueve semanas de expectativa.',
    descripcion:
      'Norte quería estrenar su línea de denim crudo sin fotos de producto. Construimos una campaña de ausencia: texturas, sonido de telar, fragmentos de patrón y una cuenta regresiva sin fecha visible. El día del lanzamiento la lista de espera cubría el 70% del primer tiraje.',
    etiquetas: ['Campaña', 'Expectativa', 'Preventa'],
    imagen: imagenMock('temporada-cero'),
  },
  {
    id: 'ruido-blanco',
    titulo: 'Ruido Blanco',
    categoria: 'marketing',
    cliente: 'Salvia Skincare',
    anio: 2025,
    rol: 'Estrategia de contenido y copywriting',
    locacion: 'Remoto',
    resumen: 'Una marca de skincare que dejó de gritar y empezó a explicar.',
    descripcion:
      'El feed de Salvia competía con el resto de la categoría a base de promesas. Cambiamos la métrica de éxito de alcance a lectura completa: piezas largas, tipografía grande, cero stock photos y un pilar fijo de "lo que este producto no hace". El guardado por publicación subió y las devoluciones bajaron.',
    etiquetas: ['Contenido', 'Copywriting', 'Educación de marca'],
    imagen: imagenMock('ruido-blanco'),
  },
  {
    id: 'carta-abierta',
    titulo: 'Carta Abierta',
    categoria: 'marketing',
    cliente: 'Pluma Editorial',
    anio: 2024,
    rol: 'Dirección editorial y newsletter',
    locacion: 'Bogotá',
    resumen: 'Newsletter quincenal que convirtió a una editorial pequeña en una comunidad.',
    descripcion:
      'Una editorial independiente con catálogo corto y presupuesto más corto. En lugar de anuncios, una carta cada quince días firmada por una persona real: qué se está leyendo en la oficina, qué se rechazó y por qué. Doce meses después la carta vendía más que la tienda.',
    etiquetas: ['Newsletter', 'Comunidad', 'Marca personal'],
    imagen: imagenMock('carta-abierta'),
  },
  {
    id: 'mercado-lento',
    titulo: 'Mercado Lento',
    categoria: 'marketing',
    cliente: 'Marea Textil',
    anio: 2024,
    rol: 'Estrategia y dirección de arte',
    locacion: 'Oaxaca',
    resumen: 'Cooperativa textil contada sin folclore ni lástima.',
    descripcion:
      'El reto era vender precio justo sin caer en el relato de rescate. Trabajamos la marca como lo que es: un taller con oficio, tiempos largos y lista de espera. Retratos de manos, fichas técnicas visibles y el nombre de quien teje en cada etiqueta.',
    etiquetas: ['Marca con propósito', 'Dirección de arte', 'Retail'],
    imagen: imagenMock('mercado-lento'),
  },
  {
    id: 'plan-vitrina',
    titulo: 'Plan Vitrina',
    categoria: 'marketing',
    cliente: 'Ferro Muebles',
    anio: 2024,
    rol: 'Estrategia omnicanal',
    locacion: 'Guadalajara',
    resumen: 'Puente entre la tienda física y el catálogo digital de una casa de muebles.',
    descripcion:
      'Ferro tenía dos marcas sin saberlo: la del showroom y la de internet. Unificamos ficha, foto y discurso, y montamos un sistema de "vitrina viva": cada montaje del local se fotografía el mismo día y sale como pieza social con el link de compra. El tráfico a tienda dejó de depender del fin de semana.',
    etiquetas: ['Omnicanal', 'Retail', 'Sistema de contenido'],
    imagen: imagenMock('plan-vitrina'),
  },
  {
    id: 'cuenta-regresiva',
    titulo: 'Cuenta Regresiva',
    categoria: 'marketing',
    cliente: 'Fauna Swim',
    anio: 2023,
    rol: 'Dirección de campaña y pauta',
    locacion: 'Cartagena',
    resumen: 'Lanzamiento de temporada resuelto en catorce días de tensión controlada.',
    descripcion:
      'Colección cápsula, inventario corto y una sola oportunidad. Diseñamos una campaña de catorce días con una pieza diaria, un único color por semana y pauta concentrada en las últimas 72 horas. Se agotó antes del cierre y quedó una lista de espera que alimentó la temporada siguiente.',
    etiquetas: ['Lanzamiento', 'Pauta', 'Cápsula'],
    imagen: imagenMock('cuenta-regresiva'),
  },
  {
    id: 'tono-de-casa',
    titulo: 'Tono de Casa',
    categoria: 'marketing',
    cliente: 'Duna Hotel',
    anio: 2023,
    rol: 'Identidad verbal y guía de contenido',
    locacion: 'Tulum',
    resumen: 'Manual de voz para un hotel donde escribían once personas distintas.',
    descripcion:
      'Recepción, spa, restaurante y redes sonaban a cuatro hoteles. Escribimos una guía viva de treinta páginas —con ejemplos reales, no reglas abstractas— y la entrenamos en dos talleres. Seis meses después, el 90% de las publicaciones pasaba la revisión a la primera.',
    etiquetas: ['Identidad verbal', 'Guía de marca', 'Hospitalidad'],
    imagen: imagenMock('tono-de-casa'),
  },
  {
    id: 'boletin-quince',
    titulo: 'Boletín Quince',
    categoria: 'marketing',
    cliente: 'Óxido Café',
    anio: 2023,
    rol: 'Contenido y gestión de comunidad',
    locacion: 'Medellín',
    resumen: 'Suscripción de café convertida en club con calendario propio.',
    descripcion:
      'Óxido vendía bolsas; queríamos que vendiera pertenencia. Cada quince días, un origen nuevo con su ficha de cata, la historia del productor y una receta de método. El churn de la suscripción cayó a la mitad en el primer trimestre.',
    etiquetas: ['Suscripción', 'Comunidad', 'Retención'],
    imagen: imagenMock('boletin-quince'),
  },
  {
    id: 'metrica-honesta',
    titulo: 'Métrica Honesta',
    categoria: 'marketing',
    cliente: 'Pauta Agencia',
    anio: 2022,
    rol: 'Consultoría de medición',
    locacion: 'Remoto',
    resumen: 'Tablero de reportes que dejó de celebrar números que no significaban nada.',
    descripcion:
      'Una agencia mediana reportaba impresiones a clientes que solo querían saber si vendían. Redefinimos el set de métricas por objetivo, armamos un tablero de una sola pantalla y escribimos la plantilla de lectura: qué pasó, qué se decide, qué se prueba. Las reuniones mensuales pasaron de noventa a treinta minutos.',
    etiquetas: ['Analítica', 'Reportes', 'Consultoría'],
    imagen: imagenMock('metrica-honesta'),
  },

  // ─────────────────────────────── FOTOGRAFÍA ──────────────────────────────
  {
    id: 'luz-de-sal',
    titulo: 'Luz de Sal',
    categoria: 'fotografia',
    cliente: 'Atelier Sereno',
    anio: 2026,
    rol: 'Fotografía y dirección de arte',
    locacion: 'Salinas de Cuyutlán',
    resumen: 'Editorial de lino y algodón crudo rodada entre las once y la una.',
    descripcion:
      'Seis looks de la colección de verano fotografiados en el peor horario posible, a propósito: la sal devuelve la luz desde abajo y rellena las sombras duras del mediodía. Sin rebotadores, sin difusores, sin retoque de piel. La serie abrió el lookbook y terminó en dos revistas de moda regionales.',
    etiquetas: ['Editorial', 'Luz natural', 'Moda'],
    imagen: imagenMock('luz-de-sal'),
  },
  {
    id: 'ceniza-y-seda',
    titulo: 'Ceniza & Seda',
    categoria: 'fotografia',
    cliente: 'Casa Bruma',
    anio: 2025,
    rol: 'Fotografía, concepto y styling',
    locacion: 'Estudio · CDMX',
    resumen: 'Estudio en clave baja donde el tejido es el único punto de luz.',
    descripcion:
      'Un solo foco cenital con snoot y el resto de la escena en negro absoluto. La seda entra y sale del haz según la modelo respira, de modo que cada disparo es irrepetible. Doce imágenes finales de novecientas capturas, montadas como secuencia de una sola noche.',
    etiquetas: ['Estudio', 'Clave baja', 'Textil'],
    imagen: imagenMock('ceniza-y-seda'),
  },
  {
    id: 'mirador-norte',
    titulo: 'Mirador Norte',
    categoria: 'fotografia',
    cliente: 'Cobalto Magazine',
    anio: 2025,
    rol: 'Fotografía editorial',
    locacion: 'Sierra de Arteaga',
    resumen: 'Ocho páginas de portada sobre abrigo técnico a dos mil metros.',
    descripcion:
      'Encargo de revista con una ventana de dos días y viento constante. Armamos el plan de rodaje alrededor del clima en vez de contra él: el granizo entró en la historia y la doble página central es la única foto del set con la modelo mirando a cámara.',
    etiquetas: ['Editorial', 'Exteriores', 'Portada'],
    imagen: imagenMock('mirador-norte'),
  },
  {
    id: 'bodegon-invierno',
    titulo: 'Bodegón de Invierno',
    categoria: 'fotografia',
    cliente: 'Rama Cerámica',
    anio: 2025,
    rol: 'Fotografía de producto',
    locacion: 'Estudio · Puebla',
    resumen: 'Catálogo de cerámica esmaltada fotografiado como naturaleza muerta.',
    descripcion:
      'Cuarenta piezas que en la ficha de e-commerce necesitaban fondo limpio y en campaña necesitaban alma. Resolvimos las dos con el mismo set: una ventana norte, una mesa de nogal y una rutina de cuatro ángulos por pieza. El cliente recortó en cuatro horas lo que antes le tomaba dos jornadas.',
    etiquetas: ['Producto', 'Bodegón', 'E-commerce'],
    imagen: imagenMock('bodegon-invierno'),
  },
  {
    id: 'retrato-de-taller',
    titulo: 'Retrato de Taller',
    categoria: 'fotografia',
    cliente: 'Estudio Mímica',
    anio: 2024,
    rol: 'Fotografía de retrato',
    locacion: 'Quito',
    resumen: 'Serie de retratos corporativos que no parecen retratos corporativos.',
    descripcion:
      'Catorce personas de un estudio de diseño, cada una fotografiada en su propio puesto y con sus propias manos ocupadas. Nadie miró a cámara en el primer cuarto de hora: primero conversación, después cámara. El resultado se usa desde la web hasta las tarjetas de prensa.',
    etiquetas: ['Retrato', 'Corporativo', 'Documental'],
    imagen: imagenMock('retrato-de-taller'),
  },
  {
    id: 'la-hora-azul',
    titulo: 'La Hora Azul',
    categoria: 'fotografia',
    cliente: 'Lumen Joyería',
    anio: 2024,
    rol: 'Fotografía y dirección de arte',
    locacion: 'Valparaíso',
    resumen: 'Joyería fotografiada en los veinte minutos exactos después del ocaso.',
    descripcion:
      'El oro pulido es un espejo: de día devuelve el set entero. Rodamos en hora azul, con la ciudad como única fuente y una linterna de mano para el acento. Cada pieza se disparó tres noches seguidas para tener continuidad de color entre looks.',
    etiquetas: ['Joyería', 'Hora azul', 'Campaña'],
    imagen: imagenMock('la-hora-azul'),
  },
  {
    id: 'piel-de-lino',
    titulo: 'Piel de Lino',
    categoria: 'fotografia',
    cliente: 'Quinta Esencia',
    anio: 2024,
    rol: 'Fotografía de campaña',
    locacion: 'Mérida',
    resumen: 'Campaña de ropa de cama donde la arruga es el argumento de venta.',
    descripcion:
      'La categoría entera fotografía camas perfectas. Nosotros rodamos al amanecer una cama recién usada, con luz rasante que convierte cada pliegue en relieve. Tres piezas, ningún modelo visible y un aumento del 40% en tiempo de permanencia en la ficha.',
    etiquetas: ['Campaña', 'Textil', 'Interiores'],
    imagen: imagenMock('piel-de-lino'),
  },
  {
    id: 'vidrio-templado',
    titulo: 'Vidrio Templado',
    categoria: 'fotografia',
    cliente: 'Núcleo Studio',
    anio: 2023,
    rol: 'Fotografía de producto y still life',
    locacion: 'Estudio · CDMX',
    resumen: 'Cristalería soplada resuelta con dos luces y muchísima paciencia.',
    descripcion:
      'Fotografiar vidrio transparente sobre fondo claro es un ejercicio de bordes: se ilumina el fondo, no el objeto. Dos paneles, banderas negras a los lados para dibujar el contorno y una jornada completa por cada familia de piezas.',
    etiquetas: ['Still life', 'Producto', 'Estudio'],
    imagen: imagenMock('vidrio-templado'),
  },
  {
    id: 'campo-abierto',
    titulo: 'Campo Abierto',
    categoria: 'fotografia',
    cliente: 'Tierra Alta',
    anio: 2023,
    rol: 'Fotografía documental de marca',
    locacion: 'Valle de Guadalupe',
    resumen: 'Tres días de vendimia contados sin una sola foto posada.',
    descripcion:
      'Una bodega familiar quería imágenes para etiqueta, web y prensa. Nos quedamos los tres días de la cosecha desde antes del amanecer, sin dirigir a nadie. Salieron ochocientas fotos; la marca trabaja desde entonces con una selección de sesenta.',
    etiquetas: ['Documental', 'Marca', 'Exteriores'],
    imagen: imagenMock('campo-abierto'),
  },
  {
    id: 'archivo-domestico',
    titulo: 'Archivo Doméstico',
    categoria: 'fotografia',
    cliente: 'Nadie, es mío',
    anio: 2022,
    rol: 'Fotografía y edición',
    locacion: 'Lima',
    resumen: 'Serie personal sobre objetos heredados y lo que sostienen.',
    descripcion:
      'Cuarenta objetos de tres generaciones de una misma casa, fotografiados con la misma luz, el mismo encuadre y el mismo fondo, como piezas de museo. El contraste entre el rigor del método y la trivialidad de los objetos es todo lo que quería contar. Se expuso en una galería pequeña y sigue creciendo.',
    etiquetas: ['Mío', 'Serie', 'Bodegón'],
    imagen: imagenMock('archivo-domestico'),
  },

  // ──────────────────────────────── MODELAJE ───────────────────────────────
  {
    id: 'pasarela-obsidiana',
    titulo: 'Pasarela Obsidiana',
    categoria: 'modelaje',
    cliente: 'Casa Bruma',
    anio: 2026,
    rol: 'Modelo de pasarela — apertura',
    locacion: 'Fashion Week · CDMX',
    resumen: 'Apertura de desfile con la colección de invierno en negro sobre negro.',
    descripcion:
      'Abrir un desfile significa fijar el ritmo de los veintidós looks que vienen detrás. Tres pruebas de vestuario, dos ensayos de recorrido y una capa de ocho kilos que había que mover como si no pesara. La foto de apertura terminó siendo la imagen de prensa de la temporada.',
    etiquetas: ['Pasarela', 'Apertura', 'Alta costura'],
    imagen: imagenMock('pasarela-obsidiana'),
  },
  {
    id: 'lookbook-nomada',
    titulo: 'Lookbook Nómada',
    categoria: 'modelaje',
    cliente: 'Marea Textil',
    anio: 2025,
    rol: 'Modelo — colección completa',
    locacion: 'Oaxaca',
    resumen: 'Treinta y cuatro looks en dos jornadas, con cambio a la intemperie.',
    descripcion:
      'Producción de alto volumen: un look cada once minutos, sin carpa y con luz que cambiaba cada media hora. La continuidad se sostuvo con una lista de poses acordada la noche anterior y un espejo de cuerpo entero atado a una camioneta.',
    etiquetas: ['Lookbook', 'Alto volumen', 'Exteriores'],
    imagen: imagenMock('lookbook-nomada'),
  },
  {
    id: 'verano-lento',
    titulo: 'Verano Lento',
    categoria: 'modelaje',
    cliente: 'Fauna Swim',
    anio: 2025,
    rol: 'Modelo de campaña',
    locacion: 'Cartagena',
    resumen: 'Campaña de baño rodada dentro del agua, no junto a ella.',
    descripcion:
      'Cinco horas de inmersión repartidas en dos días, con la cámara en carcasa y la dirección gritando desde una tabla. El brief pedía calma; la calma dentro del agua salada es trabajo físico. Dos de las tomas finales son apneas de más de treinta segundos.',
    etiquetas: ['Campaña', 'Swimwear', 'Submarino'],
    imagen: imagenMock('verano-lento'),
  },
  {
    id: 'rostro-de-temporada',
    titulo: 'Rostro de Temporada',
    categoria: 'modelaje',
    cliente: 'Verbena Beauty',
    anio: 2024,
    rol: 'Imagen de marca — contrato de temporada',
    locacion: 'CDMX · Estudio',
    resumen: 'Seis meses como cara visible de una línea de cosmética natural.',
    descripcion:
      'Un contrato de temporada no es una sesión: es sostener el mismo personaje en nueve entregas, con el mismo tono de piel, el mismo gesto y el mismo largo de cabello durante medio año. Incluyó tres sesiones de producto, dos de contenido social y la gráfica de punto de venta.',
    etiquetas: ['Beauty', 'Imagen de marca', 'Contrato'],
    imagen: imagenMock('rostro-de-temporada'),
  },
  {
    id: 'prueba-de-vestuario',
    titulo: 'Prueba de Vestuario',
    categoria: 'modelaje',
    cliente: 'Atelier Sereno',
    anio: 2024,
    rol: 'Modelo de ajuste y pasarela',
    locacion: 'Taller · CDMX',
    resumen: 'Modelo de ajuste durante el desarrollo completo de una colección.',
    descripcion:
      'Once semanas de pruebas: cada prenda se montó, se marcó y se volvió a montar sobre el mismo cuerpo hasta que el patrón funcionó. Es el trabajo que nadie fotografía y el que decide si el desfile se ve bien. Cerró con la pasarela de presentación.',
    etiquetas: ['Fitting', 'Atelier', 'Pasarela'],
    imagen: imagenMock('prueba-de-vestuario'),
  },
  {
    id: 'noche-de-gala',
    titulo: 'Noche de Gala',
    categoria: 'modelaje',
    cliente: 'Lumen Joyería',
    anio: 2024,
    rol: 'Modelo de campaña y evento',
    locacion: 'Teatro Metropólitan',
    resumen: 'Piezas de archivo llevadas en vivo durante la subasta anual.',
    descripcion:
      'Dos horas circulando entre mesas con collares de archivo, protocolo de seguridad y una lista de ángulos acordada con el fotógrafo de prensa. La campaña impresa se rodó la mañana siguiente, en el mismo teatro vacío, aprovechando la luz de servicio.',
    etiquetas: ['Evento', 'Joyería', 'Campaña'],
    imagen: imagenMock('noche-de-gala'),
  },
  {
    id: 'denim-crudo',
    titulo: 'Denim Crudo',
    categoria: 'modelaje',
    cliente: 'Norte Denim',
    anio: 2023,
    rol: 'Modelo de campaña',
    locacion: 'Monterrey',
    resumen: 'Campaña de selvedge fotografiada durante seis meses de uso real.',
    descripcion:
      'La marca quería mostrar cómo envejece su denim. El mismo par de pantalones, el mismo encuadre y la misma pose cada treinta días, medio año seguido. La pieza final es un díptico entre el día uno y el día ciento ochenta.',
    etiquetas: ['Campaña', 'Denim', 'Serie larga'],
    imagen: imagenMock('denim-crudo'),
  },
  {
    id: 'editorial-subterranea',
    titulo: 'Editorial Subterránea',
    categoria: 'modelaje',
    cliente: 'Cobalto Magazine',
    anio: 2023,
    rol: 'Modelo editorial',
    locacion: 'Estación abandonada · CDMX',
    resumen: 'Ocho páginas rodadas en cuatro horas de permiso municipal.',
    descripcion:
      'Locación cerrada, sin electricidad y con un reloj corriendo. Toda la sesión se resolvió con dos luces de batería y reflejos sobre azulejo. El equipo ensayó la secuencia completa en la calle antes de bajar, para no perder un minuto abajo.',
    etiquetas: ['Editorial', 'Revista', 'Locación'],
    imagen: imagenMock('editorial-subterranea'),
  },
  {
    id: 'primer-plano',
    titulo: 'Primer Plano',
    categoria: 'modelaje',
    cliente: 'Salvia Skincare',
    anio: 2023,
    rol: 'Modelo y creadora de contenido',
    locacion: 'Remoto',
    resumen: 'Cuarenta piezas verticales de rutina real, sin guion actuado.',
    descripcion:
      'Contenido nativo grabado en casa con luz de ventana, a una toma por pieza y sin retoque de piel. El brief prohibía expresamente la palabra "perfecto". Fue la tanda con mejor retención del año para la marca y se reutilizó en pauta durante dos trimestres.',
    etiquetas: ['UGC', 'Vertical', 'Beauty'],
    imagen: imagenMock('primer-plano'),
  },
  {
    id: 'book-retrospectiva',
    titulo: 'Book Retrospectiva',
    categoria: 'modelaje',
    cliente: 'Nadie, es mío',
    anio: 2022,
    rol: 'Modelo, edición y secuencia',
    locacion: 'Lima · CDMX',
    resumen: 'Cinco años de material propio editados en un book de veinte páginas.',
    descripcion:
      'Reunir el archivo fue lo fácil; decidir qué dejar fuera, no. El book final tiene veinte imágenes de cinco fotógrafos distintos, ordenadas por temperatura de color y no por fecha, para que se lea como una sola sesión larga. Es la pieza que abre cualquier conversación con agencias.',
    etiquetas: ['Book', 'Archivo', 'Edición'],
    imagen: imagenMock('book-retrospectiva'),
  },
]

/** Proyectos de un rubro, o todos si el filtro está en `todos`. */
export function proyectosPorFiltro(filtro: FiltroId): readonly Proyecto[] {
  if (filtro === 'todos') return PROYECTOS
  return PROYECTOS.filter((p) => p.categoria === filtro)
}

/** Cuántos proyectos hay en un rubro — el contador de la tarjeta de categoría. */
export function totalPorCategoria(id: CategoriaId): number {
  return PROYECTOS.filter((p) => p.categoria === id).length
}
