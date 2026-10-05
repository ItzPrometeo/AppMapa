import {
  canGoBack,
  explorerReducer,
  initialExplorerState,
  levelOf,
  type ExplorerState,
} from '@/features/map/state/explorerMachine';
import type { Destination } from '@/features/destinations/types';

const dest = (id: string): Destination =>
  ({ id, name: id, provinceId: 'ica', regionId: 'ica', category: 'Naturaleza' }) as unknown as Destination;

const run = (...actions: Parameters<typeof explorerReducer>[1][]) =>
  actions.reduce<ExplorerState>(explorerReducer, initialExplorerState);

describe('explorerReducer — flujo obligatorio', () => {
  it('Perú → Ica → Provincia de Ica → Huacachina', () => {
    let s = run({ type: 'COUNTRY_LOADED' });
    expect(s.phase).toBe('loaded');
    expect(levelOf(s)).toBe('country');

    s = explorerReducer(s, { type: 'SELECT_REGION', regionId: 'ica' });
    expect(s.phase).toBe('regionSelected');
    expect(levelOf(s)).toBe('region');

    s = explorerReducer(s, { type: 'SELECT_PROVINCE', regionId: 'ica', provinceId: 'ica' });
    expect(s.phase).toBe('provinceSelected');
    expect(s.destinations).toBeNull();

    s = explorerReducer(s, { type: 'DESTINATIONS_LOADED', provinceId: 'ica', destinations: [dest('huacachina')] });
    expect(s.destinations).toHaveLength(1);

    s = explorerReducer(s, { type: 'SELECT_DESTINATION', destinationId: 'huacachina' });
    expect(s.phase).toBe('destinationSelected');
    expect(s.destinationId).toBe('huacachina');
  });

  it('BACK deshace un nivel cada vez', () => {
    let s = run(
      { type: 'COUNTRY_LOADED' },
      { type: 'SELECT_PROVINCE', regionId: 'ica', provinceId: 'ica' },
      { type: 'DESTINATIONS_LOADED', provinceId: 'ica', destinations: [dest('huacachina')] },
      { type: 'SELECT_DESTINATION', destinationId: 'huacachina' },
    );
    s = explorerReducer(s, { type: 'BACK' });
    expect(s.phase).toBe('provinceSelected');
    expect(s.destinationId).toBeNull();
    s = explorerReducer(s, { type: 'BACK' });
    expect(levelOf(s)).toBe('region');
    expect(s.regionId).toBe('ica');
    s = explorerReducer(s, { type: 'BACK' });
    expect(levelOf(s)).toBe('country');
    expect(canGoBack(s)).toBe(false);
    expect(explorerReducer(s, { type: 'BACK' })).toBe(s);
  });

  it('breadcrumb: GO_TO país o región', () => {
    const atProvince = run(
      { type: 'COUNTRY_LOADED' },
      { type: 'SELECT_PROVINCE', regionId: 'ica', provinceId: 'pisco' },
    );
    expect(levelOf(explorerReducer(atProvince, { type: 'GO_TO', level: 'region' }))).toBe('region');
    expect(levelOf(explorerReducer(atProvince, { type: 'GO_TO', level: 'country' }))).toBe('country');
  });

  it('provincia sin destinos ⇒ estado empty sin romper la navegación', () => {
    let s = run({ type: 'COUNTRY_LOADED' }, { type: 'SELECT_PROVINCE', regionId: 'ica', provinceId: 'palpa' });
    s = explorerReducer(s, { type: 'DESTINATIONS_LOADED', provinceId: 'palpa', destinations: [] });
    expect(s.phase).toBe('empty');
    expect(levelOf(explorerReducer(s, { type: 'BACK' }))).toBe('region');
  });

  it('ignora respuestas tardías de otra provincia', () => {
    const s = run({ type: 'COUNTRY_LOADED' }, { type: 'SELECT_PROVINCE', regionId: 'ica', provinceId: 'nazca' });
    const next = explorerReducer(s, { type: 'DESTINATIONS_LOADED', provinceId: 'ica', destinations: [dest('x')] });
    expect(next).toBe(s);
  });

  it('no permite seleccionar mientras carga o hay error', () => {
    expect(explorerReducer(initialExplorerState, { type: 'SELECT_REGION', regionId: 'ica' })).toBe(
      initialExplorerState,
    );
    const failed = explorerReducer(initialExplorerState, { type: 'LOAD_FAILED', error: 'x' });
    expect(failed.phase).toBe('error');
    expect(explorerReducer(failed, { type: 'RETRY' }).phase).toBe('loading');
  });

  it('cambiar de región limpia provincia, destino y filtro', () => {
    const s = run(
      { type: 'COUNTRY_LOADED' },
      { type: 'SELECT_PROVINCE', regionId: 'ica', provinceId: 'ica' },
      { type: 'SET_FILTER', category: 'Bodegas' },
      { type: 'SELECT_REGION', regionId: 'cusco' },
    );
    expect(s).toMatchObject({ regionId: 'cusco', provinceId: null, destinationId: null, categoryFilter: null });
  });
});
