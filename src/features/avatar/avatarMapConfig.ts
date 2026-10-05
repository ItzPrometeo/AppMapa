/**
 * AVATAR_MAP_CONFIG — única fuente de tamaños, tiempos y umbrales del guía.
 *
 * Todo lo que define "cómo se siente" el avatar sobre el mapa vive aquí para
 * poder ajustarlo sin tocar la lógica. Ningún componente usa números mágicos.
 */

/** Clips del GLB (no se crean ni modifican animaciones: sólo se reproducen estas). */
export type AvatarClip =
  | 'avatar_idle'
  | 'avatar_walk'
  | 'avatar_run'
  | 'avatar_jump'
  | 'avatar_turn_left'
  | 'avatar_turn_right'
  | 'avatar_look_map'
  | 'avatar_point_destination'
  | 'avatar_take_photo'
  | 'avatar_arrive'
  | 'avatar_discover'
  | 'avatar_celebrate'
  | 'avatar_wave';

/** Clips que se repiten en bucle; el resto se reproduce una vez y se encadena. */
export const LOOPING_CLIPS: ReadonlySet<AvatarClip> = new Set(['avatar_idle', 'avatar_walk', 'avatar_run']);

/**
 * Niveles de mapa desde el punto de vista del avatar.
 * La app tiene hoy PAÍS → REGIÓN → PROVINCIA (+ destino seleccionado). El nivel
 * DISTRICT está soportado por el controlador para cuando exista ese nivel en el
 * mapa; mientras tanto la provincia es el nivel local donde el guía camina.
 */
export type AvatarMapLevel = 'COUNTRY' | 'REGION' | 'PROVINCE' | 'DISTRICT' | 'DESTINATION';

/**
 * De dónde sale la posición del avatar:
 *  MAP_ANCHOR     punto visual seguro predefinido del nivel (niveles grandes)
 *  USER_LOCATION  ubicación real, sólo cuando el nivel es lo bastante local
 *  DESTINATION    junto a un atractivo seleccionado
 *  TRANSITION     controlada temporalmente durante un zoom entre niveles
 */
export type AvatarPositionMode = 'MAP_ANCHOR' | 'USER_LOCATION' | 'DESTINATION' | 'TRANSITION';

/** Cómo se desplaza: quieto, andando, corriendo o con fundido + recolocación. */
export type AvatarMovementMode = 'IDLE' | 'WALK' | 'RUN' | 'TRANSITION';

export const AVATAR_MAP_CONFIG = {
  // ---------------------------------------------------------------------------
  // Tamaño en pantalla (independiente del zoom geográfico)
  // ---------------------------------------------------------------------------
  /** Alto mínimo del avatar en pantalla (px). Por debajo deja de leerse en móviles pequeños. */
  minHeight: 44,
  /** Alto máximo (px). Por encima empezaría a dominar el mapa en pantallas grandes. */
  maxHeight: 72,
  /**
   * Alto deseado como fracción del alto visible del mapa (pantalla menos la
   * cabecera). 0.095 ⇒ ~49 px en un iPhone SE, ~64 px en un 390×844, ~72 px en
   * pantallas grandes: siempre dentro del rango 8–11 % pedido.
   */
  preferredHeightRatio: 0.095,
  /**
   * Multiplicadores suaves por nivel sobre el tamaño anterior. Dan una pista de
   * "cercanía" sin cambiar la identidad del personaje (nunca 0.2 o 2.0).
   */
  levelScale: { COUNTRY: 0.9, REGION: 0.95, PROVINCE: 1, DISTRICT: 1, DESTINATION: 1.05 } as Record<
    AvatarMapLevel,
    number
  >,
  /** Velocidad (1/s) con la que el tamaño converge al nuevo objetivo al cambiar de nivel. */
  sizeLerpSpeed: 6,

  // ---------------------------------------------------------------------------
  // Aparición inicial (≈ 550 ms en total)
  // ---------------------------------------------------------------------------
  appear: {
    /** Pausa desde que el mapa terminó de dibujarse hasta que aparece el guía. */
    delayMs: 150,
    /** Fundido de opacidad 0 → 1. */
    fadeMs: 220,
    /** Escala inicial y "rebote" (0.75 → 1.05 → 1). */
    fromScale: 0.75,
    overshootScale: 1.05,
    overshootMs: 240,
    /** Pequeña caída vertical (px) que se asienta con un spring. */
    dropPx: 10,
  },

  // ---------------------------------------------------------------------------
  // Transición entre niveles grandes (sincronizada con el zoom de la cámara)
  // ---------------------------------------------------------------------------
  transition: {
    /** El avatar mira/señala hacia el lugar elegido durante este tiempo antes de andar. */
    pointMs: 150,
    /** Pasos visuales hacia el destino antes del salto (no recorre la región). */
    walkMs: 260,
    /** Distancia en pantalla de esos pasos (px). */
    stepsPx: 22,
    /**
     * Pausa entre el toque y el inicio del zoom al entrar en un nivel. Deja tiempo
     * a mirar + dar unos pasos; el mapa la usa como preZoomDelay.
     */
    zoomStartDelayMs: 380,
    /** Progreso del zoom (0–1) en que empieza a desvanecerse. */
    zoomFadeStart: 0.1,
    /** Progreso del zoom en que ya es invisible. */
    zoomFadeEnd: 0.45,
    /** Progreso del zoom en que se recoloca (invisible) en el ancla del nuevo nivel. */
    repositionAt: 0.6,
    /** Progreso en que empieza a reaparecer y en que vuelve a ser opaco. */
    zoomFadeInStart: 0.7,
    zoomFadeInEnd: 1,
    /**
     * Si el zoom hacia el nuevo nivel es ≤ esta proporción (k final / k actual) y
     * el destino está a la vista, el cambio de escala es pequeño: el guía camina
     * de verdad hasta allí en vez de desvanecerse (caso provincia → distrito).
     */
    physicalZoomRatio: 3.2,
  },

  // ---------------------------------------------------------------------------
  // Movimiento real sobre el mapa (nivel local)
  // ---------------------------------------------------------------------------
  movement: {
    /** distancia < 25 % del ancho del mapa ⇒ camina. */
    walkDistanceThreshold: 0.25,
    /** distancia ≥ 65 % ⇒ demasiado lejos: fundido + recolocación (TRANSITION). Entre ambos corre. */
    transitionDistanceThreshold: 0.65,
    /** Velocidades en pantalla (px/s) usadas para calcular la duración del trayecto. */
    walkSpeedPxPerSec: 120,
    runSpeedPxPerSec: 260,
    /** Límites de duración de un trayecto (ms): ni teletransporte ni paseo eterno. */
    minTravelMs: 420,
    maxTravelMs: 1500,
    /** Fundido de salida / entrada del modo TRANSITION fuera de un zoom (ms). */
    transitionFadeMs: 180,
    /** Separación (px) entre el guía y el marcador al que llega: queda "junto a", no encima. */
    destinationStandOffsetPx: 34,
  },

  // ---------------------------------------------------------------------------
  // Animación corporal
  // ---------------------------------------------------------------------------
  /** Crossfade por defecto entre clips (s). */
  crossFadeDuration: 0.2,
  /** Crossfades específicos (s) entre pares de clips: "desde>hacia". */
  crossFades: {
    'avatar_idle>avatar_walk': 0.2,
    'avatar_walk>avatar_run': 0.18,
    'avatar_run>avatar_walk': 0.18,
    'avatar_walk>avatar_arrive': 0.2,
    'avatar_run>avatar_arrive': 0.2,
    'avatar_arrive>avatar_idle': 0.25,
    'avatar_discover>avatar_idle': 0.25,
  } as Partial<Record<string, number>>,
  /** Duración aproximada de la llegada antes de volver a idle (s). Informativa: manda el clip. */
  arrivalDuration: 0.8,
  /** Velocidad (1/s) con la que el cuerpo gira hacia su nueva dirección (sin giros instantáneos). */
  turnSpeed: 9,

  // ---------------------------------------------------------------------------
  // Presentación 3D integrada en el mapa 2D
  // ---------------------------------------------------------------------------
  render: {
    /** Inclinación de la cámara ortográfica (vista 3/4 ligeramente elevada). */
    pitchDeg: 14,
    /**
     * Dirección de reposo: ligeramente girado (≈ 3/4) en lugar de totalmente de
     * frente, para que lea como un personaje "dentro" del mapa.
     */
    idleHeadingDeg: 18,
    /** Margen bajo los pies dentro del lienzo (px) para la sombra. */
    feetMarginPx: 14,
    /** Sombra elíptica: radio relativo al alto del avatar y opacidad base. */
    shadowRadiusRatio: 0.22,
    shadowOpacity: 0.18,
    /** Cuánto se encoge/aclara la sombra por cada unidad de altura del salto. */
    shadowJumpFalloff: 0.9,
  },

  // ---------------------------------------------------------------------------
  // Colocación segura
  // ---------------------------------------------------------------------------
  safety: {
    /** Margen alrededor de etiquetas/marcadores/controles que el avatar no invade (px). */
    paddingPx: 6,
    /** Paso y radio máximo de la búsqueda en espiral alrededor del punto preferido (px). */
    searchStepPx: 12,
    searchMaxRadiusPx: 168,
    /** Ancho del avatar respecto a su alto (para su "huella" en pantalla). */
    footprintWidthRatio: 0.62,
    /**
     * Posición preferida dentro del área visible del mapa por nivel
     * (fracciones de ancho y alto): zona inferior central en Perú, central/baja
     * en región, cerca del centro visual en provincia/distrito.
     */
    anchors: {
      COUNTRY: { x: 0.5, y: 0.8 },
      REGION: { x: 0.48, y: 0.66 },
      PROVINCE: { x: 0.46, y: 0.6 },
      DISTRICT: { x: 0.46, y: 0.6 },
      DESTINATION: { x: 0.46, y: 0.6 },
    } as Record<AvatarMapLevel, { x: number; y: number }>,
  },
} as const;

export type AvatarMapConfig = typeof AVATAR_MAP_CONFIG;
