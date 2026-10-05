export const CATEGORIES = [
  'Naturaleza',
  'Cultura',
  'Historia',
  'Arqueología',
  'Aventura',
  'Gastronomía',
  'Playas',
  'Museos',
  'Bodegas',
  'Reservas naturales',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Destino turístico (generado por scripts/build-destinations.mjs). */
export type Destination = {
  id: string;
  name: string;
  region: string;
  regionId: string;
  province: string;
  provinceId: string;
  district: string | null;
  latitude: number;
  longitude: number;
  category: Category;
  /** URL de imagen; vacío ⇒ ilustración generada por categoría. */
  image: string;
  rating: number | null;
  /** 0–100, usado para ordenar, priorizar etiquetas y el indicador "Popular". */
  popularity: number;
  subtitle: string;
  summary: string;
  description: string | null;
  schedule: string | null;
  price: string | null;
  services: string[];
  tags: string[];
};
