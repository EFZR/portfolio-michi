<script setup lang="ts">
/**
 * Logo `my Princess` como componente SVG inline.
 *
 * Decisiones clave:
 * - Ambos paths usan `fill="currentColor"` para heredar del wrapper. La letra
 *   toma el token `text-foreground` (off-black); el corazón se sobreescribe
 *   localmente con `text-primary` (Ultraviolet). Cambiar la paleta = swap de
 *   un token en `main.css`.
 * - `.logo` es `group` → habilita `group-hover` en el corazón para el
 *   heartbeat sin JS.
 * - `transform-box: fill-box` + `transform-origin: center` hacen que el
 *   `scale` del path del corazón pivote sobre SU propio centro y no sobre
 *   el origen del SVG (que estaría fuera de pantalla por el translate del `<g>`).
 * - La animación se envuelve en `@media (prefers-reduced-motion: no-preference)`
 *   → convención de accesibilidad del proyecto (ver `useWordReplicate`).
 */
interface Props {
  /** Etiqueta accesible del SVG. Sobreescríbela si el logo va dentro de un
   *  link que ya expone su propio nombre accesible. */
  ariaLabel?: string
}

withDefaults(defineProps<Props>(), {
  ariaLabel: 'my Princess',
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 567.58698 731.91956"
    role="img"
    :aria-label="ariaLabel"
    class="logo group h-full w-auto overflow-visible text-foreground"
  >
    <g transform="translate(-716.12436,-607)">
      <!--
        `.logo__mark` es el grupo que agrupa corazón + silueta. Recibe el
        `rotate` sutil en hover para el efecto "tilt". El heartbeat del
        corazón vive dentro y se compone independientemente (cada path
        tiene su propio `transform-box: fill-box`).
      -->
      <g class="logo__mark">
        <!-- Corazón (Ultraviolet). Antes era #6b0e83 hardcoded. -->
        <path
          class="logo__heart text-primary"
          fill="currentColor"
          d="m 1151.57,777.53281 c -58.095,-43.36154 -83.3869,-76.58439 -85.2942,-112.04039 -1.2762,-23.72522 5.9245,-39.48518 23.1521,-50.67248 C 1098.0376,609.22895 1106.1816,607 1118,607 c 11.9552,0 20.2292,2.30189 28.767,8.00327 6.4066,4.27816 12.6744,10.54964 15.7544,15.76374 2.3562,3.98866 2.9104,4.01888 4.4741,0.24396 2.1244,-5.12886 14.133,-15.51633 22.7115,-19.64558 7.2712,-3.49998 8.5408,-3.77994 18.9599,-4.18093 9.3069,-0.35818 12.3119,-0.082 18.0415,1.65835 23.5734,7.16021 39.7986,31.7128 37.9223,57.38563 -0.8278,11.32744 -3.0541,18.93753 -9.1485,31.27156 -13.4042,27.12832 -35.9654,49.69063 -87.1655,87.16979 -1.7508,1.28162 -3.3812,2.33021 -3.623,2.33021 -0.2419,0 -6.1476,-4.26023 -13.1237,-9.46719 z"
        />
        <!-- Silueta / "M" principal. Hereda del wrapper (text-foreground). -->
        <path
          fill="currentColor"
          d="m 766.5,1337.8988 c -10.86168,-0.892 -24.41972,-4.6039 -31.10296,-8.5153 -9.60528,-5.6214 -16.35828,-15.4331 -18.50297,-26.8835 -1.43662,-7.6701 -0.59223,-29.241 1.58536,-40.5 0.90419,-4.675 6.10197,-21.775 11.55063,-38 18.95822,-56.4537 25.16318,-91.9513 30.15289,-172.5 1.6799,-27.1185 1.69851,-118.74978 0.0277,-136.5 -4.70585,-49.99418 -9.40109,-77.14377 -25.28619,-146.21401 -14.28213,-62.10039 -17.54202,-80.91144 -18.53957,-106.98184 -0.52219,-13.64722 -0.36486,-15.99588 1.45319,-21.6933 2.68694,-8.42029 7.24476,-14.91605 13.797,-19.66335 6.70647,-4.85904 12.45491,-7.15721 23.8649,-9.54096 8.43131,-1.76146 14.85387,-1.8811 101.64304,-1.8934 101.63113,-0.0144 101.14511,-0.0399 114.51703,5.99827 18.29812,8.26259 24.46367,23.16073 22.37275,54.06041 -1.92092,28.38732 -6.51619,53.16795 -19.17331,103.39472 -19.13539,75.93421 -21.17117,87.36401 -22.41205,125.83127 -0.61425,19.04189 -0.52173,20.96264 1.09581,22.75 3.71914,4.1096 7.34901,1.96846 26.61529,-15.69947 23.82536,-21.84872 36.23826,-31.57509 54.45226,-42.66708 40.5087,-24.66895 84.1993,-37.18642 137.0299,-39.25945 45.7504,-1.79521 73.6604,6.8157 86.4078,26.65892 7.8453,12.21223 9.867,24.41737 10.9826,66.3038 1.2731,47.80084 -0.054,61.85703 -7.2345,76.60747 -5.4325,11.1601 -15.227,18.8659 -28.7966,22.6558 -5.1544,1.4396 -10.0192,1.8055 -23.5,1.7674 -28.3835,-0.08 -49.0384,-4.3002 -94.7999,-19.36818 -40.9831,-13.49461 -54.7385,-16.67318 -76.7001,-17.72364 -22.0968,-1.05692 -44.67707,3.03807 -54.00273,9.79354 -5.02968,3.64348 -8.78229,9.38962 -9.06659,13.88308 -0.44878,7.0933 0.11582,10.8358 1.98214,13.1392 1.9032,2.3489 2.02539,2.3612 24.24998,2.4391 29.9187,0.1049 45.3672,2.5474 71.6456,11.3275 45.4322,15.1797 85.4023,40.3245 123.0572,77.4142 53.8305,53.0225 84.5046,112.411 87.6581,169.716 1.7244,31.3356 -8.359,47.8551 -33.527,54.9266 -17.9114,5.0327 -21.8858,5.2668 -97.9524,5.7714 -83.1849,0.5518 -85.624,0.3673 -102.2455,-7.7371 -8.6602,-4.2225 -15.913,-11.3985 -20.033,-19.8209 l -3.2658,-6.676 0.1448,-16.5 c 0.1064,-12.1351 0.9837,-22.8489 3.3164,-40.5 5.1499,-38.9694 5.1473,-65.262 -0.01,-90 -3.3359,-16.0044 -6.8858,-26.6193 -12.9624,-38.76 -12.7846,-25.5428 -28.86291,-36.6037 -47.56966,-32.7249 -4.75706,0.9863 -6.73354,2.0402 -10.05957,5.3639 -5.8385,5.8345 -7.36069,11.637 -7.36069,28.0586 0,35.7462 7.15639,65.1433 27.28036,112.0624 12.60206,29.3818 16.06928,40.0777 17.75891,54.7838 3.60915,31.4132 -17.91525,48.2708 -65.94147,51.6445 -17.69801,1.2432 -149.38884,1.2196 -164.5978,-0.03 z"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
/**
 * `fill-box` + `center` → cada transform pivota sobre el centro del propio
 * bounding box, ignorando el translate del `<g>` raíz. Sin esto, el
 * heartbeat y el tilt "saltan" fuera del viewport.
 *
 * El corazón y el grupo padre tienen transforms independientes → el
 * navegador los compone: mark rota levemente, corazón late dentro.
 */
.logo__mark,
.logo__heart {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform;
}

.logo__mark {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.logo__heart {
  transition: transform 0.3s ease-out;
}

@media (prefers-reduced-motion: no-preference) {
  .logo:hover .logo__mark {
    /* Tilt marcado con overshoot (la cubic-bezier de arriba tiene rebote). */
    transform: rotate(-8deg);
  }

  .logo:hover .logo__heart {
    animation: heartbeat 0.9s ease-in-out infinite;
  }
}

/**
 * Curva de latido asimétrica: dos "pulsos" (sístole/diástole) por ciclo,
 * con overshoot suave — se siente orgánico, no robótico.
 */
@keyframes heartbeat {
  0%,
  100% {
    transform: scale(1);
  }
  14% {
    transform: scale(1.35);
  }
  28% {
    transform: scale(0.92);
  }
  42% {
    transform: scale(1.25);
  }
  70% {
    transform: scale(1);
  }
}
</style>
