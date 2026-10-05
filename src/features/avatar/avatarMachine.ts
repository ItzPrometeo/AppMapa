/**
 * Máquina de estados de animaciones del avatar "SPoint Explorer" (pura).
 *
 * - `base`: animación en bucle de fondo (idle, o run/walk mientras la cámara vuela).
 * - `queue`: animaciones de una sola vez que se reproducen en orden; al terminar
 *   la cola se vuelve a `base`.
 * - `seq`: se incrementa cada vez que cambia lo que debe sonar. El renderer
 *   reinicia la animación cuando cambia y sólo acepta `clipEnded` del seq actual
 *   (las notificaciones tardías de un clip interrumpido se ignoran).
 *
 * Política: el último evento manda (reemplaza la cola), salvo los eventos de
 * baja prioridad (pulsar el mapa, ver marcadores, tocar al avatar) que se
 * ignoran mientras el avatar viaja con la cámara.
 */

export const AVATAR_CLIPS = [
  'avatar_idle',
  'avatar_walk',
  'avatar_run',
  'avatar_jump',
  'avatar_turn_left',
  'avatar_turn_right',
  'avatar_look_map',
  'avatar_point_destination',
  'avatar_take_photo',
  'avatar_arrive',
  'avatar_discover',
  'avatar_celebrate',
  'avatar_wave',
] as const;

export type AvatarClip = (typeof AVATAR_CLIPS)[number];
export type BaseClip = 'avatar_idle' | 'avatar_walk' | 'avatar_run';

/** Clips en bucle; el resto se reproduce una vez. */
export const LOOPING_CLIPS: ReadonlySet<AvatarClip> = new Set(['avatar_idle', 'avatar_walk', 'avatar_run']);

export type Direction = 'left' | 'right';

export type AvatarEvent =
  | { type: 'appear'; firstTime: boolean }
  | { type: 'press'; direction: Direction }
  | { type: 'travelStart'; direction: 'in' | 'out' }
  | { type: 'travelEnd' }
  | { type: 'markersShown' }
  | { type: 'destinationSelected'; direction: Direction }
  | { type: 'openDestination' }
  | { type: 'saved' }
  | { type: 'tap' }
  | { type: 'locateStart' }
  | { type: 'locateArrived' }
  | { type: 'locateFailed' };

export type AvatarState = {
  base: BaseClip;
  queue: AvatarClip[];
  seq: number;
  /** -1 mira a la izquierda, 1 a la derecha, 0 de frente. */
  facing: -1 | 0 | 1;
  traveling: boolean;
  /** Con "reducir movimiento": sin saltos, carreras ni giros. */
  reduceMotion: boolean;
};

export type AvatarAction =
  | { type: 'event'; event: AvatarEvent }
  | { type: 'clipEnded'; seq: number }
  | { type: 'setReduceMotion'; value: boolean };

export const initialAvatarState: AvatarState = {
  base: 'avatar_idle',
  queue: [],
  seq: 0,
  facing: 0,
  traveling: false,
  reduceMotion: false,
};

export const currentClip = (s: AvatarState): AvatarClip => s.queue[0] ?? s.base;

const turn = (d: Direction): AvatarClip => (d === 'left' ? 'avatar_turn_left' : 'avatar_turn_right');
const facingOf = (d: Direction): -1 | 1 => (d === 'left' ? -1 : 1);

function play(s: AvatarState, patch: Partial<AvatarState>): AvatarState {
  return { ...s, ...patch, seq: s.seq + 1 };
}

/** Versión "reducir movimiento": sólo idle y apariciones suaves. */
function reduced(s: AvatarState, e: AvatarEvent): AvatarState {
  switch (e.type) {
    case 'appear':
    case 'travelEnd':
    case 'locateArrived':
      return play(s, { base: 'avatar_idle', queue: ['avatar_arrive'], facing: 0, traveling: false });
    case 'travelStart':
      return { ...s, traveling: true };
    default:
      return s;
  }
}

function onEvent(s: AvatarState, e: AvatarEvent): AvatarState {
  if (s.reduceMotion) return reduced(s, e);
  switch (e.type) {
    case 'appear':
      return play(s, {
        base: 'avatar_idle',
        queue: e.firstTime ? ['avatar_arrive', 'avatar_wave'] : ['avatar_arrive'],
        facing: 0,
        traveling: false,
      });
    case 'travelStart':
      return play(s, {
        base: e.direction === 'in' ? 'avatar_run' : 'avatar_walk',
        queue: e.direction === 'in' ? ['avatar_jump'] : [],
        facing: 0,
        traveling: true,
      });
    case 'travelEnd':
      return play(s, { base: 'avatar_idle', queue: ['avatar_arrive'], facing: 0, traveling: false });
    case 'press':
      if (s.traveling) return s;
      return play(s, { queue: [turn(e.direction), 'avatar_look_map'], facing: facingOf(e.direction) });
    case 'markersShown':
      if (s.traveling) return s;
      return play(s, { queue: ['avatar_look_map'], facing: 0 });
    case 'destinationSelected':
      return play(s, {
        base: 'avatar_idle',
        queue: [turn(e.direction), 'avatar_point_destination'],
        facing: facingOf(e.direction),
        traveling: false,
      });
    case 'openDestination':
      return play(s, { queue: ['avatar_discover'], facing: 0 });
    case 'saved':
      return play(s, { queue: ['avatar_celebrate'], facing: 0 });
    case 'tap':
      if (s.traveling) return s;
      return play(s, { queue: ['avatar_wave'], facing: 0 });
    case 'locateStart':
      return play(s, { base: 'avatar_idle', queue: ['avatar_jump'], facing: 0, traveling: true });
    case 'locateArrived':
      return play(s, { base: 'avatar_idle', queue: ['avatar_arrive', 'avatar_wave'], facing: 0, traveling: false });
    case 'locateFailed':
      return play(s, { base: 'avatar_idle', queue: ['avatar_wave'], facing: 0, traveling: false });
    default:
      return s;
  }
}

export function avatarReducer(s: AvatarState, a: AvatarAction): AvatarState {
  switch (a.type) {
    case 'event':
      return onEvent(s, a.event);
    case 'clipEnded': {
      if (a.seq !== s.seq || s.queue.length === 0) return s;
      const queue = s.queue.slice(1);
      return play(s, { queue, facing: queue.length === 0 ? 0 : s.facing });
    }
    case 'setReduceMotion':
      return a.value === s.reduceMotion
        ? s
        : play(s, { reduceMotion: a.value, base: 'avatar_idle', queue: [], facing: 0, traveling: false });
    default:
      return s;
  }
}
