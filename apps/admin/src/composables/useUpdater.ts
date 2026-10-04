import { ref, type Ref } from 'vue'

/**
 * ACTUALIZACIÓN AUTOMÁTICA DEL PANEL.
 *
 * Es la pieza que sostiene el requisito de fondo: el panel se compila una vez.
 * Cuando haya que ampliar el VOCABULARIO (un tipo de campo nuevo, un operador
 * nuevo) toca un release, y sin esto ese release significa compilar, mandar el
 * instalador y que alguien lo instale a mano. Con esto, se abre el panel y ya.
 *
 * Tauri verifica la firma del paquete contra la clave pública incrustada en el
 * binario ANTES de instalar nada. Un paquete que no venga firmado con nuestra
 * clave privada se descarta y la app sigue con la versión que tiene.
 *
 * Los módulos de Tauri se importan de forma DIFERIDA: en el navegador (`vite
 * dev` del frontend suelto, o los tests) no existe el contexto nativo, y un
 * import estático reventaría al cargar el módulo.
 */

export type EstadoActualizacion =
  | 'inactivo'
  | 'buscando'
  | 'al-dia'
  | 'disponible'
  | 'descargando'
  | 'lista'
  | 'error'
  | 'no-disponible'

export interface UseUpdaterReturn {
  estado: Ref<EstadoActualizacion>
  version: Ref<string>
  progreso: Ref<number>
  mensaje: Ref<string>
  buscar: () => Promise<void>
  instalarYReiniciar: () => Promise<void>
}

/** `true` solo dentro de la ventana de Tauri, no en un navegador normal. */
function enTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useUpdater(): UseUpdaterReturn {
  const estado = ref<EstadoActualizacion>('inactivo')
  const version = ref('')
  const progreso = ref(0)
  const mensaje = ref('')

  let pendiente: { downloadAndInstall: (cb: (e: unknown) => void) => Promise<void> } | null = null

  async function buscar(): Promise<void> {
    if (!enTauri()) {
      estado.value = 'no-disponible'
      mensaje.value = 'Las actualizaciones solo funcionan en la app de escritorio.'
      return
    }

    estado.value = 'buscando'
    mensaje.value = ''
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (!update) {
        estado.value = 'al-dia'
        return
      }
      pendiente = update as unknown as typeof pendiente
      version.value = update.version
      estado.value = 'disponible'
    } catch (e) {
      // Que no haya red, o que el endpoint no exista todavía, NO es un fallo
      // que deba molestar: el panel funciona igual con la versión que tiene.
      estado.value = 'error'
      mensaje.value = `No se pudo comprobar (${e instanceof Error ? e.message : String(e)}).`
    }
  }

  async function instalarYReiniciar(): Promise<void> {
    if (!pendiente) return
    estado.value = 'descargando'
    progreso.value = 0

    try {
      let total = 0
      let recibido = 0
      await pendiente.downloadAndInstall((evento) => {
        const e = evento as { event: string; data?: { contentLength?: number; chunkLength?: number } }
        if (e.event === 'Started') total = e.data?.contentLength ?? 0
        if (e.event === 'Progress') {
          recibido += e.data?.chunkLength ?? 0
          progreso.value = total ? Math.round((recibido / total) * 100) : 0
        }
        if (e.event === 'Finished') progreso.value = 100
      })

      estado.value = 'lista'
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      estado.value = 'error'
      mensaje.value = `Falló la instalación (${e instanceof Error ? e.message : String(e)}).`
    }
  }

  return { estado, version, progreso, mensaje, buscar, instalarYReiniciar }
}
