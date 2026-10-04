# Prompt de proyecto — Panel administrativo de normalización de medios (portafolio web)

> Pegá esto como **instrucciones del proyecto** y subí `media-asset-schema.json` como
> conocimiento. El JSON es el contrato de datos y de parámetros; esto es el de comportamiento.

---

## Contexto

Estoy construyendo un **portafolio web** y su **panel administrativo**. El panel es donde subo
las piezas (imágenes y videos), y es el que hace **toda la normalización localmente con
ffmpeg** — sin servicios de transcoding en la nube, sin `sharp`, sin librerías de imagen
nativas. ffmpeg + ffprobe y nada más.

**El destino es el navegador**: desktop y móvil, Chrome / Safari / Firefox. No hay un
dispositivo de hardware fijo al que respetarle límites de decoder.

Lo que el panel produce por cada archivo que subo:

1. varias **renditions** (formatos × tamaños) listas para servir,
2. un **poster** y un **preview loop** si es video,
3. un **placeholder** diminuto y el color dominante,
4. el **registro JSON** con la forma exacta de `media-asset-schema.json`.

## Las tres métricas que definen si esto está bien hecho

1. **Peso de transferencia.** Un portafolio que tarda en cargar no se mira. Servir 1080p a un
   teléfono es el desperdicio más grande posible.
2. **Time-to-first-paint del medio.** `faststart`, placeholder, y la imagen correcta para el
   viewport. No "cargó rápido el HTML": cuándo se ve la pieza.
3. **Cero layout shift.** El espacio se reserva antes de que baje un byte. El dato que lo hace
   posible (`intrinsic.aspectRatio`) lo produce el panel, así que es responsabilidad del panel.

Si una decisión no mejora ninguna de las tres, no va.

## Advertencia importante sobre mi experiencia previa

Vengo de trabajar en un pipeline de normalización para **digital signage sobre Raspberry Pi**
(decoder por hardware, GStreamer + `v4l2h264dec`, dos decoders 1080p concurrentes). Varias
reglas de ahí **se invierten acá**, y aplicarlas por inercia cuesta peso y calidad sin ganar
nada. Si me ves proponiendo una de estas, corregime:

| Regla de aquel pipeline                  | Acá                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| B-frames prohibidos (agrandan el DPB)    | **Se usan** (`-bf 3`). Comprimen ~10-15% mejor y a ningún navegador le molesta |
| fps capado a 30                          | **Hasta 60.** Un showreel a 60 es parte de la pieza                            |
| profile `baseline`/`main`                | **`high`.** Universal desde hace una década, comprime mejor                    |
| El pico de bitrate de 1 s era crítico    | Importa el **peso total**. Capped CRF, no CBR                                  |
| HDR: no tocar, revisión manual           | **Tone-mapear a BT.709.** Sin tone-map se ve lavado en el navegador            |
| GOP de 48 frames fijos                   | **~2 s** (`2 × fps`)                                                           |
| Un solo archivo de salida                | **Varias renditions.** Es el punto central de todo esto                        |
| Audio ausente → agregar pista silenciosa | **`-an`.** Acá pesa de gratis                                                  |

**Lo que sí sigue valiendo**, y no lo aflojes: `-movflags +faststart` (acá incluso más
importante), `yuv420p` obligatorio (Safari no reproduce 4:4:4), dimensiones pares, nunca
upscalear, nunca re-encodear lo que ya cumple, idempotencia, y fallar seguro devolviendo el
original.

## Requisitos

### R1 — Detectar el toolchain al arrancar, no en el primer archivo

Verificar `ffmpeg -encoders` al iniciar el panel: `libx264`, `libaom-av1` (o `libsvtav1`),
`libwebp`, `libvpx-vp9`, `mjpeg`, `png`, y los filtros `scale`, `zscale`, `thumbnail`. Si falta
algo, degradar con un mensaje concreto sobre qué formato no se va a poder generar. **No** fallar
en el primer upload con un error genérico: el usuario ya invirtió el tiempo de subir.

### R2 — Clasificar antes de tocar

`ffprobe` primero, decidir después. Tres resultados posibles, no dos:

1. **Ya cumple el target** → copiar sin re-encodear.
2. **Hay que derivar renditions** (el caso normal).
3. **Rechazar** con el código correcto (ver R10).

Nunca re-encodear por reflejo. Cada generación es calidad perdida, y en un portafolio eso se ve.

### R3 — Imágenes: tres formatos, un ladder de anchos

Formatos en orden de preferencia: **AVIF → WebP → JPEG**. AVIF y WebP cargan el peso de la
calidad; JPEG es sólo la red de seguridad.

Anchos: `320, 640, 960, 1280, 1600, 1920, 2560`, **sólo los ≤ el ancho del original**. Un
original de 1800 px produce hasta 1600 y ahí se corta. Techo de 2560 (cubre un slot de 1280 CSS
px en retina).

**Si la imagen tiene canal alfa, el fallback es PNG, no JPEG.** Un JPEG con transparencia la
pierde en silencio y aparece fondo negro.

Medido sobre la misma imagen de 1600×900: AVIF (libaom, crf 32) **23.1 KB** · WebP (q 80)
**40.5 KB** · JPEG (mjpeg, q:v 3, 4:2:0) **83.5 KB**.

**Dos trampas medidas, las dos cuestan plata:**

- **`-pix_fmt yuvj420p` en JPEG es obligatorio.** Sin eso el encoder `mjpeg` de ffmpeg sale en
  4:4:4 y el archivo pesa **128.9 KB en vez de 83.5 KB** — 54% más grande por un default.
- **`zscale` no adivina el espacio de entrada.** `zscale=t=bt709:m=bt709:p=bt709` sobre un PNG
  sin tags falla con `code 3074: no path between colorspaces`. Hay que declarar la entrada:
  `zscale=min=bt709:tin=iec61966-2-1:pin=bt709:m=bt709:t=iec61966-2-1:p=bt709:r=full`
  (verificado que así funciona; `iec61966-2-1` es la transferencia sRGB). Si el original SÍ
  declara su espacio, leer los tags con ffprobe y usar esos valores, no asumir.

**Todo sale sRGB.** Una imagen Display-P3 o untagged wide-gamut servida sin convertir se ve
saturada o lavada según el navegador — es el bug de color más común de la web.

Para AVIF preferí **libaom-av1** en imágenes fijas: dio 23.1 KB contra 30.3 KB de libsvtav1 para
la misma imagen (24% menos). libsvtav1 es más rápido y sirve para lotes grandes; loguea
internamente una altura redondeada a múltiplo de 8, pero **verificado: la salida queda en las
dimensiones correctas**, no deforma.

### R4 — La orientación EXIF hay que resolverla a mano

ffmpeg **no** aplica de forma confiable la orientación EXIF en imágenes fijas (en video sí, por
el display matrix). Una foto de celular puede salir rotada 90°. Hay que leer el tag, aplicar
`transpose`/`hflip`, y **medir las dimensiones ya orientadas antes de elegir el ladder** — si
no, un retrato se trata como paisaje y los anchos salen mal.

Probalo con fotos reales de celular en las cuatro orientaciones. Es el caso que más se escapa
cuando se prueba con imágenes generadas.

### R5 — Metadata: privacidad primero, autoría después

**Hay que borrar**: GPS/geolocalización (en un portafolio público revela dónde vivo o trabajo) y
números de serie de cámara. **Conviene conservar**: copyright y autoría.

Acá hay una tensión real: ffmpeg no da control fino de EXIF por tag. Lo honesto es strip total
y volver a escribir copyright/autor desde el campo `credit` del registro, que es la fuente de
verdad de todos modos. **Si en algún momento hace falta control fino de EXIF, ffmpeg no es la
herramienta y quiero que me lo digas** en vez de pelearte con él.

### R6 — Video: un fallback que siempre funciona

```
ffmpeg -i <in> \
  -c:v libx264 -preset slow -crf 21 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -bf 3 -g <2*fps> -keyint_min <2*fps> -maxrate <cap> -bufsize <2*cap> \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart -f mp4 <out.mp4>
```

Verificado end-to-end: sale High profile, level 4.1, `yuv420p`, `has_b_frames=2`, y el orden de
boxes queda `ftyp/moov/free/mdat` — faststart correcto.

- **Capped CRF, no CBR.** CRF 21 fija la calidad; `-maxrate/-bufsize` sólo ponen techo para que
  un plano caótico no dispare el peso. Un plano simple **debe** pesar poco.
- Topes por altura: 480p → 1.5M · 720p → 4M · 1080p → 8M · 1440p → 14M · 2160p → 28M.
- Ladder: `480, 720, 1080` (opcional 1440/2160), **sólo alturas ≤ la del original**.
- CRF 18 para gradientes o grano fino; 23 para contenido hablado.

**AV1/VP9 en WebM es fase 2, opcional.** Baja el peso bastante pero duplica el tiempo de encode
y la complejidad del panel. No en la primera versión. Si se agregan: el `<video>` lista
av1 → vp9 → h264, y **el mp4/h264 tiene que existir siempre**.

### R7 — El poster no se saca en el segundo 1

Usar el filtro `thumbnail`, que puntúa los frames y elige el más representativo:
`-vf thumbnail=100 -frames:v 1` (verificado funcionando). Un timestamp fijo cae en un fundido
desde negro en la mitad de las piezas con intro. Combinalo con `blackframe` si el material tiene
fundidos largos.

El poster es **una imagen más**: generalo en los tres formatos y en el ladder de anchos, porque
es lo que se ve en la galería.

Guardá el timestamp elegido (`poster.atSec`) y **si alguien lo corrige a mano
(`pickedBy: "manual"`), el re-proceso lo respeta** y no vuelve a elegir automáticamente.

### R8 — Preview loop: archivo aparte, sin audio

Clip de ~3 s, sin audio, 480p, CRF 28, objetivo menos de ~500 KB. Arranca en el frame del poster
o un poco después, nunca en el segundo 0 (suele ser negro).

**Servir el video completo para un hover en la galería es el error de performance más común en
portafolios.** Por eso es un archivo distinto.

Todo autoplay en la web va **muted** o el navegador lo bloquea; por eso el preview loop se
genera siempre sin audio.

### R9 — GIF animado → video, siempre

Un GIF de 5 MB se vuelve un mp4 de ~200 KB con mejor calidad. Es la optimización de mayor
rendimiento del pipeline entero.

`-vf scale=trunc(iw/2)*2:trunc(ih/2)*2` no es decorativo: los GIF tienen dimensiones impares con
frecuencia y H.264 con 4:2:0 las rechaza.

El registro queda `kind: "video"` con `isAnimated: true`, y el front lo renderiza
`<video autoplay muted loop playsinline>`, no `<img>`. Preservar el loop.

### R10 — Los errores tienen dueño

Cuatro categorías que **no** se mezclan:

- `toolchain_unavailable` — falta ffmpeg o un encoder. El usuario no puede corregir su archivo.
  Debería detectarse en R1, al arrancar.
- `invalid_media` — ffprobe corrió y rechazó el archivo. Mensaje accionable sobre el archivo.
- `unsupported_source` — es un medio válido pero no lo soportamos. El archivo está bien;
  nosotros no llegamos. Es distinto de `invalid_media` y el mensaje debe reflejarlo.
- `processing_failed` — ffmpeg falló sobre un archivo **ya validado**. Culpa nuestra: log alto,
  asset en `failed` para reintento, nunca descartado.

La salida cruda de ffmpeg va al log y a `error.detail`, **nunca** al mensaje del usuario: trae
rutas locales y puede traer URLs con token.

### R11 — Reproducibilidad: `pipeline.version` no es decorativa

Guardar versión del pipeline, versión de ffmpeg, cuándo se encodeó, y **las decisiones tomadas
en texto legible** (`"tone-map HDR→BT.709"`, `"ladder cortado en 1600: el original mide 1800"`,
`"JPEG con mjpeg, no mozjpeg: ~1.8x más grande"`).

Cuando suba el ladder o agregue un formato, los assets de versión anterior quedan `status:
"stale"` — existen y se sirven, pero se pueden re-derivar por lotes. Para eso el original se
archiva: **sin el original, re-derivar es imposible**, y eso tiene que ser una decisión
consciente y no un descubrimiento a los seis meses.

### R12 — El `alt` es un requisito, no un campo opcional

Un asset sin `alt` **no se publica**. Y distinguí los dos casos: `alt: ""` significa
explícitamente "imagen decorativa"; `alt` ausente significa "nadie lo escribió todavía". No los
colapses en el mismo estado.

## Invariantes que no se negocian

1. **Nunca upscalear** — imagen, video, poster, placeholder.
2. **Nunca re-encodear lo que ya cumple.**
3. **El original nunca se modifica en el lugar**, y se archiva para poder re-derivar.
4. **Idempotente**: dos corridas sobre el mismo asset dan el mismo resultado.
5. **Ante cualquier error el asset queda recuperable** (`failed`/`stale`), nunca a medio escribir.
6. **Siempre existe un fallback universal**: h264/mp4 para video, jpeg/png para imagen.
7. **`bytes` y dimensiones de cada rendition se miden del archivo producido**, no se estiman.

## Fuera de alcance

- Subida a CDN / storage: el panel produce archivos y JSON; el transporte es otro problema.
- Autenticación y permisos del panel.
- El front del portafolio en sí (pero el schema tiene que alcanzar para armarlo — ver
  `x-normalization.frontendContract`).

## Cómo quiero que trabajes

- Antes de proponer un comando de ffmpeg, decime **cuál de las tres métricas mejora**. Un flag
  sin razón se borra en la primera refactorización.
- Si algo no se puede hacer con ffmpeg a la calidad que daría una herramienta dedicada
  (mozjpeg, EXIF fino), **decilo explícitamente** y proponé la divergencia más chica. No lo
  escondas detrás de un parámetro que "queda parecido".
- Los números salen del JSON, no de tu memoria. Si vas a usar uno que no está ahí, marcalo como
  suposición.
- Si ves que estoy aplicando una regla de mi pipeline de signage que acá no corresponde,
  corregime y decime por qué.
- **Medí antes de afirmar.** Varias de las constantes de este contrato salieron de ejecutar
  ffmpeg y comparar bytes, y dos de ellas contradecían lo que yo esperaba. Si proponés un
  parámetro de calidad o peso, corré la prueba.
