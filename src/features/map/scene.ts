/**
 * Valores animados que describen la "escena" del mapa. Un puñado de shared
 * values (0→1) gobierna a la vez a todos los polígonos, de modo que una
 * transición entre niveles es una coreografía de 4 números en el hilo de UI,
 * no cientos de animaciones independientes.
 *
 *   regionFocus     la región elegida se resalta y el resto del Perú se atenúa
 *   regionReveal    las provincias aparecen (stagger) sobre la región
 *   provinceFocus   la provincia elegida se resalta y sus vecinas se atenúan
 *   provinceReveal  aparece el contorno detallado de la provincia (nivel 3)
 *   regionPulse / provincePulse   "pop" de escala al seleccionar
 *   intro           carga inicial: contorno gris → regiones toman color
 */
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export type MapScene = {
  regionFocus: SharedValue<number>;
  regionReveal: SharedValue<number>;
  provinceFocus: SharedValue<number>;
  provinceReveal: SharedValue<number>;
  regionPulse: SharedValue<number>;
  provincePulse: SharedValue<number>;
  intro: SharedValue<number>;
};

export function useMapScene(): MapScene {
  const regionFocus = useSharedValue(0);
  const regionReveal = useSharedValue(0);
  const provinceFocus = useSharedValue(0);
  const provinceReveal = useSharedValue(0);
  const regionPulse = useSharedValue(0);
  const provincePulse = useSharedValue(0);
  const intro = useSharedValue(0);
  // Los shared values son referencias estables: el objeto también lo es.
  return useMemo(
    () => ({ regionFocus, regionReveal, provinceFocus, provinceReveal, regionPulse, provincePulse, intro }),
    [regionFocus, regionReveal, provinceFocus, provinceReveal, regionPulse, provincePulse, intro],
  );
}

const IS_WEB = Platform.OS === 'web';

/**
 * Props de transformación para un <G> animado.
 * - Nativo (Fabric): la prop nativa `matrix` se actualiza sin pasar por JS.
 * - Web: react-native-svg traduce `transform` a un atributo SVG.
 */
export type SvgMatrixProps = { transform?: string; matrix?: number[] };

export function svgMatrix(a: number, b: number, c: number, d: number, e: number, f: number): SvgMatrixProps {
  'worklet';
  if (IS_WEB) return { transform: `matrix(${a} ${b} ${c} ${d} ${e} ${f})` };
  return { matrix: [a, b, c, d, e, f] };
}

/**
 * Relleno animado. En web, react-native-svg ignora `fill` en texto cuando se
 * actualiza vía setNativeProps, así que se aplica como estilo CSS (que además
 * tiene prioridad sobre el atributo inicial). En nativo es la prop `fill`.
 */
export function svgFill(color: string): { fill?: string; style?: { fill: string } } {
  'worklet';
  if (IS_WEB) return { style: { fill: color } };
  return { fill: color };
}

/** Escala `s` alrededor del punto (cx, cy). */
export function scaleAbout(s: number, cx: number, cy: number): SvgMatrixProps {
  'worklet';
  return svgMatrix(s, 0, 0, s, cx * (1 - s), cy * (1 - s));
}

export function clamp01(v: number) {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Progreso local de un elemento dentro de una animación escalonada:
 * con `t` global 0→1, el elemento `i` de `n` aparece en su propia ventana.
 */
export function staggered(t: number, i: number, n: number, spread = 0.55) {
  'worklet';
  if (n <= 1) return clamp01(t);
  const window = 1 - spread;
  const start = (i / (n - 1)) * spread;
  return clamp01((t - start) / window);
}
