import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { Category } from './types';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type CategoryStyle = {
  icon: IconName;
  /** Color del marcador y del icono. */
  color: string;
  /** Fondo suave para chips e ilustraciones. */
  soft: string;
  /** Segundo color del degradado de la ilustración. */
  accent: string;
};

/**
 * Cada categoría hereda una familia de la marca. El color nunca es el único
 * indicador: siempre va acompañado de icono y texto (accesibilidad).
 */
export const CATEGORY_STYLES: Record<Category, CategoryStyle> = {
  Naturaleza: { icon: 'leaf', color: '#12A594', soft: '#E3F7F4', accent: '#7CCB92' },
  Cultura: { icon: 'drama-masks', color: '#6C4CF5', soft: '#EFEBFF', accent: '#B39CFF' },
  Historia: { icon: 'castle', color: '#5236D8', soft: '#ECE8FF', accent: '#8EB2F5' },
  Arqueología: { icon: 'pillar', color: '#E8661A', soft: '#FFF1E6', accent: '#F5B94F' },
  Aventura: { icon: 'hiking', color: '#FF7A21', soft: '#FFF1E6', accent: '#FF9A55' },
  Gastronomía: { icon: 'silverware-fork-knife', color: '#D9480F', soft: '#FFEDE3', accent: '#FFB27D' },
  Playas: { icon: 'beach', color: '#1C8ED6', soft: '#E4F3FD', accent: '#6ED3C6' },
  Museos: { icon: 'bank', color: '#3D5A80', soft: '#E8EEF6', accent: '#8EB2F5' },
  Bodegas: { icon: 'glass-wine', color: '#A61E4D', soft: '#FCE8EF', accent: '#E68FAC' },
  'Reservas naturales': { icon: 'paw', color: '#2B8A3E', soft: '#E6F4EA', accent: '#16B8A6' },
};

export const categoryStyle = (c: Category) => CATEGORY_STYLES[c] ?? CATEGORY_STYLES.Naturaleza;
