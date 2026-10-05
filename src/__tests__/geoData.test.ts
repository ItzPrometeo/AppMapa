import { PROVINCE_LOADERS, REGION_INDEX, REGION_LOADERS, loadCountry } from '@/data/geo/manifest';
import { hitTest } from '@/features/map/geo/hitTest';
import { project } from '@/features/map/geo/projection';
import { provinceToShape, regionToShape } from '@/features/map/geo/shapes';
import type { Destination } from '@/features/destinations/types';

const destinations: Destination[] = require('../../assets/data/destinations.json');

describe('datos geográficos generados', () => {
  const country = loadCountry();
  const regionShapes = country.features.map((f) => regionToShape(f, '#000'));

  it('25 regiones (24 departamentos + Callao) y 196 provincias', () => {
    expect(country.features).toHaveLength(25);
    expect(REGION_INDEX.reduce((n, r) => n + r.provinces.length, 0)).toBe(196);
    expect(Object.keys(PROVINCE_LOADERS)).toHaveLength(196);
  });

  it('Ica tiene sus 5 provincias', () => {
    const ica = REGION_LOADERS.ica();
    expect(ica.features.map((f) => f.properties.name).sort()).toEqual(['Chincha', 'Ica', 'Nazca', 'Palpa', 'Pisco']);
  });

  it('el hit-test encuentra la región correcta para ciudades conocidas', () => {
    const cases: [string, number, number][] = [
      ['ica', -75.73, -14.07],
      ['cusco', -71.97, -13.52],
      ['arequipa', -71.54, -16.4],
      ['lima', -77.03, -12.05],
      ['loreto', -73.25, -3.75],
      ['puno', -70.02, -15.84],
    ];
    for (const [id, lon, lat] of cases) {
      const { x, y } = project(lon, lat);
      expect(hitTest(regionShapes, x, y)?.id).toBe(id);
    }
  });

  it('las vecinas nunca comparten tono', () => {
    for (const region of REGION_INDEX) {
      const fc = REGION_LOADERS[region.id]();
      for (const f of fc.features) expect(typeof f.properties.tone).toBe('number');
    }
  });

  it('cada destino cae dentro (o junto a la costa) de su provincia', () => {
    for (const d of destinations) {
      const shape = provinceToShape(PROVINCE_LOADERS[d.provinceId](), '#000');
      const { x, y } = project(d.longitude, d.latitude);
      // 0.3° de tolerancia para islas (Ballestas, Palomino, Uros).
      expect(hitTest([shape], x, y, 0.3)?.id).toBe(d.provinceId);
    }
  });

  it('los destinos referencian regiones y provincias existentes', () => {
    for (const d of destinations) {
      const region = REGION_INDEX.find((r) => r.id === d.regionId);
      expect(region).toBeDefined();
      expect(region!.provinces.some((p) => p.id === d.provinceId)).toBe(true);
    }
  });
});
