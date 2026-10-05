/**
 * Paleta del mapa.
 *
 * Regiones: seis familias de color de SPoint en tonos medios/pastel, asignadas
 * a mano para que ninguna región comparta familia con una vecina. Las cinco
 * regiones "ancla" (Cusco, Ica, Arequipa, Lima, Loreto) usan un tono algo más
 * intenso para que la marca se reconozca de un vistazo.
 *
 * Provincias: el pipeline (scripts/build-geo.mjs) asigna a cada provincia un
 * `tone` 0–5 mediante coloreado de grafos, así que vecinas nunca coinciden.
 */
const family = {
  purple: { soft: '#C4B8FC', mid: '#A592FA', anchor: '#9580F8' },
  orange: { soft: '#FFC9A3', mid: '#FFAE78', anchor: '#FF9A55' },
  turquoise: { soft: '#9FE3DA', mid: '#6ED3C6', anchor: '#3CC5B4' },
  blue: { soft: '#B4CCF9', mid: '#8EB2F5', anchor: '#5F8FEF' },
  green: { soft: '#B9E4C4', mid: '#97D6A8', anchor: '#7CCB92' },
  sand: { soft: '#FBDDA0', mid: '#F8CB74', anchor: '#F5B94F' },
} as const;

export const REGION_COLORS: Record<string, string> = {
  // Anclas de marca
  cusco: family.purple.anchor,
  ica: family.orange.anchor,
  arequipa: family.turquoise.anchor,
  lima: family.blue.anchor,
  loreto: family.green.anchor,
  // Norte
  tumbes: family.turquoise.soft,
  piura: family.sand.mid,
  lambayeque: family.orange.soft,
  cajamarca: family.blue.soft,
  amazonas: family.purple.soft,
  'la-libertad': family.sand.soft,
  'san-martin': family.turquoise.mid,
  ancash: family.purple.mid,
  // Centro
  huanuco: family.orange.mid,
  ucayali: family.sand.mid,
  pasco: family.turquoise.soft,
  callao: family.turquoise.mid,
  junin: family.green.soft,
  huancavelica: family.purple.soft,
  // Sur
  ayacucho: family.sand.soft,
  apurimac: family.blue.soft,
  'madre-de-dios': family.green.mid,
  puno: family.orange.soft,
  moquegua: family.purple.mid,
  tacna: family.green.soft,
};

export const regionColor = (id: string) => REGION_COLORS[id] ?? family.blue.soft;

/** Tonos de provincia (índice = `tone` generado por el pipeline). */
export const PROVINCE_TONES = [
  family.purple.soft,
  family.orange.soft,
  family.turquoise.soft,
  family.blue.soft,
  family.green.soft,
  family.sand.soft,
] as const;

export const provinceColor = (tone: number | undefined) => PROVINCE_TONES[(tone ?? 0) % PROVINCE_TONES.length];

/** Oscurece un color hex (para estado pressed y bordes de texto). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
