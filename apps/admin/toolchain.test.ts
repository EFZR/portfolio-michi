/**
 * Tests del sondeo de toolchain del lado del panel (R1).
 *
 * La derivación de "falta este encoder" → "esto no vas a poder generar" está
 * probada en Rust (`src-tauri/src/media/toolchain.rs`). Aquí se prueba lo que
 * Rust no puede: que el singleton no sondee dos veces, que fuera de la app
 * nativa degrade en vez de reventar, y que el reparto entre carencias que
 * bloquean y carencias que solo molestan sea el correcto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InformeToolchain, Severidad } from './src/composables/useToolchain'

/** Lo que devolverá el `invoke` mockeado, y cuántas veces se le llamó. */
const nativo = { informe: null as InformeToolchain | null, llamadas: 0, falla: false }

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => {
    nativo.llamadas++
    if (nativo.falla) throw new Error('no such command')
    // Una espera real: sin ella las llamadas concurrentes se resolverían antes
    // de que la segunda llegue a mirar la promesa en curso, y el test de
    // deduplicación pasaría por accidente.
    await new Promise((r) => setTimeout(r, 10))
    return nativo.informe
  },
}))

/** Importa el composable fresco: es un singleton y guarda estado entre usos. */
async function cargar() {
  vi.resetModules()
  return (await import('./src/composables/useToolchain')).useToolchain()
}

function informeDe(gaps: Array<{ id: string; severity: Severidad }>): InformeToolchain {
  return {
    ok: !gaps.some((g) => g.severity === 'fatal'),
    ffmpeg: { program: 'ffmpeg', version: '9.0.1' },
    ffprobe: { program: 'ffprobe', version: '9.0.1' },
    encoders: {},
    filters: {},
    gaps: gaps.map((g) => ({ ...g, message: `fallo ${g.id}`, missing: [g.id] })),
    detail: null,
    probedAt: 0,
    probeMs: 12,
    installHint: 'instalar el paquete `ffmpeg`',
  }
}

beforeEach(() => {
  nativo.informe = informeDe([])
  nativo.llamadas = 0
  nativo.falla = false
  // Vitest corre en Node, donde no hay `window`. El composable detecta Tauri
  // por `__TAURI_INTERNALS__`, así que se finge aquí.
  ;(globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} }
})

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('fuera de la app de escritorio', () => {
  it('degrada a sin-nativo y no intenta invocar nada', async () => {
    delete (globalThis as { window?: unknown }).window
    const tc = await cargar()
    await tc.sondear()

    expect(tc.estado.value).toBe('sin-nativo')
    expect(nativo.llamadas).toBe(0)
    expect(tc.puedeProcesar.value).toBe(false)
    expect(tc.mensaje.value).toContain('app de escritorio')
  })
})

describe('sondeo', () => {
  it('un toolchain completo deja procesar y no muestra nada', async () => {
    const tc = await cargar()
    await tc.sondear()

    expect(tc.estado.value).toBe('listo')
    expect(tc.puedeProcesar.value).toBe(true)
    expect(tc.importantes.value).toEqual([])
    expect(tc.menores.value).toEqual([])
  })

  it('sondea una sola vez aunque se llame varias', async () => {
    const tc = await cargar()
    // Dos vistas montándose a la vez. Sin la promesa compartida esto lanzaría
    // ocho procesos de ffmpeg.
    await Promise.all([tc.sondear(), tc.sondear(), tc.sondear()])
    await tc.sondear()

    expect(nativo.llamadas).toBe(1)
  })

  it('si el comando nativo no existe no tumba el panel', async () => {
    nativo.falla = true
    const tc = await cargar()
    await tc.sondear()

    expect(tc.estado.value).toBe('error')
    expect(tc.puedeProcesar.value).toBe(false)
    // El mensaje es para la usuaria: sin rutas, sin nombres de comando.
    expect(tc.mensaje.value).not.toContain('no such command')
  })
})

describe('reparto de carencias', () => {
  it('fatal cierra el procesamiento', async () => {
    nativo.informe = informeDe([{ id: 'scale', severity: 'fatal' }])
    const tc = await cargar()
    await tc.sondear()

    expect(tc.puedeProcesar.value).toBe(false)
    expect(tc.importantes.value).toHaveLength(1)
  })

  it('blocking deja trabajar: falta un formato, no todos', async () => {
    nativo.informe = informeDe([{ id: 'avif', severity: 'blocking' }])
    const tc = await cargar()
    await tc.sondear()

    expect(tc.puedeProcesar.value).toBe(true)
    expect(tc.importantes.value.map((g) => g.id)).toEqual(['avif'])
    expect(tc.menores.value).toEqual([])
  })

  it('degraded va aparte para poder plegarlo', async () => {
    nativo.informe = informeDe([
      { id: 'color-management', severity: 'degraded' },
      { id: 'avif', severity: 'blocking' },
    ])
    const tc = await cargar()
    await tc.sondear()

    expect(tc.importantes.value.map((g) => g.id)).toEqual(['avif'])
    expect(tc.menores.value.map((g) => g.id)).toEqual(['color-management'])
  })

  it('ordena fatal antes de blocking antes de degraded', async () => {
    nativo.informe = informeDe([
      { id: 'c', severity: 'degraded' },
      { id: 'b', severity: 'blocking' },
      { id: 'a', severity: 'fatal' },
    ])
    const tc = await cargar()
    await tc.sondear()

    expect(tc.importantes.value.map((g) => g.id)).toEqual(['a', 'b'])
  })
})

describe('firma para el registro de reproducibilidad (R11)', () => {
  it('incluye las dos versiones', async () => {
    const tc = await cargar()
    await tc.sondear()
    expect(tc.firma.value).toBe('ffmpeg 9.0.1 · ffprobe 9.0.1')
  })

  it('sin ffmpeg lo dice en vez de inventar una versión', async () => {
    nativo.informe = { ...informeDe([]), ffmpeg: null, ffprobe: null, ok: false }
    const tc = await cargar()
    await tc.sondear()
    expect(tc.firma.value).toBe('ffmpeg no disponible')
  })
})
