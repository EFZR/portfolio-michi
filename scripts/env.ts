/**
 * Lector de entorno para los scripts de Node. Sin dependencias.
 *
 * DOS FUENTES, y la precedencia importa:
 *
 *   1. el archivo `.env` de la raíz, si existe — la máquina de desarrollo
 *   2. `process.env`, que GANA — CI, Netlify, o un `VAR=x npm run ...` puntual
 *
 * Que el archivo pueda faltar no es un detalle: en Netlify NO existe (las
 * variables llegan por entorno) y un `readFileSync` sin condición tiraba el
 * build entero con un ENOENT antes de llegar a leer nada. Era el motivo por el
 * que el despliegue no podía funcionar.
 */
import { existsSync, readFileSync } from 'node:fs'

export function readEnv(path = '.env'): Record<string, string> {
  const env: Record<string, string> = {}

  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const clean = line.trim()
      if (!clean || clean.startsWith('#') || !clean.includes('=')) continue
      const i = clean.indexOf('=')
      env[clean.slice(0, i).trim()] = clean.slice(i + 1).trim()
    }
  }

  // Solo los valores con contenido: una variable exportada como cadena vacía
  // no debe tapar la del archivo.
  for (const [clave, valor] of Object.entries(process.env)) {
    if (valor !== undefined && valor !== '') env[clave] = valor
  }

  return env
}

/**
 * Pide la contrasena sin dejarla en pantalla ni en el historial del shell.
 *
 * NO se guarda en `.env` a proposito: el correo de la administradora esta
 * publicado en el pie de la web, asi que no es secreto; la contrasena si, y un
 * script que la lee de un archivo la deja en disco para siempre.
 */
export function askPassword(prompt: string): Promise<string> {
  const ENTER = ['\r', '\n']
  const CTRL_C = '\u0003'
  const BACKSPACE = '\u007f'

  return new Promise((resolve) => {
    process.stdout.write(prompt)
    const stdin = process.stdin
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let value = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ENTER.includes(ch)) {
          stdin.setRawMode?.(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(value)
        }
        if (ch === CTRL_C) {
          process.stdout.write('\n')
          process.exit(130)
        }
        value = ch === BACKSPACE ? value.slice(0, -1) : value + ch
      }
    }
    stdin.on('data', onData)
  })
}
