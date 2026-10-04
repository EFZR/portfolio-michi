import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue'

/**
 * R1 — SONDEO DEL TOOLCHAIN DE FFMPEG AL ARRANCAR.
 *
 * El pipeline de medios no vive en la webview: ffmpeg es un proceso del
 * sistema y la webview no puede lanzarlo. Lo lanza Rust
 * (`src-tauri/src/media/toolchain.rs`) y aquí solo se pide el informe.
 *
 * Por qué al arrancar y no en la primera subida: una foto de una cámara pesa
 * 20-40 MB. Dejar que alguien elija el archivo, espere la copia y ENTONCES
 * decirle «falta un encoder» es tirarle el tiempo a la basura por algo que se
 * sabía desde que se abrió el panel.
 *
 * Singleton a nivel de módulo, igual que `useSession`: el toolchain de la
 * máquina no cambia mientras el panel está abierto, así que se sondea una vez
 * y todas las vistas leen el mismo informe. Si el estado viviera dentro de la
 * función, cada vista lanzaría sus propios cuatro procesos.
 */

export type Severidad = 'fatal' | 'blocking' | 'degraded'

export interface Carencia {
  id: string
  severity: Severidad
  message: string
  missing: string[]
}

export interface InfoHerramienta {
  program: string
  version: string
}

export interface InformeToolchain {
  ok: boolean
  ffmpeg: InfoHerramienta | null
  ffprobe: InfoHerramienta | null
  encoders: Record<string, boolean>
  filters: Record<string, boolean>
  gaps: Carencia[]
  /** Salida cruda de ffmpeg. Al log, NUNCA a la pantalla (R10). */
  detail: string | null
  probedAt: number
  probeMs: number
  /** Cómo instalar ffmpeg en este sistema. Lo decide Rust en compilación. */
  installHint: string
}

export type EstadoSondeo = 'inactivo' | 'sondeando' | 'listo' | 'sin-nativo' | 'error'

export interface UseToolchainReturn {
  estado: Readonly<Ref<EstadoSondeo>>
  informe: Readonly<Ref<InformeToolchain | null>>
  mensaje: Readonly<Ref<string>>
  /** `false` bloquea la subida de medios: no hay con qué procesarlos. */
  puedeProcesar: ComputedRef<boolean>
  /** Carencias que hay que mostrar sí o sí: impiden algo concreto. */
  importantes: ComputedRef<Carencia[]>
  /** Carencias que solo empeoran el resultado. Van plegadas. */
  menores: ComputedRef<Carencia[]>
  /** Línea para el registro de reproducibilidad del R11. */
  firma: ComputedRef<string>
  sondear: () => Promise<void>
}

const estado = ref<EstadoSondeo>('inactivo')
const informe = ref<InformeToolchain | null>(null)
const mensaje = ref('')

let enCurso: Promise<void> | null = null

/** `true` solo dentro de la ventana de Tauri, no en un navegador normal. */
function enTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const ORDEN: Record<Severidad, number> = { fatal: 0, blocking: 1, degraded: 2 }

export function useToolchain(): UseToolchainReturn {
  /**
   * Sondea una vez. Las llamadas simultáneas comparten la misma promesa: si
   * dos vistas se montan a la vez, no se lanzan ocho procesos.
   */
  async function sondear(): Promise<void> {
    if (estado.value === 'listo' || estado.value === 'sin-nativo') return
    if (enCurso) return enCurso

    if (!enTauri()) {
      estado.value = 'sin-nativo'
      mensaje.value =
        'La preparación de imágenes y vídeos solo funciona en la app de escritorio.'
      return
    }

    estado.value = 'sondeando'
    mensaje.value = ''

    enCurso = (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        informe.value = await invoke<InformeToolchain>('probe_toolchain')
        estado.value = 'listo'
        // El detalle crudo al log y nada más: trae rutas de la máquina.
        if (informe.value.detail) console.warn('[toolchain]', informe.value.detail)
      } catch (e) {
        // Que el sondeo falle no debe tumbar el panel: editar textos, el blog y
        // la bandeja no necesitan ffmpeg. Solo se cierra la subida de medios.
        estado.value = 'error'
        mensaje.value = 'No se pudo comprobar si ffmpeg está instalado en este equipo.'
        console.warn('[toolchain]', e)
      } finally {
        enCurso = null
      }
    })()

    return enCurso
  }

  /**
   * En `sin-nativo` devuelve `false` a propósito: el frontend suelto en el
   * navegador no puede procesar nada, y es mejor que la UI lo diga que
   * dejar un botón que falla al pulsarlo.
   */
  const puedeProcesar = computed(() => estado.value === 'listo' && informe.value?.ok === true)

  const ordenadas = computed(() =>
    [...(informe.value?.gaps ?? [])].sort((a, b) => ORDEN[a.severity] - ORDEN[b.severity]),
  )
  const importantes = computed(() => ordenadas.value.filter((g) => g.severity !== 'degraded'))
  const menores = computed(() => ordenadas.value.filter((g) => g.severity === 'degraded'))

  const firma = computed(() => {
    const i = informe.value
    if (!i?.ffmpeg) return 'ffmpeg no disponible'
    return `ffmpeg ${i.ffmpeg.version} · ffprobe ${i.ffprobe?.version ?? '?'}`
  })

  return {
    estado: readonly(estado),
    informe: readonly(informe) as Readonly<Ref<InformeToolchain | null>>,
    mensaje: readonly(mensaje),
    puedeProcesar,
    importantes,
    menores,
    firma,
    sondear,
  }
}
