/**
 * Máquina de estados del explorador (pura, sin efectos → fácil de testear).
 *
 *   loading ─▶ loaded (Perú)
 *                 │ SELECT_REGION
 *                 ▼
 *           regionSelected ◀──────────── BACK / GO_TO region
 *                 │ SELECT_PROVINCE
 *                 ▼
 *          provinceSelected | empty  (según haya destinos)
 *                 │ SELECT_DESTINATION
 *                 ▼
 *          destinationSelected
 *
 * `offline` es ortogonal (la app sigue funcionando con datos locales) y se
 * expone aparte; `error` sólo bloquea si no se pudo cargar el mapa base.
 */
import type { Category, Destination } from '@/features/destinations/types';

export type Level = 'country' | 'region' | 'province';

export type Phase =
  'loading' | 'loaded' | 'regionSelected' | 'provinceSelected' | 'destinationSelected' | 'empty' | 'error';

export type ExplorerState = {
  phase: Phase;
  regionId: string | null;
  provinceId: string | null;
  destinationId: string | null;
  /** null = cargando destinos de la provincia. */
  destinations: Destination[] | null;
  categoryFilter: Category | null;
  error: string | null;
};

export type ExplorerAction =
  | { type: 'COUNTRY_LOADED' }
  | { type: 'LOAD_FAILED'; error: string }
  | { type: 'RETRY' }
  | { type: 'SELECT_REGION'; regionId: string }
  | { type: 'SELECT_PROVINCE'; regionId: string; provinceId: string }
  | { type: 'DESTINATIONS_LOADED'; provinceId: string; destinations: Destination[] }
  | { type: 'SELECT_DESTINATION'; destinationId: string }
  | { type: 'CLEAR_DESTINATION' }
  | { type: 'SET_FILTER'; category: Category | null }
  | { type: 'BACK' }
  | { type: 'GO_TO'; level: 'country' | 'region' };

export const initialExplorerState: ExplorerState = {
  phase: 'loading',
  regionId: null,
  provinceId: null,
  destinationId: null,
  destinations: null,
  categoryFilter: null,
  error: null,
};

export const levelOf = (s: Pick<ExplorerState, 'regionId' | 'provinceId'>): Level =>
  s.provinceId ? 'province' : s.regionId ? 'region' : 'country';

export const levelDepth = (level: Level) => (level === 'country' ? 0 : level === 'region' ? 1 : 2);

const toCountry = (s: ExplorerState): ExplorerState => ({
  ...s,
  phase: 'loaded',
  regionId: null,
  provinceId: null,
  destinationId: null,
  destinations: null,
  categoryFilter: null,
});

const toRegion = (s: ExplorerState, regionId: string): ExplorerState => ({
  ...s,
  phase: 'regionSelected',
  regionId,
  provinceId: null,
  destinationId: null,
  destinations: null,
  categoryFilter: null,
});

const provincePhase = (destinations: Destination[] | null): Phase =>
  destinations && destinations.length === 0 ? 'empty' : 'provinceSelected';

export function explorerReducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case 'COUNTRY_LOADED':
      return state.phase === 'loading' || state.phase === 'error' ? { ...state, phase: 'loaded', error: null } : state;

    case 'LOAD_FAILED':
      return { ...state, phase: 'error', error: action.error };

    case 'RETRY':
      return { ...initialExplorerState };

    case 'SELECT_REGION':
      if (state.phase === 'loading' || state.phase === 'error') return state;
      if (state.regionId === action.regionId && !state.provinceId) return state;
      return toRegion(state, action.regionId);

    case 'SELECT_PROVINCE':
      if (state.phase === 'loading' || state.phase === 'error') return state;
      if (state.provinceId === action.provinceId) {
        // Tocar la provincia ya abierta cierra la tarjeta del destino.
        return state.destinationId
          ? { ...state, destinationId: null, phase: provincePhase(state.destinations) }
          : state;
      }
      return {
        ...state,
        phase: 'provinceSelected',
        regionId: action.regionId,
        provinceId: action.provinceId,
        destinationId: null,
        destinations: null,
        categoryFilter: null,
      };

    case 'DESTINATIONS_LOADED':
      // Respuesta tardía de una provincia que ya no está abierta: se ignora.
      if (state.provinceId !== action.provinceId) return state;
      return {
        ...state,
        destinations: action.destinations,
        phase: state.destinationId ? 'destinationSelected' : provincePhase(action.destinations),
      };

    case 'SELECT_DESTINATION': {
      if (!state.provinceId) return state;
      const exists = state.destinations?.some((d) => d.id === action.destinationId);
      if (!exists) return state;
      return { ...state, destinationId: action.destinationId, phase: 'destinationSelected' };
    }

    case 'CLEAR_DESTINATION':
      if (!state.destinationId) return state;
      return { ...state, destinationId: null, phase: provincePhase(state.destinations) };

    case 'SET_FILTER':
      return { ...state, categoryFilter: action.category };

    case 'BACK':
      if (state.destinationId) return { ...state, destinationId: null, phase: provincePhase(state.destinations) };
      if (state.provinceId && state.regionId) return toRegion(state, state.regionId);
      if (state.regionId) return toCountry(state);
      return state;

    case 'GO_TO':
      if (action.level === 'country') return state.regionId ? toCountry(state) : state;
      if (action.level === 'region' && state.regionId && state.provinceId) return toRegion(state, state.regionId);
      return state;

    default:
      return state;
  }
}

/** ¿Puede el usuario retroceder? (botón atrás de Android, gesto, cabecera). */
export const canGoBack = (s: ExplorerState) => Boolean(s.destinationId || s.regionId);
