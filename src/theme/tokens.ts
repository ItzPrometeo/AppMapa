/**
 * SPoint — design tokens.
 *
 * Paleta de marca ajustada para contraste AA sobre fondo claro:
 *  - El morado y el azul oscuro se usan para texto/acciones.
 *  - Naranja y turquesa son acentos (iconos, marcadores, chips), nunca texto pequeño.
 */
import { Easing } from 'react-native-reanimated';

export const colors = {
  brand: {
    purple: '#6C4CF5',
    purpleDeep: '#5236D8',
    purpleSoft: '#EFEBFF',
    orange: '#FF7A21',
    orangeSoft: '#FFF1E6',
    turquoise: '#16B8A6',
    turquoiseSoft: '#E3F7F4',
    navy: '#102A43',
  },
  background: '#F7F9FC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F3F8',
  border: '#E6E9F1',
  text: '#14213D',
  textSecondary: '#5B6478',
  textTertiary: '#8A93A6',
  onBrand: '#FFFFFF',
  star: '#FFB020',
  danger: '#E5484D',
  success: '#12A594',

  map: {
    /** Borde entre polígonos. */
    stroke: '#FFFFFF',
    /** Regiones/provincias que quedan como contexto (no seleccionadas). */
    ghost: '#DDE2EC',
    ghostStroke: '#FFFFFF',
    /** Relleno de la provincia abierta en el nivel 3. */
    provinceBase: '#F3F0FF',
    provinceBorder: '#6C4CF5',
    /** Skeleton inicial. */
    skeleton: '#E4E8F0',
    selection: '#6C4CF5',
    pressedOverlay: 'rgba(16, 42, 67, 0.12)',
  },
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, sheet: 24, pill: 999 } as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: colors.text },
  headline: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  subhead: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.text },
  overline: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors.textTertiary,
  },
} as const;

/** Sombras suaves (nunca duras): iOS usa shadow*, Android elevation, web boxShadow. */
export const shadow = {
  sm: {
    shadowColor: '#102A43',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#102A43',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#102A43',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

/**
 * Motion — todas las duraciones y curvas del mapa en un único lugar.
 * La secuencia completa de selección (highlight + espera + zoom) ronda 750 ms.
 */
export const motion = {
  easeInOutCubic: Easing.bezier(0.65, 0, 0.35, 1),
  easeOutExpo: Easing.bezier(0.16, 1, 0.3, 1),
  easeOutCubic: Easing.bezier(0.33, 1, 0.68, 1),
  /** Highlight del polígono tocado. */
  highlight: 180,
  /** Pausa entre el highlight y el inicio del zoom (spec: 100–200 ms). */
  preZoomDelay: 130,
  /** Vuelo de cámara entre niveles. */
  flight: 620,
  flightMin: 520,
  flightMax: 1100,
  /** Fade de polígonos que pasan a contexto. */
  fade: 360,
  /** Aparición de provincias (stagger por índice). */
  provinceStagger: 35,
  /** Marcadores: pausa tras el zoom y separación entre cada uno (spec: 200 / 100 ms). */
  markerDelay: 200,
  markerStagger: 100,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 160, mass: 1 },
  springBouncy: { damping: 11, stiffness: 260, mass: 0.7 },
} as const;

/** Tamaño mínimo táctil (WCAG / HIG). */
export const HIT_SLOP_MIN = 44;
