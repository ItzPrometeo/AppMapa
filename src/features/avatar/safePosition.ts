/**
 * findSafeAvatarPosition — dónde poner los pies del guía sin tapar información.
 *
 * Trabaja en coordenadas de PANTALLA. Recibe:
 *  - un punto preferido (ancla del nivel, lado de un marcador, ubicación…),
 *  - la "huella" del avatar (rectángulo que ocupa sobre los pies),
 *  - obstáculos: etiquetas importantes (ICA, PARACAS, NAZCA…), marcadores,
 *    tarjetas, cabecera, controles y bottom sheet,
 *  - el área permitida (zona visible del mapa) y, opcionalmente, una función
 *    que exige que los pies queden sobre tierra/dentro del polígono del nivel.
 *
 * Recorre anillos concéntricos alrededor del punto preferido (de cerca a
 * lejos) y devuelve el primer punto libre. Si no hay ninguno libre, el de
 * menor solape: el avatar nunca desaparece por falta de sitio.
 */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Point = { x: number; y: number };

export type SafePositionInput = {
  preferred: Point;
  /** Alto del avatar en pantalla (px). */
  avatarHeight: number;
  /** Ancho de la huella relativo al alto. */
  widthRatio: number;
  obstacles: Rect[];
  /** Área donde deben quedar los pies y la huella. */
  area: Rect;
  /** Restricción geográfica opcional sobre los pies (p. ej. dentro de la región). */
  accept?: (p: Point) => boolean;
  padding: number;
  stepPx: number;
  maxRadiusPx: number;
};

export function footprint(feet: Point, avatarHeight: number, widthRatio: number): Rect {
  const w = avatarHeight * widthRatio;
  return { x0: feet.x - w / 2, y0: feet.y - avatarHeight, x1: feet.x + w / 2, y1: feet.y };
}

const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

const inflate = (r: Rect, p: number): Rect => ({ x0: r.x0 - p, y0: r.y0 - p, x1: r.x1 + p, y1: r.y1 + p });

const inside = (r: Rect, area: Rect) => r.x0 >= area.x0 && r.x1 <= area.x1 && r.y0 >= area.y0 && r.y1 <= area.y1;

/** Candidatos: el preferido y anillos de 8·n puntos a radios crecientes. */
function* candidates(p: Point, step: number, maxR: number): Generator<Point> {
  yield p;
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      // Empieza hacia abajo-izquierda: prioriza posiciones bajo/junto al punto.
      const a = Math.PI * 0.75 + (i / n) * Math.PI * 2;
      yield { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    }
  }
}

export function findSafeAvatarPosition(input: SafePositionInput): Point {
  const obstacles = input.obstacles.map((o) => inflate(o, input.padding));
  let best: Point | null = null;
  let bestScore = Infinity;
  for (const c of candidates(input.preferred, input.stepPx, input.maxRadiusPx)) {
    const fp = footprint(c, input.avatarHeight, input.widthRatio);
    if (!inside(fp, input.area)) continue;
    if (input.accept && !input.accept(c)) continue;
    let overlap = 0;
    for (const o of obstacles) overlap += overlapArea(fp, o);
    if (overlap === 0) return c;
    // Penaliza levemente la distancia para preferir el solape mínimo más cercano.
    const score = overlap + Math.hypot(c.x - input.preferred.x, c.y - input.preferred.y) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ?? input.preferred;
}
