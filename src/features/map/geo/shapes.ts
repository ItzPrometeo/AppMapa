/**
 * GeoJSON → MapShape: proyecta una vez y genera el path SVG y los anillos
 * para hit-testing. El resultado se cachea en el repositorio, así que este
 * trabajo ocurre como máximo una vez por feature y sesión.
 */
import { bboxToBounds, project } from './projection';
import type { Feature, MapShape, PolygonGeometry, ProvinceProperties, RegionProperties } from './types';

/** 4 decimales (≈ 11 m), la misma precisión que los GeoJSON generados. */
const fmt = (n: number) => Math.round(n * 10000) / 10000;

function polygons(geometry: PolygonGeometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

export function geometryToShapeData(geometry: PolygonGeometry) {
  let d = '';
  let area = 0;
  const rings: Float64Array[][] = [];
  for (const poly of polygons(geometry)) {
    const projectedPoly: Float64Array[] = [];
    poly.forEach((ring, ringIndex) => {
      const arr = new Float64Array(ring.length * 2);
      let ringArea = 0;
      let prevX = 0;
      let prevY = 0;
      for (let i = 0; i < ring.length; i++) {
        const { x, y } = project(ring[i][0], ring[i][1]);
        arr[i * 2] = x;
        arr[i * 2 + 1] = y;
        const fx = fmt(x);
        const fy = fmt(y);
        // Se omiten vértices que caen en el mismo punto tras redondear.
        if (i === 0) d += `M${fx} ${fy}`;
        else if (fx !== prevX || fy !== prevY) d += `L${fx} ${fy}`;
        prevX = fx;
        prevY = fy;
        if (i > 0) ringArea += arr[(i - 1) * 2] * y - x * arr[(i - 1) * 2 + 1];
      }
      d += 'Z';
      if (ringIndex === 0) area += Math.abs(ringArea / 2);
      projectedPoly.push(arr);
    });
    rings.push(projectedPoly);
  }
  return { path: d, rings, area };
}

export function regionToShape(feature: Feature<RegionProperties>, color: string): MapShape {
  const { path, rings, area } = geometryToShapeData(feature.geometry);
  const p = feature.properties;
  return {
    id: p.id,
    name: p.name,
    path,
    rings,
    area,
    color,
    bounds: bboxToBounds(p.bbox),
    label: project(p.label[0], p.label[1]),
  };
}

export function provinceToShape(feature: Feature<ProvinceProperties>, color: string): MapShape {
  const { path, rings, area } = geometryToShapeData(feature.geometry);
  const p = feature.properties;
  return {
    id: p.id,
    name: p.name,
    path,
    rings,
    area,
    color,
    parentId: p.regionId,
    bounds: bboxToBounds(p.bbox),
    label: project(p.label[0], p.label[1]),
  };
}
