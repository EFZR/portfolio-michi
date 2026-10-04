/** Lector de `.env` para los scripts de Node. Sin dependencias: son diez lineas. */
import { readFileSync } from 'node:fs'

export function readEnv(path = '.env'): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const clean = line.trim()
    if (!clean || clean.startsWith('#') || !clean.includes('=')) continue
    const i = clean.indexOf('=')
    env[clean.slice(0, i).trim()] = clean.slice(i + 1).trim()
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
