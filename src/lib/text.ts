/** Normaliza para búsquedas: minúsculas y sin tildes ("Cañete" ≈ "canete"). */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const pluralize = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Pisco, Ica · Paracas" — evita repeticiones como "Ica, Ica, Ica". */
export const formatPlace = (d: { district: string | null; province: string; region: string }) =>
  `${d.province}, ${d.region}${d.district && d.district !== d.province ? ` · ${d.district}` : ''}`;
