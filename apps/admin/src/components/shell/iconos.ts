/**
 * ICONOS DEL RAÍL — trazo, nunca relleno.
 *
 * Geometría mínima y `stroke-width` 1.25: en una interfaz construida a base de
 * filetes de 1px, un icono relleno pesa demasiado y rompe el gris de la página.
 * Son `d` sueltos y no componentes para que el raíl los pinte con un solo <svg>
 * y herede `currentColor` sin capas intermedias.
 */
export const ICONOS: Record<string, string> = {
  // Sumario — el índice de una revista: renglones de largo desigual.
  sumario: 'M4 6h16M4 12h11M4 18h14',
  // Configuración — reguladores.
  settings: 'M4 7h9m3 0h4M4 17h4m3 0h9M13 4v6M8 14v6',
  // Portafolio — dos encuadres solapados.
  projects: 'M4 4h11v11H4zM9 9h11v11H9',
  // Blog — página con renglones y un pliegue.
  blog: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  // Bandeja — el cajón de entrada.
  inbox: 'M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z',
}
