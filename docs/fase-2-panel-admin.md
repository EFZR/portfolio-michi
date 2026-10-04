# Fase 2 — Panel administrativo de escritorio + backend/CMS

Plan de arquitectura para convertir todo el contenido de la web en datos
gestionables desde una app nativa de escritorio, con un único usuario
administrador y **solo SDK de cliente** (sin Admin SDK, sin credenciales de
servicio, sin servidor propio).

> Estado: propuesta cerrada, pendiente de aprobación para empezar a implementar.
> Nada de esto está construido todavía.

**Índice**

1. [Las cuatro decisiones](#1-las-cuatro-decisiones)
2. [Auditoría de campos editables](#2-auditoría-de-campos-editables)
3. [Modelo de datos](#3-modelo-de-datos-firestore--storage)
4. [Reglas de seguridad](#4-reglas-de-seguridad) — _simplificado por [UI dinámica](./fase-2-ui-dinamica.md) §5.5_
5. [Esquemas Zod](#5-esquemas-zod) — _revisado por [UI dinámica](./fase-2-ui-dinamica.md)_
6. [La app de escritorio](#6-la-app-de-escritorio-tauri-2)
7. [Hoja de ruta](#7-hoja-de-ruta)
8. [Lo que puede morder](#8-lo-que-puede-morder)

---

## 1. Las cuatro decisiones

| #   | Decisión                         | Elegido                                                        | En una línea                                                                                                                                   |
| --- | -------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backend                          | **Firebase** (Firestore + Auth + Storage)                      | El contenido del blog ya es un árbol de bloques heterogéneos; Firestore lo guarda tal cual y el código ya lo daba por hecho.                   |
| 2   | Shell de escritorio              | **Tauri 2**                                                    | La web ya es Vue 3 + Vite; el panel reutiliza el mismo stack y pesa ~10 MB en vez de ~120 MB.                                                  |
| 3   | Cómo llega el contenido a la web | **En tiempo de build**, con hook de publicación desde el panel | El Hero es el LCP y su texto no puede esperar un round-trip a Firestore.                                                                       |
| 4   | Dónde vive el código             | **Monorepo con npm workspaces**                                | Los esquemas Zod tienen que ser _el mismo archivo_ en el panel, en la web y en el generador de reglas. Duplicarlos es garantizar que diverjan. |

### 1.1 Firebase frente a Supabase

Las dos cumplen la restricción de "solo SDK de cliente" y las dos tienen
seguridad a nivel de fila/documento. La diferencia real está en la forma de los
datos de **este** proyecto:

**A favor de Firebase**

- **El contenido del blog ya es un árbol tipado.** `Article.content` es
  `readonly ContentBlock[]`, una unión discriminada de seis formas distintas
  (`paragraph`, `heading`, `quote`, `list`, `code`, `image`). Firestore lo
  almacena como array de mapas anidados y lo devuelve igual. En Postgres sería
  una columna `jsonb`: funciona, pero entonces la mitad del contenido queda
  fuera del esquema relacional y las herramientas de Supabase (editor de tablas,
  tipos generados) dejan de servir justo donde más falta hacen.
- **Los micro-copys son un documento, no una tabla.** `ui_settings` es un objeto
  anidado por sección (`hero.titulo.palabras[]`, `contacto.pasos[]`). Un solo
  documento de Firestore = una lectura, una escritura, atómico. En Postgres
  serían una tabla clave/valor con `jsonb` en el valor, que es lo mismo pero con
  más piezas.
- **El código ya lo asumía.** `src/data/proyectos.ts:5`, `src/data/articulos.ts:5`
  y `src/lib/contacto.ts:6` dicen literalmente que en Fase 2 se sustituyen por
  llamadas a Firestore. Cambiar de rumbo ahora tiene un coste de documentación
  que no compra nada.
- **Un solo administrador convierte las reglas en tres líneas.** La regla es
  `request.auth.uid == '<uid>'`. En RLS habría que crear políticas por tabla y
  por operación para llegar al mismo sitio.

**A favor de Supabase (lo que perdemos, dicho en claro)**

- **Unicidad de slug gratis.** Postgres da `UNIQUE(slug)`; Firestore no tiene
  constraints. → _Mitigación:_ el slug **es** el ID del documento, y los IDs de
  documento sí son únicos por definición. Problema resuelto sin coste.
- **Consultas de verdad.** El filtro del blog (búsqueda por texto + categoría)
  en SQL es una línea. → _Mitigación:_ son 12 artículos y 30 proyectos, y el
  filtrado ya ocurre en cliente sobre el array completo
  (`BlogView.vue`, `proyectosPorFiltro`). No hay nada que optimizar.
- **Contador de likes seguro.** En Supabase sería una función RPC
  `SECURITY DEFINER`. → _Mitigación:_ Firestore tiene `increment(1)` atómico
  desde el cliente, acotado por regla a exactamente +1 (ver §4.3).

**Veredicto:** Firebase. Supabase sería la elección correcta si el blog fuese
Markdown plano y hubiera relaciones que consultar; aquí el dato es un árbol y la
consulta es un `.filter()` en memoria.

### 1.2 Tauri 2 frente a Electron

|                                  | Tauri 2                              | Electron                        |
| -------------------------------- | ------------------------------------ | ------------------------------- |
| Peso del instalador              | ~8–12 MB                             | ~90–150 MB                      |
| RAM en reposo                    | ~80–120 MB                           | ~250–400 MB                     |
| Frontend                         | Vue 3 + Vite, idéntico a la web      | Vue 3 + Vite, idéntico a la web |
| Firebase JS SDK                  | Funciona (ver §6.2, hay dos trampas) | Funciona sin trampas            |
| Linux (el equipo actual es Arch) | WebKitGTK del sistema                | Chromium embebido               |

El panel es una app de formularios: nueve pantallas, ningún vídeo, ninguna
integración nativa pesada. Electron traería un Chromium entero para renderizar
`<input>`s. **Tauri 2**, y además permite reutilizar `BaseField`, `BaseCtaButton`
y los tokens de `main.css` tal cual, así que el panel se ve como la web sin
diseñar nada nuevo.

Las dos trampas de Firebase en Tauri (§6.2) tienen solución conocida y de una
línea cada una. No cambian la decisión.

### 1.3 Build-time frente a runtime

La petición dice "100 % dinámico y parametrizable". Eso es una propiedad de
**quién puede cambiarlo** (la administradora, sin tocar código), no de **cuándo
viaja el dato**. Y el cuándo importa aquí por una razón concreta:

> El Hero es el LCP de la web. Su H1 son cinco palabras desglosadas letra a
> letra, con un reveal de GSAP que espera a `useAppReady`. Si esas cinco
> palabras vienen de un `getDoc()`, o el Hero se pinta vacío y salta, o el
> preloader se alarga lo que tarde la red. Las dos cosas rompen justo lo que
> hace reconocible a este sitio.

Por eso:

- **Contenido y micro-copys → se resuelven en el build.** Un script de prebuild
  lee Firestore con el SDK de cliente y escribe `src/data/contenido.json`. La web
  publicada **no carga el SDK de Firebase**: cero KB añadidos, cero round-trips,
  el Hero sigue pintando en el primer frame.
- **Publicar = un botón en el panel** que hace `POST` al _build hook_ de Netlify.
  Latencia entre "Guardar" y "está en vivo": ~60–90 s, que es lo que tarda el
  build actual.
- **Likes y formulario de contacto → sí van en runtime.** Son escrituras del
  visitante, no pueden ser estáticas. El SDK se carga en un chunk aparte y solo
  en `/blog/*` y `/contact` (`import()` dinámico).

Si algún día "publicar" tiene que ser instantáneo, mover una colección de
build-time a runtime es cambiar el repositorio que la sirve — el modelo de datos,
las reglas y los esquemas no se tocan. La decisión es reversible por colección.

---

## 2. Auditoría de campos editables

Barrido completo de `src/`. Todo lo que hoy es un literal en un `.vue` o un
`.ts` y que la administradora debería poder cambiar sin abrir el editor.

**Resumen:** 4 colecciones de entidades (48 documentos) + **105 claves de micro-copy** repartidas en 13 grupos.

### 2.0 Tres hallazgos previos

Cosas que la auditoría destapó y que hay que arreglar _antes_ de parametrizar,
porque si no se parametrizan tres veces:

1. **El email está triplicado.** `karolmpalmam@gmail.com` aparece hardcodeado en
   `ContactSection.vue:29`, `ContactView.vue:15` y `AppFooter.vue:7`. Cambiarlo
   hoy exige tocar tres archivos y acordarse de los tres.
2. **El lugar está duplicado.** `Tegucigalpa, Honduras` en `ContactSection.vue:30`
   y `ContactView.vue:16`.
3. **Las redes sociales son `href="#"`.** `AppFooter.vue:22-26` — tres enlaces
   que no llevan a ningún sitio y están publicados.

Los tres se resuelven solos al pasar a `ui_settings`: una clave, un sitio.

### 2.1 Entidades

| Colección                          | Registros hoy      | Fuente actual                                   |
| ---------------------------------- | ------------------ | ----------------------------------------------- |
| `articulos`                        | 12 (58 bloques)    | `src/data/articulos.ts`                         |
| `proyectos`                        | 30                 | `src/data/proyectos.ts`                         |
| `categorias` (rubros = servicios)  | 3                  | `src/data/proyectos.ts` + `ServicesSection.vue` |
| `catalogo` (desglose de servicios) | 3 grupos × 6 ítems | `ServicesSection.vue:79-167`                    |

#### `articulos`

| Campo         | Tipo                   | Hoy (min–max)              | Límite                    | De dónde sale el límite                                                                                                     |
| ------------- | ---------------------- | -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `slug`        | string (= ID del doc)  | 18–41                      | 8–60, `/^[a-z0-9-]+$/`    | Es la URL. Único por ser el ID.                                                                                             |
| `title`       | string                 | 18–49                      | ≤ 70                      | `ArticleSpotlight` lo pinta a `clamp(2rem,6vw,4.5rem)` sin recorte; a partir de ~70 son cuatro líneas y se come la tarjeta. |
| `excerpt`     | string                 | 105–134                    | ≤ 180 (recomendado ≤ 140) | `ArticleRow.vue:79` lo recorta a 2 líneas en `max-w-2xl text-sm` ≈ 170 caracteres. Pasado eso se corta a mitad de frase.    |
| `content`     | `ContentBlock[]`       | 3–10 bloques               | 1–120 bloques             | Ver §2.2.                                                                                                                   |
| `coverImage`  | URL                    | —                          | URL válida o ruta `/`     | Hoy `picsum.photos/seed/<slug>`; pasa a Storage.                                                                            |
| `category`    | enum                   | 5 valores                  | uno de `categoriasBlog`   | `BLOG_CATEGORIES` pasa a ser editable (§2.3).                                                                               |
| `author`      | string                 | 5                          | ≤ 40                      |                                                                                                                             |
| `publishedAt` | fecha ISO `YYYY-MM-DD` | —                          | fecha válida              | `lib/fechas.ts` la parsea a mano por el desfase UTC — el formato es contrato.                                               |
| `readTime`    | int (minutos)          | 5–11                       | 1–90                      |                                                                                                                             |
| `likesCount`  | int                    | 0–302                      | ≥ 0                       | **Solo lectura en el panel.** Lo escribe el visitante (§4.3).                                                               |
| `priority`    | enum                   | `hero` / `high` / `normal` | los tres                  | Decide la _forma_ de la tarjeta. Debe haber **exactamente uno** en `hero`.                                                  |
| `tags`        | string[]               | 3 por artículo             | 0–8, cada uno ≤ 24        | Se pintan como badges en fila.                                                                                              |

**Regla de colección (no de documento):** exactamente un artículo con
`priority: 'hero'`. Hoy lo garantiza que el archivo lo escribe una persona; con
un panel hay que validarlo al guardar (§5.4).

#### `proyectos`

| Campo         | Tipo                  | Hoy (min–max)  | Límite                 | De dónde sale                                                                                        |
| ------------- | --------------------- | -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`          | string (= ID del doc) | —              | 3–60, `/^[a-z0-9-]+$/` | Es la clave de `v-for` y la futura ruta `/projects/:slug`.                                           |
| `titulo`      | string                | 10–21          | ≤ 40                   | `ProjectCard` lo pinta en `font-heading` a 2 líneas máximo.                                          |
| `categoria`   | enum                  | 3 valores      | ID de `categorias`     | Referencia; si se borra un rubro hay que reasignar.                                                  |
| `cliente`     | string                | 10–16          | ≤ 40                   |                                                                                                      |
| `anio`        | int                   | 2022–2026      | 1990–(año actual + 1)  |                                                                                                      |
| `rol`         | string                | 16–44          | ≤ 60                   | Línea de ficha, sin recorte.                                                                         |
| `locacion`    | string                | 4–26           | ≤ 40                   |                                                                                                      |
| `resumen`     | string                | 51–76          | ≤ 110                  | `ProjectCard.vue:116` lo recorta a 2 líneas en `max-w-md text-sm` ≈ 112 caracteres.                  |
| `descripcion` | string                | 63–322         | ≤ 600                  | Párrafo del modal; a partir de ~600 el `ProjectDetailModal` pide scroll y deja de leerse como ficha. |
| `etiquetas`   | string[]              | 3 por proyecto | 0–6, cada una ≤ 24     |                                                                                                      |
| `imagen`      | URL                   | —              | URL o ruta             | 4:5 vertical (1000×1250). La proporción **es** el diseño del grid.                                   |
| `orden`       | int                   | _no existe_    | ≥ 0                    | **Campo nuevo.** Hoy el orden es el del array literal; en Firestore hace falta explícito.            |

#### `categorias` — los tres rubros, que son también los tres servicios

Una sola colección para las dos cosas: `ProjectCategoryCard` y la diapositiva de
`ServicesSection` pintan el mismo rubro con distinto vestido, y el código ya
avisa de que el orden debe coincidir en los tres sitios
(`ServicesSection.vue:45-50`).

| Campo         | Hoy                                     | Límite     | De dónde sale                                                                                                                    |
| ------------- | --------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `marketing` / `fotografia` / `modelaje` | slug       | Lo referencian `proyectos.categoria` y el `<select>` del formulario.                                                             |
| `nombre`      | 9–10                                    | ≤ 18       | Es el titular de la diapositiva a `clamp(3rem,10vw,8rem)`; a más de 18 no cabe en una línea.                                     |
| `kicker`      | 15–18                                   | ≤ 24       | `tracking-[0.3em]` uppercase: a 0.3em de interletraje, 24 caracteres ya miden ~280 px y en móvil (320 px de viewport) desbordan. |
| `descripcion` | 58–71                                   | ≤ 90       | Se revela al hover de la tarjeta de rubro, 2 líneas.                                                                             |
| `tagline`     | 25–30                                   | ≤ 40       | El `Editorial · Producto · Retrato` de la diapositiva.                                                                           |
| `detalle`     | 43–52                                   | ≤ 80       | La frase bajo el titular de la diapositiva.                                                                                      |
| `imagen`      | ruta en `public/`                       | ruta o URL | 4:5 vertical (1200×1500).                                                                                                        |
| `orden`       | implícito                               | int        | **Campo nuevo.** El orden es jerarquía, no alfabético.                                                                           |

#### `catalogo` — el desglose del modal de servicios

Un documento por grupo, con el mismo `id` que el rubro.

| Campo                 | Hoy         | Límite                                                                          |
| --------------------- | ----------- | ------------------------------------------------------------------------------- |
| `titulo`              | 9–10        | ≤ 18                                                                            |
| `nota`                | 20–27       | ≤ 36                                                                            |
| `items[].nombre`      | 8–26        | ≤ 40                                                                            |
| `items[].descripcion` | 45–78       | ≤ 110                                                                           |
| `items`               | 6 por grupo | 1–12 (la retícula es de 3 columnas; más de 12 obliga a scroll dentro del modal) |

### 2.2 Bloques de contenido del blog

Seis formas, unión discriminada por `type`. Se mantienen **exactamente** como
están en `src/data/articulos.ts:31-67` — el editor de bloques del panel produce
este mismo árbol y `ArticleContent.vue` no cambia ni una línea.

| `type`      | Campos                | Límites                                                                                                                              |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `paragraph` | `text`                | 1–2000                                                                                                                               |
| `heading`   | `text`                | 1–100 (es un `<h2>`, no un título de página)                                                                                         |
| `quote`     | `text`, `cite?`       | texto 1–400, cita ≤ 60                                                                                                               |
| `list`      | `items[]`, `ordered?` | 1–20 ítems, cada uno ≤ 200                                                                                                           |
| `code`      | `code`, `language?`   | código 1–4000, lenguaje ≤ 20                                                                                                         |
| `image`     | `src`, `caption`      | URL válida, pie 1–160 — **el pie es obligatorio a propósito** (`articulos.ts:60`: "una imagen sin pie en un artículo es decoración") |

### 2.3 Micro-copys de UI — 105 claves

Documento único `config/ui`. La columna **Máx.** es un límite _físico_: no es
una preferencia editorial, es el punto a partir del cual el texto rompe el
layout. La columna **Por qué** dice qué lo rompe.

#### `sitio` — global (7)

| Clave               | Valor hoy                | Len | Máx. | Por qué                                                                                                                                        |
| ------------------- | ------------------------ | --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `sitio.nombre`      | `Princess Portfolio`     | 18  | 40   | `<title>` del documento.                                                                                                                       |
| `sitio.autora`      | `Michi My Princess`      | 17  | 40   | Copyright del footer.                                                                                                                          |
| `sitio.email`       | `karolmpalmam@gmail.com` | 22  | 60   | **Hoy triplicado.** En `AppFooter` se pinta a `clamp(1.4rem,6.5vw,4.25rem)`: pasados ~40 caracteres se parte en dos líneas incluso en desktop. |
| `sitio.lugar`       | `Tegucigalpa, Honduras`  | 21  | 48   | **Hoy duplicado.** Va dentro de una frase corrida.                                                                                             |
| `sitio.descripcion` | _(no existe)_            | —   | 160  | **Nueva.** `<meta name="description">` — hoy la web no tiene ninguna.                                                                          |
| `sitio.ogImagen`    | _(no existe)_            | —   | URL  | **Nueva.** Imagen de previsualización al compartir.                                                                                            |
| `sitio.idioma`      | `es`                     | 2   | 5    | `<html lang>`.                                                                                                                                 |

#### `rutas` — títulos de pestaña (7)

Una clave por ruta de `src/router/index.ts`. El `RouteMeta` aumentado en
`src/types/router.ts` obliga a que toda ruta declare `meta.title`, así que
parametrizarlas es sustituir el literal por una lectura del documento.

| Clave                 | Valor hoy                         | Máx. |
| --------------------- | --------------------------------- | ---- |
| `rutas.home`          | `Princess Portfolio — Inicio`     | 70   |
| `rutas.projects`      | `Portafolio · Princess Portfolio` | 70   |
| `rutas.projectDetail` | `Proyecto · Princess Portfolio`   | 70   |
| `rutas.contact`       | `Contacto · Princess Portfolio`   | 70   |
| `rutas.blog`          | `Blog · Princess Portfolio`       | 70   |
| `rutas.blogPost`      | `Artículo · Princess Portfolio`   | 70   |
| `rutas.notFound`      | `404 · Página no encontrada`      | 70   |

> 70 caracteres es el corte de Google en resultados de búsqueda. No rompe nada
> visualmente; rompe el SEO, que es la única razón por la que existe el campo.

#### `nav` — navbar y drawer (5 + 2 listas)

| Clave            | Valor hoy              | Len | Máx.      | Por qué                                                                                                                                                           |
| ---------------- | ---------------------- | --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav.cta`        | `Hablemos`             | 8   | 18        | `BaseCtaButton` duplica el texto letra a letra para el letter-swap, con 30 ms de stagger por letra: a 18 caracteres la animación ya dura 540 ms y se siente rota. |
| `nav.abrir`      | `Menú`                 | 4   | 12        | Mismo botón, mismo swap.                                                                                                                                          |
| `nav.cerrar`     | `Cerrar`               | 6   | 12        | Ídem.                                                                                                                                                             |
| `nav.logoAria`   | `Inicio — my Princess` | 20  | 60        | Etiqueta accesible del logo.                                                                                                                                      |
| `nav.drawerAria` | `Navegación del pie`   | 18  | 60        |                                                                                                                                                                   |
| `nav.items[]`    | 3 ítems inline         | —   | ver abajo | `Portafolio` / `Blog` / `Sobre mí`                                                                                                                                |
| `nav.drawer[]`   | 5 ítems                | —   | ver abajo | `Inicio` / `Portafolio` / `Blog` / `Sobre mí` / `Contacto`                                                                                                        |

**`nav.items[]`** (`{ label, to }`): 2–4 ítems, `label` ≤ 14.
Restricción de conjunto: **la suma de los labels ≤ 38 caracteres**. A 768 px
(el breakpoint `md` donde aparecen inline) comparten fila con el logo y el CTA;
pasados ~38 caracteres el CTA se sale.

**`nav.drawer[]`** (`{ index, label, to }`): 3–7 ítems, `label` ≤ 12.
Se pintan en `font-hero` a tamaño masivo, una línea cada uno. El `index`
(`01`, `02`…) es correlativo y **se debe regenerar solo** al reordenar — hoy
`AppNavDrawer.vue:30` avisa de que hay que renumerar a mano.

#### `hero` — el bloque crítico (9)

| Clave              | Valor hoy                                                   | Len | Máx. | Por qué                                                                                       |
| ------------------ | ----------------------------------------------------------- | --- | ---- | --------------------------------------------------------------------------------------------- |
| `hero.palabras[0]` | `tu`                                                        | 2   | 12   | Ver nota.                                                                                     |
| `hero.palabras[1]` | `siguiente`                                                 | 9   | 12   |                                                                                               |
| `hero.palabras[2]` | `nivel`                                                     | 5   | 12   |                                                                                               |
| `hero.palabras[3]` | `empieza`                                                   | 7   | 12   |                                                                                               |
| `hero.palabras[4]` | `aquí`                                                      | 4   | 10   | Es la acentuada (`font-heading` italic UV) y la que más sangra (`lg:ps-70` = 17.5 rem).       |
| `hero.aria`        | `Tu siguiente nivel empieza aquí`                           | 31  | 90   | `aria-label` del H1 — la frase que oye un lector de pantalla.                                 |
| `hero.copy`        | `Visualiza, ilustra, dirige. / Hace que las ideas existan.` | 55  | 90   | Caja `max-w-xs` (20 rem) a `text-sm`: ~45 caracteres por línea, 2 líneas.                     |
| `hero.scrollCue`   | `(Scroll para ver más)`                                     | 21  | 28   | `tracking-[0.25em]` uppercase en una caja que comparte fila con `hero.copy` a partir de `sm`. |
| `hero.imagenAlt`   | `Retrato`                                                   | 7   | 120  |                                                                                               |

> **El H1 son exactamente 5 palabras, y eso es estructura, no contenido.**
> `HeroSection.vue:19-23` define cinco arrays de letras y el template les aplica
> sangrías distintas por índice (0 y 3 al margen; 1, 2 y 4 escalonadas). El
> esquema fija `.length(5)`: añadir una sexta no es un cambio de copy, es
> rediseñar el Hero.
>
> **El límite de 12 caracteres por palabra** sale de que cada palabra es
> `whitespace-nowrap` a `clamp(2.75rem, 13vw, 18rem)` en Anton. Con un avance
> medio de ~0.40 em en mayúsculas, una palabra de _n_ letras mide
> `n × 0.40 × 13vw`; sumando la sangría de `ps-20` (5 rem), el desbordamiento
> horizontal empieza alrededor de _n_ = 13. A 12 queda un margen de una letra.

#### `about` — `#about` (7)

| Clave                | Valor hoy                                                                                                | Len | Máx. | Por qué                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `about.kicker`       | `¿Qué hago?`                                                                                             | 10  | 24   | `tracking-[0.3em]` uppercase — a 24 caracteres mide ~280 px y desborda el gutter en móvil.                                                                                               |
| `about.statement[0]` | `Mercadóloga,`                                                                                           | 12  | 14   | `clamp(2.75rem,11vw,9rem)` sin sangría.                                                                                                                                                  |
| `about.statement[1]` | `fotógrafa`                                                                                              | 9   | 11   | Misma escala **con `sm:ps-[16vw]`** — la sangría se come el 16 % del ancho.                                                                                                              |
| `about.statement[2]` | `& modelo.`                                                                                              | 9   | 13   | Misma escala con `sm:ps-[5vw]`. Es la línea acentuada (italic UV).                                                                                                                       |
| `about.aria`         | `Soy mercadóloga, fotógrafa y modelo`                                                                    | 35  | 90   | `aria-label` del H2.                                                                                                                                                                     |
| `about.copy`         | `Uno la mirada estética con la estrategia de marca: creo imágenes que comunican, conectan y convierten.` | 102 | 150  | Anclado abajo-derecha en `sm:max-w-md` a `text-xl`: pasados ~150 caracteres invade el cue de scroll.                                                                                     |
| `about.cueTexto`     | `DESLIZA · SCROLL · `                                                                                    | 19  | 24   | Va en un `<textPath>` circular de radio 34 que se repite para cerrar la vuelta. Si no es divisor aproximado de la circunferencia, el texto se solapa consigo mismo al cerrar el círculo. |

#### `servicios` — `ServicesSection` (7)

| Clave                         | Valor hoy                                                               | Len | Máx. | Por qué                                                |
| ----------------------------- | ----------------------------------------------------------------------- | --- | ---- | ------------------------------------------------------ |
| `servicios.kicker`            | `Servicios`                                                             | 9   | 24   | Kicker `tracking-[0.3em]`.                             |
| `servicios.bajada`            | `Tres frentes, una misma mirada.`                                       | 31  | 70   | `max-w-sm` (24 rem) a `text-base`, 2 líneas.           |
| `servicios.cta`               | `Catálogo completo`                                                     | 17  | 22   | `BaseCtaButton` con letter-swap (30 ms/letra).         |
| `servicios.modalEyebrow`      | `Todo lo que hago`                                                      | 16  | 30   | Eyebrow del `BaseModal`.                               |
| `servicios.modalTitulo`       | `Catálogo de servicios`                                                 | 21  | 40   | Título del modal.                                      |
| `servicios.modalCierre`       | `¿Tu proyecto no encaja en ninguna casilla? Suele ser la mejor señal —` | 69  | 140  | Párrafo con un enlace incrustado al final.             |
| `servicios.modalCierreEnlace` | `escríbeme y lo armamos a medida`                                       | 31  | 50   | El texto del `RouterLink` dentro de la frase anterior. |

#### `contacto` — sección del Home (5)

| Clave                      | Valor hoy                                                             | Len | Máx. | Por qué                                                    |
| -------------------------- | --------------------------------------------------------------------- | --- | ---- | ---------------------------------------------------------- |
| `contacto.arcoTitulo`      | `Estás listo para trabajar`                                           | 25  | 26   | **El límite más duro de toda la web.** Ver nota.           |
| `contacto.arcoAcento`      | `juntos`                                                              | 6   | 10   | Ídem, es el `tspan` en italic UV.                          |
| `contacto.statement`       | `Hagamos algo que la gente`                                           | 25  | 60   | `clamp(1.75rem,4vw,3.25rem)` en `max-w-2xl`, 2 líneas.     |
| `contacto.statementAcento` | `recuerde`                                                            | 8   | 20   | La palabra acentuada del final.                            |
| `contacto.frase`           | `Escríbeme a {email} — trabajo desde {lugar}, con la agenda abierta.` | 66  | 160  | Plantilla con dos interpolaciones. `max-w-xl` a `text-lg`. |

> **El arco.** `ContactSection.vue:263` dibuja una bézier cuadrática de ~1859
> unidades de longitud y pinta el titular encima a `145px`. La frase ocupa el
> ~86 % de la curva (el 14 % restante es por donde entra y sale de cuadro).
> Con Fraunces semibold, el avance medio es ~0.355 em → **~31–34 caracteres
> cabe, 35 no**. El comentario del propio componente lo dice sin rodeos: no hay
> palanca de tamaño, solo partir la frase en dos renglones (que es un rediseño).
>
> El esquema lo expresa como dos `.max()` **más un `refine` sobre la suma**:
> `arcoTitulo + ' ' + arcoAcento ≤ 34`. El panel muestra un contador conjunto
> que se pone en rojo a 35, no dos contadores independientes — porque el límite
> es de la frase, no de cada mitad.

#### `paginaContacto` — `/contact` (7 + lista de pasos)

| Clave                         | Valor hoy                                                 | Len | Máx.      |
| ----------------------------- | --------------------------------------------------------- | --- | --------- |
| `paginaContacto.kicker`       | `Contacto`                                                | 8   | 24        |
| `paginaContacto.titulo[0]`    | `Cuéntame`                                                | 8   | 16        |
| `paginaContacto.titulo[1]`    | `qué traes`                                               | 9   | 16        |
| `paginaContacto.bajada`       | `No hace falta que lo tengas resuelto…`                   | 113 | 180       |
| `paginaContacto.comoFunciona` | `Cómo funciona`                                           | 13  | 24        |
| `paginaContacto.directo`      | `O directo`                                               | 9   | 24        |
| `paginaContacto.fraseLugar`   | `Trabajo desde {lugar}, con la agenda abierta.`           | 44  | 120       |
| `paginaContacto.pasos[]`      | 3 pasos                                                   | —   | 2–5 pasos |
| ↳ `titulo`                    | `Te respondo`                                             | 11  | 28        |
| ↳ `detalle`                   | `En un par de días, con mis dudas y una idea de tiempos.` | 54  | 120       |

> `titulo[0]` y `titulo[1]` son dos líneas enmascaradas a `sm:text-6xl` (3.75 rem)
> sin sangría; 16 caracteres es donde tocan el borde del contenedor `bleed`.
> El `indice` (`01`, `02`, `03`) se genera, no se escribe.

#### `formulario` — `ContactForm` (13)

| Clave                           | Valor hoy                                       | Máx. |
| ------------------------------- | ----------------------------------------------- | ---- |
| `formulario.nombreLabel`        | `Cómo te llamas`                                | 30   |
| `formulario.nombrePlaceholder`  | `Tu nombre`                                     | 40   |
| `formulario.emailLabel`         | `A dónde te escribo`                            | 30   |
| `formulario.emailPlaceholder`   | `tucorreo@ejemplo.com`                          | 40   |
| `formulario.oficioLabel`        | `Qué necesitas`                                 | 30   |
| `formulario.oficioOtra`         | `Otra cosa`                                     | 24   |
| `formulario.mensajeLabel`       | `Cuéntame`                                      | 30   |
| `formulario.mensajePlaceholder` | `Estoy montando una marca de…`                  | 60   |
| `formulario.errorNombre`        | `Me falta tu nombre.`                           | 90   |
| `formulario.errorEmailVacio`    | `Sin un correo no puedo responderte.`           | 90   |
| `formulario.errorEmailFormato`  | `Ese correo no parece completo, revísalo.`      | 90   |
| `formulario.errorOficio`        | `Dime por dónde va la cosa.`                    | 90   |
| `formulario.errorMensaje`       | `Cuéntame un poco más, aunque sean dos líneas.` | 90   |

Los labels van a 30 porque `BaseField` los pinta sobre el control a una línea;
los errores a 90 porque se pintan bajo el campo en `text-sm` y a partir de ahí
empujan el siguiente campo.

#### `portafolio` — `/projects` (9)

| Clave                          | Valor hoy                                         | Len | Máx.   | Por qué                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------- | --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portafolio.kicker`            | `Portafolio`                                      | 10  | 24     | Kicker.                                                                                                                                                                                                    |
| `portafolio.titulo[0]` / `[1]` | 2 líneas enmascaradas                             | —   | 16 c/u | Mismo patrón que `/contact`.                                                                                                                                                                               |
| `portafolio.bajada`            | `Treinta historias que ya salieron de mi cabeza…` | 128 | 200    | `max-w-sm` a `text-base`.                                                                                                                                                                                  |
| `portafolio.estadoTodos`       | `Todo revuelto`                                   | 13  | 28     | Contador `font-mono tracking-[0.2em]`, comparte fila con el CTA.                                                                                                                                           |
| `portafolio.estadoFiltrado`    | `Solo {rubro}`                                    | —   | 28     | Plantilla; `{rubro}` puede sumar hasta 18 (§2.1).                                                                                                                                                          |
| `portafolio.ctaVerTodo`        | `Verlo todo`                                      | 10  | 22     | Letter-swap.                                                                                                                                                                                               |
| `portafolio.ctaMasLote`        | `Ver {n} historia(s) más`                         | —   | 30     | Plantilla con plural.                                                                                                                                                                                      |
| `portafolio.lote`              | `6`                                               | —   | 3–12   | **Parámetro numérico, no copy.** Hoy `LOTE = 6` en `ProjectsView.vue:39`. Debe ser múltiplo de 3: la retícula es de 3 columnas y con otro número queda media fila coja (razonado en el propio componente). |

#### `blog` — `/blog` y `/blog/:slug` (11)

| Clave                    | Valor hoy                                     | Len | Máx.                                         |
| ------------------------ | --------------------------------------------- | --- | -------------------------------------------- |
| `blog.kicker`            | `Blog`                                        | 4   | 24                                           |
| `blog.titulo[0]` / `[1]` | 2 líneas                                      | —   | 16 c/u                                       |
| `blog.bajada`            | `Lo que voy aprendiendo mientras trabajo…`    | 133 | 200                                          |
| `blog.vacioTitulo`       | `Por aquí no hay nada`                        | 20  | 40                                           |
| `blog.vacioDetalle`      | `Prueba con otra palabra, o quita el filtro…` | 68  | 140                                          |
| `blog.ctaVerTodo`        | `Ver todo`                                    | 8   | 22                                           |
| `blog.ctaVolver`         | `Ver todas las notas`                         | 19  | 22                                           |
| `blog.diasReciente`      | `7`                                           | —   | 1–30 · **parámetro** (`lib/fechas.ts:10`)    |
| `blog.diasArchivo`       | `365`                                         | —   | 30–3650 · **parámetro** (`lib/fechas.ts:13`) |
| `blog.categorias[]`      | 5 valores                                     | —   | 2–10 ítems, ≤ 30 c/u                         |

`blog.categorias[]` es `BLOG_CATEGORIES` (`articulos.ts:104`). Alimenta el
`<select>` de `BlogFilters` y el campo `category` de cada artículo: borrar una
categoría que está en uso debe bloquearse en el panel (§5.4).

#### `footer` (11)

| Clave                     | Valor hoy                                               | Len | Máx.             | Por qué                                                                 |
| ------------------------- | ------------------------------------------------------- | --- | ---------------- | ----------------------------------------------------------------------- |
| `footer.kicker`           | `¿Trabajamos juntos?`                                   | 19  | 24               | Kicker `tracking-[0.3em]`.                                              |
| `footer.cta`              | `Hablemos`                                              | 8   | 18               | Letter-swap.                                                            |
| `footer.colNavegacion`    | `Navegación`                                            | 10  | 20               | Encabezado de columna, `tracking-[0.2em]`, 4 columnas a partir de `sm`. |
| `footer.colRedes`         | `Redes`                                                 | 5   | 20               | Ídem.                                                                   |
| `footer.colEstudio`       | `Estudio`                                               | 7   | 20               | Ídem.                                                                   |
| `footer.estudioTexto`     | `Disponible para proyectos freelance y colaboraciones.` | 52  | 120              | Una columna de 1/4 de ancho: pasados ~120 caracteres estira el footer.  |
| `footer.estudioDestacado` | `freelance`                                             | 9   | 24               | La palabra en `text-foreground` dentro de la frase.                     |
| `footer.volverArriba`     | `Volver arriba`                                         | 13  | 24               | `tracking-[0.2em]` uppercase.                                           |
| `footer.copyright`        | `© {año} {autora}. Todos los derechos reservados.`      | —   | 120              | Plantilla; `{año}` se calcula.                                          |
| `footer.enlaces[]`        | 6 ítems                                                 | —   | 2–10, label ≤ 18 | Retícula de 2 columnas dentro de una columna doble.                     |
| `footer.redes[]`          | 3 ítems                                                 | —   | 0–6              | `{ label ≤ 20, href: URL }` — **hoy los tres `href` son `#`**.          |

#### `notFound` (4)

| Clave             | Valor hoy                                       | Máx. |
| ----------------- | ----------------------------------------------- | ---- |
| `notFound.kicker` | `404`                                           | 12   |
| `notFound.titulo` | `Página no encontrada`                          | 40   |
| `notFound.copy`   | `El recurso que buscas no existe o fue movido.` | 140  |
| `notFound.cta`    | `Volver al inicio`                              | 22   |

### 2.4 Lo que **no** se parametriza (y por qué)

Decidirlo explícitamente ahora evita una pantalla de configuración con 200
campos que nadie usa:

- **Colores, tipografías y radios.** Viven en el `@theme` de `main.css` y son el
  sistema de diseño, no contenido. Exponerlos permitiría romper la paleta
  60/30/10 desde un formulario.
- **Los tiempos y curvas de las animaciones GSAP.** `STEP`/`HOLD` de
  `ServicesSection`, el `scrub`, los `stagger`. Son calibración visual; un
  número mal puesto rompe la sección pinneada.
- **Rutas y estructura de navegación.** Los `to` de `nav.items` se eligen de una
  lista cerrada (las 6 rutas que existen), no se escriben a mano. Un `to` libre
  produce enlaces rotos y el 404 no los delata hasta que alguien los pulsa.
- **Los `aria-label` puramente decorativos** (`Retrato` del sparkle, el `aria-hidden`
  de los arcos). Se parametrizan solo los que describen contenido real.
- **El honeypot `bot-field`.** Es contrato con el servicio de formularios
  (`lib/contacto.ts:33`), no copy.

---

## 3. Modelo de datos (Firestore + Storage)

### 3.1 Colecciones

```
firestore/
├── config/
│   ├── ui                  ← documento único: las 105 claves de micro-copy (§2.3)
│   └── publicacion         ← { ultimaPublicacion, ultimoBuild, version }
│
├── categorias/{id}         ← 3 docs. id = 'marketing' | 'fotografia' | 'modelaje'
│   └── { nombre, kicker, descripcion, tagline, detalle, imagen, orden }
│
├── catalogo/{id}           ← 3 docs, mismo id que el rubro
│   └── { titulo, nota, items: [{ nombre, descripcion }] }
│
├── proyectos/{slug}        ← 30 docs. El slug ES el id (unicidad gratis)
│   └── { titulo, categoria, cliente, anio, rol, locacion, resumen,
│         descripcion, etiquetas[], imagen, orden, borrador,
│         creadoEn, actualizadoEn }
│
├── articulos/{slug}        ← 12 docs. El slug ES el id
│   └── { title, excerpt, content[], coverImage, category, author,
│         publishedAt, readTime, likesCount, priority, tags[],
│         borrador, creadoEn, actualizadoEn }
│
└── mensajes/{autoId}       ← bandeja de entrada del formulario
    └── { nombre, email, oficio, mensaje, recibidoEn, leido }
```

**Tres decisiones del modelo que no son obvias:**

1. **El slug es el ID del documento.** Firestore no tiene constraints de
   unicidad, pero los IDs de documento son únicos por definición. Esto convierte
   "el slug tiene que ser único" de una validación que puede fallar en una
   condición estructural que no puede. Coste: renombrar un slug es
   crear + borrar, no un `update`. El panel lo hace en una transacción y avisa
   de que la URL anterior deja de funcionar.

2. **`config/ui` es UN documento, no una colección clave/valor.** Firestore
   factura por documento leído: un documento son 105 claves por una lectura. Una
   colección de 105 documentos serían 105 lecturas cada vez que se pinta la web.
   Tope duro de Firestore: 1 MiB por documento — las 105 claves ocupan ~6 KB.

3. **`borrador: boolean` en artículos y proyectos.** Sin esto, guardar a medias
   publica a medias. El script de build filtra `borrador === true`, así que la
   administradora puede dejar un artículo a medio escribir sin que salga en la
   web. Firestore lo devuelve igualmente al panel porque la regla de lectura es
   pública — es ocultación editorial, no seguridad. Si hiciera falta que un
   borrador sea _secreto_, hay que mover la lectura a una regla con auth y el
   build tendría que autenticarse.

### 3.2 `config/ui` — forma del documento

```jsonc
{
  "sitio": {
    "nombre": "…",
    "autora": "…",
    "email": "…",
    "lugar": "…",
    "descripcion": "…",
    "ogImagen": "…",
    "idioma": "es",
  },
  "rutas": { "home": "…", "projects": "…" /* … 7 claves */ },
  "nav": {
    "cta": "Hablemos",
    "abrir": "Menú",
    "cerrar": "Cerrar",
    "items": [{ "label": "Portafolio", "to": "/projects" }],
    "drawer": [{ "label": "Inicio", "to": "/" }],
  },
  "hero": {
    "palabras": ["tu", "siguiente", "nivel", "empieza", "aquí"],
    "aria": "…",
    "copy": "…",
    "scrollCue": "…",
    "imagenAlt": "…",
  },
  "about": {
    "kicker": "…",
    "statement": ["…", "…", "…"],
    "aria": "…",
    "copy": "…",
    "cueTexto": "…",
  },
  "servicios": {/* 7 claves */},
  "contacto": {/* 5 claves */},
  "paginaContacto": {/* 7 claves + pasos[] */},
  "formulario": {/* 13 claves */},
  "portafolio": {/* 8 claves */},
  "blog": {/* 9 claves + categorias[] */},
  "footer": {/* 9 claves + enlaces[] + redes[] */},
  "notFound": {/* 4 claves */},
  "_version": 1,
}
```

`_version` permite migrar la forma del documento sin adivinar: si el esquema Zod
espera la 2 y encuentra la 1, corre una función de migración en vez de fallar.

### 3.3 Storage

```
storage/
├── articulos/{slug}/portada.webp
├── articulos/{slug}/bloques/{uuid}.webp   ← imágenes dentro del contenido
├── proyectos/{slug}/principal.webp
├── categorias/{id}.webp
└── sitio/og.webp
```

Reglas de la ruta: el path lleva el slug para que borrar un artículo sea borrar
un prefijo. El panel convierte a **WebP antes de subir** (con un `<canvas>` en el
propio webview) y guarda el original solo si pesa menos.

Topes: **5 MB por archivo**, solo `image/*`. Se aplican en las reglas de Storage
(§4.4), no solo en el panel — en una arquitectura sin servidor, las reglas son
el servidor.

### 3.4 Las imágenes de hoy y su proporción

Las proporciones no son decorativas, son el layout:

| Uso                    | Proporción             | Fuente hoy                          |
| ---------------------- | ---------------------- | ----------------------------------- |
| Proyectos              | **4:5** (1000×1250)    | `picsum.photos` — `proyectos.ts:67` |
| Categorías / servicios | **4:5** (1200×1500)    | `public/servicio-*.jpg`             |
| Portadas de blog       | **16:9** (1600×900)    | `picsum.photos` — `articulos.ts:99` |
| Retrato del Hero       | 843×1264, PNG con alfa | `public/hero-img.png`               |

El panel valida la proporción al subir (tolerancia ±3 %) y avisa antes de
guardar. `ProjectCard` usa `object-cover`, así que una imagen cuadrada no
rompería nada — pero recortaría la cabeza, que es exactamente el tipo de error
que un panel debe atrapar y no propagar a 30 fichas.

---

## 4. Reglas de seguridad

> **Simplificado.** Los topes por campo de §4.2 ya no se usan: defendían de un
> cliente admin comprometido, y el único actor no confiable real es el visitante
> anónimo. La versión vigente —estricta solo para las tres operaciones anónimas—
> está en [`fase-2-ui-dinamica.md`](./fase-2-ui-dinamica.md) §5.5. Sigue vigente
> de aquí: `esAdmin()`, `esLikeAnonimo()`, `mensajes`, Storage y el cierre
> `match /{document=**}`.

> **Esto es lo más importante del documento.** Con SDK de cliente y sin servidor
> propio, las reglas **son** el backend. La validación de Zod en el panel es
> comodidad para quien escribe; cualquiera con la `apiKey` (que va dentro del
> bundle y no es un secreto) puede hablar con Firestore directamente. Todo
> límite que importe tiene que estar **también** en las reglas.

### 4.1 Autenticación

- **Un solo método:** email + contraseña (`signInWithEmailAndPassword`).
  Nada de `signInWithPopup` — no funciona en el webview de Tauri (§6.2).
- **La cuenta se crea una vez a mano** desde la consola de Firebase.
- **No hay que "desactivar el registro".** Firebase permite que cualquiera se
  registre con email/contraseña si el proveedor está activo, pero eso solo le da
  una cuenta que **ninguna regla reconoce**: no puede leer nada privado ni
  escribir nada. El permiso no viene de estar autenticado, viene de ser _ese_ UID.
- **El UID va escrito en las reglas.** Sin Admin SDK no se pueden poner custom
  claims, y una colección `/admins/{uid}` costaría una lectura extra por cada
  escritura para resolver un dato que nunca cambia. Para un administrador único,
  la constante es la respuesta correcta.

### 4.2 `firestore.rules`

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Identidad ────────────────────────────────────────────────────────
    // Único administrador. Se sustituye por el UID real tras crear la cuenta.
    function esAdmin() {
      return request.auth != null
          && request.auth.uid == 'REEMPLAZAR_CON_UID_DEL_ADMIN';
    }

    function datos()    { return request.resource.data; }
    function anterior() { return resource.data; }

    // Claves que cambia esta escritura.
    function cambia() {
      return datos().diff(anterior()).affectedKeys();
    }

    // ── Validadores de forma ─────────────────────────────────────────────
    // Espejo de los .max() de Zod. Generados, no escritos a mano (§5.5).
    function texto(v, maxLen) {
      return v is string && v.size() > 0 && v.size() <= maxLen;
    }
    function textoOpcional(v, maxLen) {
      return v == null || (v is string && v.size() <= maxLen);
    }
    function entero(v, min, max) {
      return v is int && v >= min && v <= max;
    }
    function slugValido(s) {
      return s.matches('^[a-z0-9]+(-[a-z0-9]+)*$') && s.size() >= 3 && s.size() <= 60;
    }

    // ── config/ui y config/publicacion ───────────────────────────────────
    match /config/{doc} {
      allow read: if true;
      allow write: if esAdmin() && request.resource.data.size() <= 20;
    }

    // ── Categorías (rubros/servicios) ────────────────────────────────────
    match /categorias/{id} {
      allow read: if true;
      allow write: if esAdmin()
                   && slugValido(id)
                   && texto(datos().nombre, 18)
                   && texto(datos().kicker, 24)
                   && texto(datos().descripcion, 90)
                   && texto(datos().tagline, 40)
                   && texto(datos().detalle, 80)
                   && texto(datos().imagen, 500)
                   && entero(datos().orden, 0, 99);
    }

    // ── Catálogo de servicios ────────────────────────────────────────────
    match /catalogo/{id} {
      allow read: if true;
      allow write: if esAdmin()
                   && texto(datos().titulo, 18)
                   && texto(datos().nota, 36)
                   && datos().items is list
                   && datos().items.size() >= 1
                   && datos().items.size() <= 12;
    }

    // ── Proyectos ────────────────────────────────────────────────────────
    match /proyectos/{slug} {
      allow read: if true;
      allow write: if esAdmin()
                   && slugValido(slug)
                   && texto(datos().titulo, 40)
                   && texto(datos().categoria, 40)
                   && texto(datos().cliente, 40)
                   && entero(datos().anio, 1990, 2100)
                   && texto(datos().rol, 60)
                   && texto(datos().locacion, 40)
                   && texto(datos().resumen, 110)
                   && texto(datos().descripcion, 600)
                   && datos().etiquetas is list
                   && datos().etiquetas.size() <= 6
                   && texto(datos().imagen, 500)
                   && entero(datos().orden, 0, 999)
                   && datos().borrador is bool;
    }

    // ── Artículos ────────────────────────────────────────────────────────
    match /articulos/{slug} {
      allow read: if true;

      allow create, delete: if esAdmin() && slugValido(slug);

      // El admin edita cualquier campo MENOS likesCount: el contador es del
      // público, y dejarlo editable convierte un dato social en uno inventado.
      allow update: if (
        esAdmin()
        && !cambia().hasAny(['likesCount'])
        && texto(datos().title, 70)
        && texto(datos().excerpt, 180)
        && datos().content is list
        && datos().content.size() >= 1
        && datos().content.size() <= 120
        && texto(datos().coverImage, 500)
        && texto(datos().category, 30)
        && texto(datos().author, 40)
        && datos().publishedAt.matches('^\\d{4}-\\d{2}-\\d{2}$')
        && entero(datos().readTime, 1, 90)
        && datos().priority in ['hero', 'high', 'normal']
        && datos().tags is list
        && datos().tags.size() <= 8
        && datos().borrador is bool
      ) || esLikeAnonimo();
    }

    // Un visitante anónimo solo puede hacer una cosa a un artículo: sumarle
    // exactamente 1 al contador y NADA más. Cualquier otra clave tocada,
    // o un incremento distinto de +1, y la escritura se rechaza.
    function esLikeAnonimo() {
      return cambia().hasOnly(['likesCount'])
          && datos().likesCount == anterior().likesCount + 1;
    }

    // ── Bandeja de entrada del formulario ────────────────────────────────
    match /mensajes/{id} {
      // Cualquiera escribe (es un formulario público) pero NADIE lee salvo
      // la admin: los mensajes llevan el email de quien escribe.
      allow create: if texto(datos().nombre, 80)
                    && texto(datos().email, 120)
                    && texto(datos().oficio, 40)
                    && texto(datos().mensaje, 4000)
                    && datos().leido == false
                    && datos().keys().hasOnly(
                         ['nombre','email','oficio','mensaje','recibidoEn','leido']);
      allow read, update, delete: if esAdmin();
    }

    // ── Cierre ───────────────────────────────────────────────────────────
    // Todo lo no declarado arriba está prohibido. Sin esto, una colección
    // nueva nace abierta.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 4.3 Los likes, dicho con honestidad

La regla `esLikeAnonimo()` acota cada petición a exactamente +1, pero **no
impide que un bot haga mil peticiones**. Las opciones reales son tres:

| Opción                                                                 | Coste                                   | Qué garantiza                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| **A.** Dejar los likes en `localStorage` (como hoy, `useLikes.ts`)     | Cero                                    | Nada se puede inflar porque nada se comparte. El contador es decorativo y siempre lo fue. |
| **B.** Regla +1 + **Firebase App Check** (reCAPTCHA Enterprise en web) | ~30 min de setup, gratis hasta 10 k/mes | Solo peticiones desde el dominio real, con token verificado. Es la respuesta correcta.    |
| **C.** Regla +1 a pelo                                                 | Cero                                    | Un contador que cualquiera con `curl` puede subir a 50 000.                               |

**Recomendación: A ahora, B cuando el blog tenga tráfico que justifique el
número.** La opción C no debería existir — si el contador se puede inflar
trivialmente, es peor que no tenerlo, porque miente.

`useLikes.ts:22` ya dice que `total()` es lo único que cambia el día que haya
base de datos. Se cumple: la migración de A a B toca esa función y nada más.

### 4.4 `storage.rules`

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    function esAdmin() {
      return request.auth != null
          && request.auth.uid == 'REEMPLAZAR_CON_UID_DEL_ADMIN';
    }

    function imagenValida() {
      return request.resource.size <= 5 * 1024 * 1024
          && request.resource.contentType.matches('image/(jpeg|png|webp|avif)');
    }

    // Las imágenes las sirve la web pública → lectura abierta.
    match /{ruta=**} {
      allow read: if true;
      allow write: if esAdmin() && imagenValida();
    }
  }
}
```

### 4.5 ~~Los límites tienen que estar en dos sitios~~ — descartado

Un `.max(110)` en Zod y un `v.size() <= 110` en las reglas son el mismo número
escrito dos veces. El día que uno cambie y el otro no, el panel deja escribir
algo que Firestore rechaza — y el error que ve la administradora es
`PERMISSION_DENIED`, que no significa nada para quien escribe un resumen.

**Resuelto por la vía contraria:** los topes salieron de las reglas
(`fase-2-ui-dinamica.md` §5.5), así que no hay dos sitios que sincronizar. El
límite vive solo en el esquema, y las reglas solo comprueban lo que un anónimo
puede hacer. Se cae también el generador `generar-reglas.ts`.

---

## 5. Esquemas Zod

> **Revisado.** Los esquemas siguen siendo la fuente de autoría, pero los
> formularios del panel ya no se escriben contra ellos directamente: se compilan
> a JSON, se publican a Firestore y el panel los renderiza dinámicamente.
> Ver [`fase-2-ui-dinamica.md`](./fase-2-ui-dinamica.md). Lo de esta sección
> sigue vigente como origen de los límites; cambia quién los consume.

Viven en `packages/contenido/src/esquemas/` y los importan **los tres**
consumidores: el panel (validación de formularios + contadores), el script de
build de la web (verificar lo que baja de Firestore) y el generador de reglas.

Zod **v4** (`z.url()`, `z.iso.date()`, `.meta()`).

### 5.1 Ayudantes — el límite y su etiqueta, juntos

```typescript
// packages/contenido/src/esquemas/campo.ts
import { z } from 'zod'

/**
 * Metadatos de interfaz que viajan PEGADOS al esquema.
 *
 * El panel genera los formularios leyendo esto: no hay un segundo archivo de
 * "configuración de formularios" que pueda desincronizarse del esquema. Si un
 * campo existe, su etiqueta y su ayuda existen; si se borra, desaparecen con él.
 */
export interface MetaCampo {
  etiqueta: string
  /** Por qué existe ese límite — se muestra al pasar del 90 % del contador. */
  ayuda?: string
  /** Fuerza <textarea> en vez de <input>. */
  multilinea?: boolean
  /** Muestra el contador de caracteres. Por defecto, sí si hay .max(). */
  contador?: boolean
}

/** Texto obligatorio con tope físico y su explicación. */
export function texto(max: number, meta: MetaCampo) {
  return z
    .string()
    .trim()
    .min(1, 'No puede quedar vacío.')
    .max(max, `Máximo ${max} caracteres — ${meta.ayuda ?? 'el diseño no admite más'}.`)
    .meta(meta)
}

export function textoOpcional(max: number, meta: MetaCampo) {
  return z.string().trim().max(max).optional().meta(meta)
}

/** Slug: minúsculas, números y guiones simples. Es la URL. */
export const slug = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones.')
  .meta({ etiqueta: 'Slug (URL)', ayuda: 'cambiarlo rompe los enlaces publicados' })

/** Imagen: URL absoluta de Storage o ruta servida desde public/. */
export const imagen = z
  .union([z.url(), z.string().regex(/^\/[\w\-./]+$/)])
  .meta({ etiqueta: 'Imagen' })

/** `YYYY-MM-DD` local. El formato es contrato con lib/fechas.ts. */
export const fechaISO = z.iso
  .date()
  .meta({ etiqueta: 'Fecha de publicación', ayuda: 'formato YYYY-MM-DD' })
```

### 5.2 Entidades

```typescript
// packages/contenido/src/esquemas/articulo.ts
import { z } from 'zod'
import { texto, textoOpcional, slug, imagen, fechaISO } from './campo'

// ── Bloques de contenido ────────────────────────────────────────────────
// Reflejan 1:1 los tipos de src/data/articulos.ts:31-67. El editor del panel
// produce este árbol y ArticleContent.vue lo pinta sin cambiar una línea.

const bloqueParrafo = z.object({
  type: z.literal('paragraph'),
  text: texto(2000, { etiqueta: 'Párrafo', multilinea: true }),
})

const bloqueTitulo = z.object({
  type: z.literal('heading'),
  text: texto(100, { etiqueta: 'Subtítulo', ayuda: 'es un H2 dentro del artículo' }),
})

const bloqueCita = z.object({
  type: z.literal('quote'),
  text: texto(400, { etiqueta: 'Cita', multilinea: true }),
  cite: textoOpcional(60, { etiqueta: 'A quién se cita' }),
})

const bloqueLista = z.object({
  type: z.literal('list'),
  items: z
    .array(texto(200, { etiqueta: 'Ítem' }))
    .min(1)
    .max(20),
  ordered: z.boolean().optional().meta({ etiqueta: 'Numerada' }),
})

const bloqueCodigo = z.object({
  type: z.literal('code'),
  code: texto(4000, { etiqueta: 'Código', multilinea: true }),
  language: textoOpcional(20, {
    etiqueta: 'Lenguaje',
    ayuda: 'solo la etiqueta; no hay resaltado',
  }),
})

const bloqueImagen = z.object({
  type: z.literal('image'),
  src: imagen,
  // Obligatorio a propósito: "una imagen sin pie en un artículo es decoración"
  // (src/data/articulos.ts:60).
  caption: texto(160, { etiqueta: 'Pie de foto', ayuda: 'obligatorio' }),
})

export const bloqueContenido = z.discriminatedUnion('type', [
  bloqueParrafo,
  bloqueTitulo,
  bloqueCita,
  bloqueLista,
  bloqueCodigo,
  bloqueImagen,
])

// ── Artículo ────────────────────────────────────────────────────────────

export const prioridadArticulo = z.enum(['hero', 'high', 'normal'])

export const articulo = z.object({
  slug,
  title: texto(70, {
    etiqueta: 'Título',
    ayuda: 'a partir de 70 ocupa cuatro líneas en la tarjeta destacada',
  }),
  excerpt: texto(180, {
    etiqueta: 'Entradilla',
    ayuda: 'el listado la recorta a dos líneas ~170; por encima se corta a mitad de frase',
    multilinea: true,
  }),
  content: z.array(bloqueContenido).min(1).max(120),
  coverImage: imagen,
  category: texto(30, { etiqueta: 'Categoría' }),
  author: texto(40, { etiqueta: 'Autora' }),
  publishedAt: fechaISO,
  readTime: z.int().min(1).max(90).meta({ etiqueta: 'Minutos de lectura' }),
  likesCount: z.int().min(0).readonly().meta({ etiqueta: 'Likes', ayuda: 'lo escribe el público' }),
  priority: prioridadArticulo.meta({ etiqueta: 'Jerarquía' }),
  tags: z.array(texto(24, { etiqueta: 'Etiqueta' })).max(8),
  borrador: z.boolean().meta({ etiqueta: 'Borrador', ayuda: 'los borradores no salen publicados' }),
})

export type Articulo = z.infer<typeof articulo>
```

```typescript
// packages/contenido/src/esquemas/proyecto.ts
import { z } from 'zod'
import { texto, slug, imagen } from './campo'

export const proyecto = z.object({
  slug,
  titulo: texto(40, { etiqueta: 'Título' }),
  categoria: texto(40, { etiqueta: 'Rubro' }),
  cliente: texto(40, { etiqueta: 'Cliente' }),
  anio: z
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 1)
    .meta({ etiqueta: 'Año' }),
  rol: texto(60, { etiqueta: 'Rol' }),
  locacion: texto(40, { etiqueta: 'Locación' }),
  resumen: texto(110, {
    etiqueta: 'Resumen',
    ayuda: 'la ficha del grid lo recorta a dos líneas (~112)',
    multilinea: true,
  }),
  descripcion: texto(600, {
    etiqueta: 'Descripción',
    ayuda: 'por encima de 600 el modal pide scroll y deja de leerse como ficha',
    multilinea: true,
  }),
  etiquetas: z.array(texto(24, { etiqueta: 'Etiqueta' })).max(6),
  imagen,
  orden: z.int().min(0).max(999).meta({ etiqueta: 'Orden' }),
  borrador: z.boolean(),
})

export const categoria = z.object({
  id: slug,
  nombre: texto(18, { etiqueta: 'Nombre', ayuda: 'es el titular de la diapositiva de Servicios' }),
  kicker: texto(24, { etiqueta: 'Kicker', ayuda: 'va en versalitas con 0.3em de interletraje' }),
  descripcion: texto(90, { etiqueta: 'Descripción', ayuda: 'se revela al hover de la tarjeta' }),
  tagline: texto(40, { etiqueta: 'Tagline' }),
  detalle: texto(80, { etiqueta: 'Detalle' }),
  imagen,
  orden: z.int().min(0).max(99).meta({ etiqueta: 'Orden', ayuda: 'el orden es jerarquía' }),
})

export const grupoCatalogo = z.object({
  id: slug,
  titulo: texto(18, { etiqueta: 'Título' }),
  nota: texto(36, { etiqueta: 'Nota' }),
  items: z
    .array(
      z.object({
        nombre: texto(40, { etiqueta: 'Servicio' }),
        descripcion: texto(110, { etiqueta: 'Qué incluye', multilinea: true }),
      }),
    )
    .min(1)
    .max(12),
})
```

### 5.3 Micro-copys — donde viven los límites duros

```typescript
// packages/contenido/src/esquemas/ui.ts
import { z } from 'zod'
import { texto, textoOpcional, imagen } from './campo'

// Las 6 rutas que existen. Un `to` libre produce enlaces rotos que el 404 no
// delata hasta que alguien los pulsa (§2.4).
const destino = z.enum(['/', '/projects', '/blog', '/contact', '/#about', '/#process'])

const enlaceNav = z.object({
  label: texto(14, { etiqueta: 'Texto' }),
  to: destino.meta({ etiqueta: 'Destino' }),
})

export const ui = z.object({
  sitio: z.object({
    nombre: texto(40, { etiqueta: 'Nombre del sitio' }),
    autora: texto(40, { etiqueta: 'Autora' }),
    email: z.email().max(60).meta({
      etiqueta: 'Email de contacto',
      ayuda: 'se pinta gigante en el footer; por encima de 40 se parte en dos líneas',
    }),
    lugar: texto(48, { etiqueta: 'Desde dónde trabajas' }),
    descripcion: texto(160, {
      etiqueta: 'Meta descripción',
      ayuda: 'Google corta en 160',
      multilinea: true,
    }),
    ogImagen: imagen,
    idioma: texto(5, { etiqueta: 'Idioma' }),
  }),

  rutas: z.object({
    home: texto(70, { etiqueta: 'Inicio', ayuda: 'Google corta los títulos en 70' }),
    projects: texto(70, { etiqueta: 'Portafolio' }),
    projectDetail: texto(70, { etiqueta: 'Detalle de proyecto' }),
    contact: texto(70, { etiqueta: 'Contacto' }),
    blog: texto(70, { etiqueta: 'Blog' }),
    blogPost: texto(70, { etiqueta: 'Artículo' }),
    notFound: texto(70, { etiqueta: '404' }),
  }),

  nav: z.object({
    cta: texto(18, {
      etiqueta: 'Botón principal',
      ayuda: 'el letter-swap escalona 30 ms por letra; a 18 la animación dura medio segundo',
    }),
    abrir: texto(12, { etiqueta: 'Abrir menú' }),
    cerrar: texto(12, { etiqueta: 'Cerrar menú' }),
    logoAria: texto(60, { etiqueta: 'Etiqueta accesible del logo' }),
    items: z
      .array(enlaceNav)
      .min(2)
      .max(4)
      // A 768 px los tres ítems comparten fila con el logo y el CTA.
      .refine(
        (xs) => xs.reduce((n, x) => n + x.label.length, 0) <= 38,
        'Los textos suman más de 38 caracteres: en tablet el botón "Hablemos" se sale de la barra.',
      ),
    // El `index` editorial (01, 02…) NO se escribe: se genera al ordenar.
    drawer: z.array(enlaceNav).min(3).max(7),
  }),

  hero: z.object({
    // EXACTAMENTE cinco. El template aplica sangrías distintas por índice
    // (HeroSection.vue): una sexta palabra no es copy, es rediseñar el Hero.
    palabras: z
      .tuple([
        texto(12, { etiqueta: 'Palabra 1' }),
        texto(12, { etiqueta: 'Palabra 2' }),
        texto(12, { etiqueta: 'Palabra 3' }),
        texto(12, { etiqueta: 'Palabra 4' }),
        texto(10, {
          etiqueta: 'Palabra acentuada',
          ayuda: 'va en cursiva UV y es la que más sangra',
        }),
      ])
      .meta({ etiqueta: 'Titular (5 palabras, una por línea)' }),
    aria: texto(90, { etiqueta: 'Frase completa para lectores de pantalla' }),
    copy: texto(90, {
      etiqueta: 'Copy inferior',
      multilinea: true,
      ayuda: 'caja de 20rem a text-sm: ~45 caracteres por línea, dos líneas',
    }),
    scrollCue: texto(28, { etiqueta: 'Aviso de scroll' }),
    imagenAlt: texto(120, { etiqueta: 'Alt del retrato' }),
  }),

  about: z.object({
    kicker: texto(24, {
      etiqueta: 'Kicker',
      ayuda: 'a 0.3em de interletraje, 24 caracteres ya rozan el borde en móvil',
    }),
    statement: z.tuple([
      texto(14, { etiqueta: 'Línea 1' }),
      texto(11, { etiqueta: 'Línea 2', ayuda: 'esta línea sangra 16vw, cabe menos' }),
      texto(13, { etiqueta: 'Línea 3 (acentuada)' }),
    ]),
    aria: texto(90, { etiqueta: 'Frase para lectores de pantalla' }),
    copy: texto(150, { etiqueta: 'Frase de apoyo', multilinea: true }),
    cueTexto: texto(24, {
      etiqueta: 'Texto del badge circular',
      ayuda: 'se repite para cerrar la vuelta; si no divide la circunferencia, se solapa',
    }),
  }),

  contacto: z
    .object({
      arcoTitulo: texto(26, { etiqueta: 'Titular del arco' }),
      arcoAcento: texto(10, { etiqueta: 'Palabra acentuada' }),
      statement: texto(60, { etiqueta: 'Frase principal' }),
      statementAcento: texto(20, { etiqueta: 'Palabra acentuada' }),
      frase: texto(160, {
        etiqueta: 'Frase de contacto',
        multilinea: true,
        ayuda: 'admite {email} y {lugar}',
      }),
    })
    // EL LÍMITE MÁS DURO DE LA WEB. La curva mide ~1859 unidades y el texto va a
    // 145px en Fraunces semibold (avance medio ~0.355em): entran ~34 caracteres.
    // A 35 las letras de los extremos quedan volcadas e ilegibles, y no hay
    // palanca de tamaño — solo partir la frase en dos renglones, que es rediseño.
    .refine((c) => `${c.arcoTitulo} ${c.arcoAcento}`.length <= 34, {
      path: ['arcoTitulo'],
      message: 'El titular y el acento suman más de 34 caracteres: no caben en el arco.',
    }),

  servicios: z.object({
    kicker: texto(24, { etiqueta: 'Kicker' }),
    bajada: texto(70, { etiqueta: 'Bajada' }),
    cta: texto(22, { etiqueta: 'Botón del catálogo' }),
    modalEyebrow: texto(30, { etiqueta: 'Eyebrow del modal' }),
    modalTitulo: texto(40, { etiqueta: 'Título del modal' }),
    modalCierre: texto(140, { etiqueta: 'Cierre del catálogo', multilinea: true }),
    modalCierreEnlace: texto(50, { etiqueta: 'Texto del enlace del cierre' }),
  }),

  paginaContacto: z.object({
    kicker: texto(24, { etiqueta: 'Kicker' }),
    titulo: z.tuple([
      texto(16, { etiqueta: 'Línea 1' }),
      texto(16, { etiqueta: 'Línea 2 (cursiva)' }),
    ]),
    bajada: texto(180, { etiqueta: 'Bajada', multilinea: true }),
    comoFunciona: texto(24, { etiqueta: 'Título de "Cómo funciona"' }),
    directo: texto(24, { etiqueta: 'Título de "O directo"' }),
    fraseLugar: texto(120, { etiqueta: 'Frase de disponibilidad', ayuda: 'admite {lugar}' }),
    // El índice 01/02/03 se genera al ordenar, no se escribe.
    pasos: z
      .array(
        z.object({
          titulo: texto(28, { etiqueta: 'Paso' }),
          detalle: texto(120, { etiqueta: 'Detalle', multilinea: true }),
        }),
      )
      .min(2)
      .max(5),
  }),

  formulario: z.object({
    nombreLabel: texto(30, { etiqueta: 'Etiqueta · nombre' }),
    nombrePlaceholder: texto(40, { etiqueta: 'Placeholder · nombre' }),
    emailLabel: texto(30, { etiqueta: 'Etiqueta · email' }),
    emailPlaceholder: texto(40, { etiqueta: 'Placeholder · email' }),
    oficioLabel: texto(30, { etiqueta: 'Etiqueta · oficio' }),
    oficioOtra: texto(24, { etiqueta: 'Opción "otra cosa"' }),
    mensajeLabel: texto(30, { etiqueta: 'Etiqueta · mensaje' }),
    mensajePlaceholder: texto(60, { etiqueta: 'Placeholder · mensaje' }),
    errorNombre: texto(90, { etiqueta: 'Error · falta el nombre' }),
    errorEmailVacio: texto(90, { etiqueta: 'Error · falta el email' }),
    errorEmailFormato: texto(90, { etiqueta: 'Error · email mal escrito' }),
    errorOficio: texto(90, { etiqueta: 'Error · falta el oficio' }),
    errorMensaje: texto(90, { etiqueta: 'Error · mensaje demasiado corto' }),
  }),

  portafolio: z.object({
    kicker: texto(24, { etiqueta: 'Kicker' }),
    titulo: z.tuple([texto(16, { etiqueta: 'Línea 1' }), texto(16, { etiqueta: 'Línea 2' })]),
    bajada: texto(200, { etiqueta: 'Bajada', multilinea: true }),
    estadoTodos: texto(28, { etiqueta: 'Estado sin filtro' }),
    estadoFiltrado: texto(28, { etiqueta: 'Estado con filtro', ayuda: 'admite {rubro}' }),
    ctaVerTodo: texto(22, { etiqueta: 'Botón · quitar filtro' }),
    ctaMasLote: texto(30, { etiqueta: 'Botón · ver más', ayuda: 'admite {n}' }),
    lote: z
      .int()
      .min(3)
      .max(12)
      // La retícula es de 3 columnas: con otro número queda media fila coja.
      .refine((n) => n % 3 === 0, 'Tiene que ser múltiplo de 3 (la retícula tiene 3 columnas).')
      .meta({ etiqueta: 'Proyectos por lote' }),
  }),

  blog: z.object({
    kicker: texto(24, { etiqueta: 'Kicker' }),
    titulo: z.tuple([texto(16, { etiqueta: 'Línea 1' }), texto(16, { etiqueta: 'Línea 2' })]),
    bajada: texto(200, { etiqueta: 'Bajada', multilinea: true }),
    vacioTitulo: texto(40, { etiqueta: 'Sin resultados · título' }),
    vacioDetalle: texto(140, { etiqueta: 'Sin resultados · detalle' }),
    ctaVerTodo: texto(22, { etiqueta: 'Botón · limpiar filtros' }),
    ctaVolver: texto(22, { etiqueta: 'Botón · volver al blog' }),
    diasReciente: z.int().min(1).max(30).meta({ etiqueta: 'Días que un artículo es "nuevo"' }),
    diasArchivo: z.int().min(30).max(3650).meta({ etiqueta: 'Días hasta considerarlo archivo' }),
    categorias: z
      .array(texto(30, { etiqueta: 'Categoría' }))
      .min(2)
      .max(10),
  }),

  footer: z.object({
    kicker: texto(24, { etiqueta: 'Kicker' }),
    cta: texto(18, { etiqueta: 'Botón' }),
    colNavegacion: texto(20, { etiqueta: 'Columna · navegación' }),
    colRedes: texto(20, { etiqueta: 'Columna · redes' }),
    colEstudio: texto(20, { etiqueta: 'Columna · estudio' }),
    estudioTexto: texto(120, { etiqueta: 'Texto de disponibilidad', multilinea: true }),
    estudioDestacado: texto(24, { etiqueta: 'Palabra destacada' }),
    volverArriba: texto(24, { etiqueta: 'Volver arriba' }),
    copyright: texto(120, { etiqueta: 'Copyright', ayuda: 'admite {año} y {autora}' }),
    enlaces: z
      .array(
        z.object({
          label: texto(18, { etiqueta: 'Texto' }),
          to: destino,
        }),
      )
      .min(2)
      .max(10),
    redes: z
      .array(
        z.object({
          label: texto(20, { etiqueta: 'Red' }),
          href: z.url().meta({ etiqueta: 'Enlace', ayuda: 'hoy las tres apuntan a "#"' }),
        }),
      )
      .max(6),
  }),

  notFound: z.object({
    kicker: texto(12, { etiqueta: 'Kicker' }),
    titulo: texto(40, { etiqueta: 'Título' }),
    copy: texto(140, { etiqueta: 'Texto' }),
    cta: texto(22, { etiqueta: 'Botón' }),
  }),

  _version: z.literal(1),
})

export type UI = z.infer<typeof ui>
```

### 5.4 Reglas de colección

Hay tres invariantes que ningún documento puede validar por sí solo, porque
dependen de los demás. Se comprueban al **guardar** y al **publicar**:

```typescript
// packages/contenido/src/esquemas/coleccion.ts
import { z } from 'zod'
import { articulo } from './articulo'
import { proyecto } from './proyecto'

/** Exactamente un artículo `hero`: es la pieza grande de la portada del blog. */
export const coleccionArticulos = z.array(articulo).superRefine((xs, ctx) => {
  const heroes = xs.filter((a) => a.priority === 'hero' && !a.borrador)
  if (heroes.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      message:
        heroes.length === 0
          ? 'Ningún artículo está marcado como destacado: la portada del blog se queda sin pieza grande.'
          : `Hay ${heroes.length} artículos destacados; solo puede haber uno.`,
    })
  }
  const slugs = new Set<string>()
  for (const a of xs) {
    if (slugs.has(a.slug)) {
      ctx.addIssue({ code: 'custom', message: `Slug repetido: ${a.slug}` })
    }
    slugs.add(a.slug)
  }
})

/** Todo proyecto apunta a un rubro que existe. */
export function validarReferencias(proyectos: z.infer<typeof proyecto>[], idsCategorias: string[]) {
  const validos = new Set(idsCategorias)
  return proyectos
    .filter((p) => !validos.has(p.categoria))
    .map((p) => `"${p.titulo}" apunta al rubro "${p.categoria}", que no existe.`)
}

/** No se puede borrar una categoría de blog que algún artículo usa. */
export function categoriasEnUso(articulos: z.infer<typeof articulo>[], categorias: string[]) {
  const usadas = new Set(articulos.map((a) => a.category))
  return categorias.filter((c) => usadas.has(c))
}
```

La tercera —**borrar un rubro deja 10 proyectos huérfanos**— se resuelve en la
interfaz: el panel no ofrece borrar una categoría con proyectos, ofrece
reasignarlos primero.

### 5.5 Del esquema a las reglas

```typescript
// packages/contenido/scripts/generar-reglas.ts
//
// Lee los .max() de los esquemas y escribe firestore.rules. Los límites viven
// en UN sitio: si Zod dice 110, la regla dice 110. Corre en el prebuild y en CI,
// y falla si el archivo generado difiere del comiteado.

import { z } from 'zod'
import { proyecto } from '../src/esquemas/proyecto'

function topes(esquema: z.ZodObject): Record<string, number> {
  const salida: Record<string, number> = {}
  for (const [clave, campo] of Object.entries(esquema.shape)) {
    const base = campo instanceof z.ZodOptional ? campo.unwrap() : campo
    if (base instanceof z.ZodString && base.maxLength != null) {
      salida[clave] = base.maxLength
    }
  }
  return salida
}

// { titulo: 40, cliente: 40, rol: 60, locacion: 40, resumen: 110, ... }
console.log(topes(proyecto))
```

### 5.6 Contadores en vivo, sin repetir el número

```vue
<!-- apps/admin/src/components/CampoTexto.vue (extracto) -->
<script setup lang="ts">
import { computed } from 'vue'
import { z } from 'zod'

const props = defineProps<{ esquema: z.ZodString; modelValue: string }>()

// El tope y su etiqueta salen del esquema. No hay un 110 escrito aquí que
// pueda quedarse viejo cuando el esquema cambie a 120.
const tope = computed(() => props.esquema.maxLength ?? Infinity)
const meta = computed(() => props.esquema.meta() ?? {})
const usados = computed(() => props.modelValue.length)
const restantes = computed(() => tope.value - usados.value)

// Tres estados: normal, aviso al 90 %, error pasado el tope.
const estado = computed(() =>
  restantes.value < 0 ? 'error' : usados.value / tope.value >= 0.9 ? 'aviso' : 'ok',
)
</script>
```

En estado `aviso` el contador muestra la `ayuda` del campo — el momento en que
alguien está a punto de pasarse es justo cuando sirve saber _por qué_ hay un
tope. Un `max 26` a secas parece arbitrario; "no caben más en el arco" no.

---

## 6. La app de escritorio (Tauri 2)

### 6.1 Dónde vive el código

```
princess-portfolio/                 ← el repo actual, convertido en workspace
├── package.json                    ← { "workspaces": ["apps/*", "packages/*"] }
├── apps/
│   ├── web/                        ← TODO el proyecto actual, movido tal cual
│   │   ├── src/ … vite.config.ts … index.html
│   │   └── scripts/bajar-contenido.ts   ← prebuild: Firestore → src/data/contenido.json
│   └── admin/
│       ├── src-tauri/              ← Rust: config, iconos, bundler
│       │   ├── tauri.conf.json
│       │   └── Cargo.toml
│       └── src/                    ← Vue 3 + Vite (mismo stack que la web)
│           ├── vistas/             ← Login · Configuración · Blog · Portafolio · Bandeja
│           ├── componentes/        ← CampoTexto, EditorBloques, SubidorImagen…
│           └── firebase.ts
├── packages/
│   └── contenido/                  ← EL PAQUETE COMPARTIDO
│       ├── src/esquemas/           ← §5 — la única fuente de los límites
│       ├── src/repositorios/       ← leerArticulos(), guardarProyecto()…
│       ├── src/firebase.ts         ← initializeApp compartido
│       └── scripts/generar-reglas.ts
├── firebase/
│   ├── firestore.rules             ← GENERADO — no se edita a mano
│   ├── storage.rules
│   └── firebase.json
└── docs/
```

`apps/web` no cambia por dentro: mismo `vite.config.ts`, mismo alias `@/*`,
mismo Tailwind v4, mismos componentes. Solo gana un paso de prebuild y una
dependencia (`@princess/contenido`).

**Por qué monorepo y no dos repos:** los esquemas Zod son el contrato entre las
dos apps _y_ la fuente de las reglas de seguridad. Copiados en dos repos, el
día que un `.max()` cambie en uno y no en el otro, el panel deja escribir algo
que Firestore rechaza con `PERMISSION_DENIED` — un error que no le dice nada a
quien está escribiendo una entradilla.

### 6.2 Las dos trampas de Firebase en un webview de Tauri

Ninguna es grave; las dos son invisibles hasta que muerden.

**1. `signInWithPopup` no funciona.** El webview sirve desde un esquema propio
(`tauri://localhost` en Linux/macOS, `http://tauri.localhost` en Windows) que no
es un origen válido para el flujo OAuth de Firebase. No hay arreglo limpio.
→ **Usar `signInWithEmailAndPassword`**, que es exactamente lo que pide un
administrador único. La restricción y el requisito coinciden.

**2. La CSP de Tauri bloquea Firestore por defecto.** Hay que declararlo:

```jsonc
// apps/admin/src-tauri/tauri.conf.json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; \
              connect-src 'self' https://*.googleapis.com https://*.firebaseio.com \
                          wss://*.firebaseio.com https://firebasestorage.googleapis.com; \
              img-src 'self' data: blob: https://firebasestorage.googleapis.com https://picsum.photos; \
              style-src 'self' 'unsafe-inline'",
    },
  },
}
```

Sin `connect-src`, Firestore falla en silencio con un error de red genérico y se
pierden horas buscándolo en el sitio equivocado.

**Y una cosa que parece una trampa y no lo es:** la `apiKey` de Firebase va
dentro del bundle del panel, en texto plano. Es correcto — una apiKey web de
Firebase es un identificador de proyecto, no una credencial. Lo que protege los
datos son las reglas (§4). Quien extraiga la clave del `.deb` puede hablar con
Firestore exactamente igual que el navegador de cualquier visitante: leer lo
público y nada más.

### 6.3 Las pantallas

| #   | Pantalla                 | Qué hace                                                                                                                                                |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Login**                | Email + contraseña. Sesión persistida (`browserLocalPersistence`). Único camino al resto.                                                               |
| 2   | **Panel**                | Estado del contenido: cuántos borradores, si hay cambios sin publicar, cuándo fue el último build. Botón **Publicar**.                                  |
| 3   | **Configuración global** | Las 105 claves de micro-copy, agrupadas por sección, con contador en vivo y la `ayuda` del esquema al 90 %. Formularios **generados** desde Zod (§5.6). |
| 4   | **Blog · listado**       | Tabla ordenada por fecha, con badge de borrador y de destacado.                                                                                         |
| 5   | **Blog · editor**        | Metadatos arriba, editor de bloques abajo: añadir / reordenar (drag) / borrar, seis tipos, vista previa con los estilos reales de `ArticleContent`.     |
| 6   | **Portafolio · listado** | Retícula con filtro por rubro. Reordenar arrastrando escribe el campo `orden`.                                                                          |
| 7   | **Portafolio · editor**  | Ficha completa + subida de imagen con validación de proporción 4:5.                                                                                     |
| 8   | **Rubros y catálogo**    | Los 3 rubros y sus 18 ítems de catálogo. Borrar un rubro con proyectos ofrece reasignarlos, no lo permite a secas.                                      |
| 9   | **Bandeja**              | Mensajes del formulario, marcar leído, responder abre el cliente de correo.                                                                             |

**Vista previa (pantallas 3, 5 y 7):** no se reimplementa el diseño de la web.
Los componentes de `apps/web/src/components` se importan directamente en el
panel — mismo Vue, mismo Tailwind v4, mismos tokens. La previa **es** la web.

### 6.4 Publicar

```
[Guardar]  → escribe en Firestore. La web publicada no cambia.
[Publicar] → 1. valida la colección entera (§5.4)
             2. POST al build hook de Netlify
             3. escribe config/publicacion.ultimaPublicacion
             4. muestra el progreso del build (~60-90 s)
```

Separar "guardar" de "publicar" es lo que hace utilizable el modo borrador: se
puede dejar un artículo a medias el martes y publicarlo el viernes junto con
tres cambios de copy, en un solo build.

---

## 7. Hoja de ruta

Once pasos. Cada uno deja el repo en un estado que compila y que se puede
enseñar; ninguno depende de que el siguiente exista.

### Paso 0 · Firebase, a mano en la consola — _~30 min_

1. Crear proyecto `princess-portfolio`.
2. Firestore en modo producción, región `us-central1` (la más barata y la más
   cerca de Honduras).
3. Authentication → activar **Email/Contraseña**. Crear la cuenta de la
   administradora. **Copiar el UID.**
4. Storage → activar.
5. Registrar una app web → copiar el `firebaseConfig`.

**Hecho cuando:** existe el UID y el `firebaseConfig` está en un `.env` local.

### Paso 1 · Monorepo — _~2 h_

Mover el proyecto a `apps/web/` y crear `packages/contenido/`. Es un
`git mv` grande y un `package.json` con `workspaces`. Nada de lógica.

**Hecho cuando:** `npm run dev -w apps/web` levanta la web idéntica a hoy y
`npm run build -w apps/web` pasa `vue-tsc` sin un solo error nuevo.

> Este paso es el único difícil de deshacer. Va primero a propósito: si algo va
> a doler, que duela cuando no hay nada construido encima.

### Paso 2 · Esquemas Zod — _~4 h_

Escribir `packages/contenido/src/esquemas/` completo (§5) y, con él,
**validar los datos que ya existen**: un script que corre `articulo.parse()` y
`proyecto.parse()` sobre los 42 registros de `src/data/`.

**Hecho cuando:** los 42 registros pasan. Si alguno falla, el límite está mal
puesto y se corrige _antes_ de que haya un panel que lo imponga.

> Es el paso que más valor da por hora: convierte los límites de este documento
> en algo ejecutable, y los contrasta contra contenido real en vez de contra
> una estimación.

### Paso 3 · Reglas de seguridad — _~2 h_

`firestore.rules` + `storage.rules` escritas a mano — son cortas y estables
(`fase-2-ui-dinamica.md` §5.5) — + **tests con el emulador**
(`@firebase/rules-unit-testing`): un anónimo no escribe contenido, el admin sí,
un like suma exactamente 1 y no toca ninguna otra clave, un mensaje con un
campo de más se rechaza.

**Hecho cuando:** la suite del emulador pasa en verde y las reglas están
desplegadas.

> Antes de subir un solo dato real. Una base de datos que nace abierta y "ya la
> cerramos luego" es una base de datos abierta.

### Paso 4 · Semilla — _~2 h_

Script que lee `src/data/articulos.ts` y `proyectos.ts`, valida con Zod, y
escribe las 5 colecciones autenticado como la admin. Idempotente: el slug es el
ID, así que volver a correrlo sobrescribe en vez de duplicar.

**Hecho cuando:** Firestore tiene 12 artículos, 30 proyectos, 3 rubros,
3 grupos de catálogo y el documento `config/ui` con las 105 claves extraídas de
los componentes.

### Paso 5 · La web lee de Firestore — _~4 h_

`scripts/bajar-contenido.ts` (prebuild) + sustituir los literales de los
componentes por lecturas del contenido descargado.

**Hecho cuando:** `npm run build` baja el contenido, la web se ve **idéntica**
a hoy, y cambiar una palabra en la consola de Firebase + rebuild la cambia en la
web.

> Es el paso que demuestra que todo lo anterior sirve. Hasta aquí, Fase 2 es
> infraestructura; a partir de aquí, es un CMS.

### Paso 6 · Tauri + login + actualizador — _~4 h_

Esqueleto del panel: `create-tauri-app`, CSP (§6.2), pantalla de login, sesión
persistida, y los tokens de `main.css` importados para que se vea como la web.

**Más el plugin `updater`**, que en esta arquitectura no es opcional: el panel
se publica una vez y el vocabulario nuevo tiene que poder llegar sin que nadie
instale nada a mano (`fase-2-ui-dinamica.md` §1.5). Se firma el build, se
publica un `latest.json` —vale un archivo estático servido por Netlify— y la
app se actualiza sola al abrirse.

**Hecho cuando:** `npm run tauri dev -w apps/admin` abre una ventana, entra con
email y contraseña, mantiene la sesión al reabrir, y una versión publicada con
número mayor se instala sola al arrancar.

### Paso 7 · Configuración global — _~6 h_

La pantalla 3: formularios generados desde Zod, contadores en vivo, la `ayuda`
al 90 %, guardar con validación.

**Hecho cuando:** se cambia `hero.palabras[1]` desde el panel, se publica, y la
web muestra la palabra nueva.

> Es la pantalla que más rinde: 105 claves que hoy exigen abrir cinco archivos
> `.vue` pasan a ser un formulario.

### Paso 8 · Gestor del portafolio — _~6 h_

Pantallas 6, 7 y 8: listado, ficha, subida de imágenes a Storage con conversión
a WebP y validación de proporción, reordenar arrastrando, rubros y catálogo.

**Hecho cuando:** se crea un proyecto nuevo con foto propia y sale publicado.

### Paso 9 · Gestor del blog — _~10 h_

Pantallas 4 y 5. El editor de bloques es la pieza más cara del proyecto: seis
tipos, reordenar, previa en vivo.

**Hecho cuando:** se escribe un artículo entero desde el panel, con imagen
intercalada, y se publica.

### Paso 10 · Formulario a Firestore + bandeja — _~4 h_

Reescribir `lib/contacto.ts` contra Firestore (el módulo existe exactamente para
esto, `contacto.ts:6`), añadir la pantalla 9, y retirar el formulario oculto de
Netlify de `index.html`.

**Hecho cuando:** un mensaje enviado desde `/contact` aparece en la bandeja del
panel.

> Va al final a propósito: Netlify Forms funciona hoy: moverlo es una mejora
> (bandeja propia, sin límite de 100 envíos/mes), no un arreglo. Si el tiempo se
> acaba, este paso se queda fuera sin que nada se rompa.

**Total estimado: ~50 h de trabajo efectivo**, incluidos los ajustes de
`fase-2-ui-dinamica.md` §7 (pasos 2, 2b, 3 y 6 revisados, y el paso 6b nuevo).
Los pasos 0–5 (~15 h) dejan el contenido en Firestore y la web leyéndolo; los
6–10 (~35 h) son el panel, de los cuales 12 h son el motor de formularios que
hace que no haga falta volver a publicarlo.

### Orden de ataque recomendado

```
0 → 1 → 2 → 2b → 3 → 4 → 5    ← el backend, y la web ya es dinámica
                    ↓
              6 → 6b → 7      ← el panel ya sirve para algo (micro-copys)
                    ↓
              8 → 9 → 10      ← el resto, por orden de valor
```

Después del paso 7 el proyecto ya es entregable: la web es dinámica y las 105
claves se editan desde una app nativa. Los pasos 8-10 amplían la superficie,
no la arreglan.

---

## 8. Lo que puede morder

| Riesgo                                                     | Probabilidad               | Qué hacer                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El paso 1 (monorepo) rompe rutas o el build de Netlify** | Alta                       | Netlify necesita `base = "apps/web"` en `netlify.toml`. Probar el deploy en una rama antes de mergear.                                                                                       |
| **Zod y las reglas se desincronizan**                      | Alta si se escriben a mano | Por eso las reglas se generan (§5.5) y CI falla si el archivo comiteado difiere del generado.                                                                                                |
| **Un `.max()` de este documento está mal calculado**       | Media                      | El paso 2 lo destapa: los 42 registros reales tienen que pasar. Si `descripcion` real mide 322 y el tope son 300, se ve ahí y no en producción.                                              |
| **La CSP de Tauri bloquea Firestore**                      | Alta la primera vez        | §6.2. Es la primera cosa que se configura en el paso 6.                                                                                                                                      |
| **Los likes se inflan**                                    | Baja                       | Opción A (localStorage) hasta que haya tráfico; App Check después (§4.3).                                                                                                                    |
| **Renombrar un slug rompe enlaces publicados**             | Media                      | El panel avisa antes de confirmar y ofrece dejar el anterior como redirección en `public/_redirects`.                                                                                        |
| **`picsum.photos` sigue fallando en algunas redes**        | Ya pasó                    | Al migrar a Storage desaparece. Pero el paso 4 sube las URLs de picsum tal cual: **hay que sustituir las imágenes reales en el paso 8**, no dejarlas.                                        |
| **Firestore cuesta dinero**                                | Muy baja                   | Con build-time (§1.3), las lecturas son: una por build y las del panel. El plan gratuito da 50 000/día.                                                                                      |
| **El editor de bloques se lleva el doble de las 10 h**     | Media                      | Es la pieza más cara y la última. Se puede entregar en dos tandas: primero `paragraph`/`heading`/`quote`/`list` (que cubren 54 de los 58 bloques que existen hoy), después `code` e `image`. |

---

## Anexo · Archivos que se tocan

| Archivo                                                                               | Qué le pasa                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/data/articulos.ts`                                                               | Los tipos se quedan (los usa el render); `ARTICLES` sale de `contenido.json`.                                                                                                        |
| `src/data/proyectos.ts`                                                               | Igual. `CATEGORIAS` y los helpers se mantienen.                                                                                                                                      |
| `src/lib/contacto.ts`                                                                 | Se reescribe contra Firestore (paso 10).                                                                                                                                             |
| `src/lib/fechas.ts`                                                                   | `DIAS_RECIENTE` y `DIAS_ARCHIVO` pasan a ser parámetros.                                                                                                                             |
| `src/composables/useLikes.ts`                                                         | `total()` cambia si se elige la opción B (§4.3).                                                                                                                                     |
| `src/router/index.ts`                                                                 | Los `meta.title` salen de `rutas.*`.                                                                                                                                                 |
| `index.html`                                                                          | `<title>`, `<meta description>` y el formulario oculto de Netlify.                                                                                                                   |
| `HeroSection.vue` · `AboutSection.vue` · `ServicesSection.vue` · `ContactSection.vue` | Literales → props del contenido.                                                                                                                                                     |
| `AppNavbar.vue` · `AppNavDrawer.vue` · `AppFooter.vue`                                | Ídem, más los arrays de navegación.                                                                                                                                                  |
| `BlogView.vue` · `ProjectsView.vue` · `ContactView.vue` · `NotFoundView.vue`          | Ídem.                                                                                                                                                                                |
| `ContactForm.vue`                                                                     | Labels, placeholders y los 5 mensajes de error.                                                                                                                                      |
| **Ningún componente de `ui/`**                                                        | `BaseButton`, `BaseCtaButton`, `BaseModal`, `BaseField`, `BaseSection`, `BaseContainer`, `BaseBadge`, `BaseLogo` reciben todo por props: no tienen un solo literal que parametrizar. |
