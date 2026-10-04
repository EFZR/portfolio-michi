/**
 * DESPLIEGA LAS REGLAS DE SEGURIDAD.
 *
 * El id del proyecto sale de `.env` (`VITE_FIREBASE_PROJECT_ID`), no de un
 * `.firebaserc` commiteado. Así hay UNA sola fuente para el id y el repo no lo
 * lleva dentro.
 *
 * Aviso para no creerse más seguro de lo que se es: el id del proyecto NO es un
 * secreto. Viaja dentro del bundle de la web (`authDomain`, `projectId`) y
 * cualquiera puede leerlo desde el navegador. Esto es orden, no protección.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function leerEnv(ruta = '.env') {
  const env = {}
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#') || !limpia.includes('=')) continue
    const i = limpia.indexOf('=')
    env[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim()
  }
  return env
}

const env = leerEnv()
const proyecto = env.VITE_FIREBASE_PROJECT_ID

if (!proyecto) {
  console.error('Falta VITE_FIREBASE_PROJECT_ID en .env. Copia .env.example y rellénalo.')
  process.exit(1)
}

// `--only` acotado a propósito: este script NO despliega hosting, funciones ni
// índices. Solo las reglas, que es lo que se revisa en este repo.
const args = ['firebase', 'deploy', '--only', 'firestore:rules,storage', '--project', proyecto]

console.log(`Desplegando reglas al proyecto "${proyecto}"…\n`)
const r = spawnSync('npx', args, { stdio: 'inherit' })
process.exit(r.status ?? 1)
