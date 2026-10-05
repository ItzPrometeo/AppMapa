#!/usr/bin/env node
/**
 * SPoint — pipeline de datos geográficos.
 *
 * Convierte los GeoJSON de geoBoundaries (ADM1 / ADM2) en los archivos
 * optimizados que consume la app:
 *
 *   assets/maps/peru-regions.geo.json             → nivel Perú (25 regiones)
 *   assets/maps/regions/<regionId>.geo.json       → nivel región (provincias, LOD medio)
 *   assets/maps/provinces/<provinceId>.geo.json   → nivel provincia (contorno en alto detalle)
 *   src/data/geo/manifest.ts                      → índice + cargadores perezosos (require estáticos)
 *
 * Decisiones clave:
 *  - Las regiones se obtienen DISOLVIENDO las provincias (no se usa la geometría
 *    ADM1 directamente). Así el contorno de una región coincide exactamente con
 *    la unión de sus provincias y el crossfade región → provincias es perfecto.
 *  - ADM1 sólo se usa para asignar cada provincia a su región (join por punto
 *    interior). "Municipalidad Metropolitana de Lima" se integra en "Lima".
 *  - Simplificación con topología compartida: bordes vecinos idénticos,
 *    sin huecos ni solapes entre polígonos.
 *  - Coordenadas redondeadas a 4 decimales (~11 m), suficiente para el zoom máximo.
 *
 * Uso:  npm run data:geo   [-- --adm2 ruta/al/ADM2_fullres.geojson]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/source');
const OUT_MAPS = path.join(ROOT, 'assets/maps');
const OUT_MANIFEST = path.join(ROOT, 'src/data/geo/manifest.ts');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const ADM1_FILE = argValue('--adm1') ?? path.join(SRC, 'geoBoundaries-PER-ADM1_simplified.geojson');
const ADM2_FILE = argValue('--adm2') ?? path.join(SRC, 'geoBoundaries-PER-ADM2_simplified.geojson');

/** Porcentaje de vértices que se conserva en cada nivel de detalle (LOD). */
const LOD = {
  region: '12%', // provincias vistas dentro de una región + regiones disueltas
  province: '45%', // contorno de la provincia seleccionada (zoom máximo)
};
const PRECISION = 0.0001;

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

/** geoBoundaries ADM2 trae UTF-8 doble-codificado ("CaÃ±ete"). */
const fixEncoding = (s) => {
  const decoded = Buffer.from(s, 'latin1').toString('utf8');
  return decoded.includes('�') ? s : decoded;
};

/** Nombres de visualización (tildes y nombres turísticos habituales). */
const PROVINCE_DISPLAY = {
  Asuncion: 'Asunción',
  Azangaro: 'Azángaro',
  Bolivar: 'Bolívar',
  Bongara: 'Bongará',
  Camana: 'Camaná',
  Caraveli: 'Caravelí',
  'Carlos Fermin Fitzcarrald': 'Carlos Fermín Fitzcarrald',
  Celendin: 'Celendín',
  Chepen: 'Chepén',
  Concepcion: 'Concepción',
  Contumaza: 'Contumazá',
  'Daniel Alcides Carrion': 'Daniel Alcides Carrión',
  'Datem del Marañon': 'Datem del Marañón',
  'General Sanchez Cerro': 'General Sánchez Cerro',
  'Gran Chimu': 'Gran Chimú',
  Huamalies: 'Huamalíes',
  Huancane: 'Huancané',
  Huanuco: 'Huánuco',
  Huarochiri: 'Huarochirí',
  Huaytara: 'Huaytará',
  Jaen: 'Jaén',
  Julcan: 'Julcán',
  Junin: 'Junín',
  'La Convencion': 'La Convención',
  'La Union': 'La Unión',
  Marañon: 'Marañón',
  'Mariscal Caceres': 'Mariscal Cáceres',
  'Mariscal Ramon Castilla': 'Mariscal Ramón Castilla',
  Morropon: 'Morropón',
  Nasca: 'Nazca',
  Oyon: 'Oyón',
  Purus: 'Purús',
  'Rodriguez de Mendoza': 'Rodríguez de Mendoza',
  'San Martin': 'San Martín',
  'San Roman': 'San Román',
  'Sanchez Carrion': 'Sánchez Carrión',
  'Victor Fajardo': 'Víctor Fajardo',
  'Vilcas Huaman': 'Vilcas Huamán',
  Viru: 'Virú',
  Huacaybamba: 'Huacaybamba',
  Rimac: 'Rímac',
};

const REGION_DISPLAY = {
  'El Callao': 'Callao',
  'Municipalidad Metropolitana de Lima': 'Lima',
};

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

const polygonsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
};

const bboxOf = (geometry) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY].map(round);
};

/**
 * Punto de etiqueta = polo de inaccesibilidad del polígono más grande
 * (mejor que el centroide en formas cóncavas como Lima o Arequipa).
 * Se calcula en coordenadas Mercator para que coincida con lo que ve el usuario.
 */
const labelPointOf = (geometry) => {
  const polys = polygonsOf(geometry);
  const largest = polys.reduce((best, p) => (ringArea(p[0]) > ringArea(best[0]) ? p : best), polys[0]);
  const toMerc = ([lon, lat]) => [lon, mercY(lat)];
  const merc = largest.map((ring) => ring.map(toMerc));
  const [x, y] = polylabel(merc, 0.001);
  return [round(x), round(invMercY(y))];
};

const DEG = Math.PI / 180;
const mercY = (lat) => -Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / DEG;
const invMercY = (y) => (2 * Math.atan(Math.exp(-y * DEG)) - Math.PI / 2) / DEG;
const round = (n) => Number(n.toFixed(4));

// ---------------------------------------------------------------------------
// mapshaper helpers
// ---------------------------------------------------------------------------

async function ms(commands, inputs) {
  const out = await mapshaper.applyCommands(commands, inputs);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, JSON.parse(v.toString())]));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return fs.statSync(file).size;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function main() {
  const adm1Raw = JSON.parse(fs.readFileSync(ADM1_FILE, 'utf8'));
  const adm2Raw = JSON.parse(fs.readFileSync(ADM2_FILE, 'utf8'));

  // 1. Regiones fuente (sólo para el join), con Lima Metropolitana integrada en Lima.
  for (const f of adm1Raw.features) {
    const name = REGION_DISPLAY[f.properties.shapeName] ?? f.properties.shapeName;
    f.properties = { regionName: name, regionId: slugify(name), regionIso: f.properties.shapeISO };
  }

  // 2. Provincias con nombres corregidos.
  for (const f of adm2Raw.features) {
    const raw = fixEncoding(f.properties.shapeName);
    const name = PROVINCE_DISPLAY[raw] ?? raw;
    f.properties = { provinceName: name, provinceId: slugify(name), sourceName: raw };
  }

  // 3. Join espacial (punto interior de la provincia dentro de la región),
  //    limpieza topológica y dos niveles de simplificación.
  const joined = await ms(
    `-i adm2.json -i adm1.json ` +
      `-join target=adm2 source=adm1 point-method fields=regionName,regionId,regionIso ` +
      `-clean target=adm2 ` +
      `-o target=adm2 format=geojson joined.json`,
    { 'adm2.json': adm2Raw, 'adm1.json': adm1Raw },
  );
  const provincesAll = joined['joined.json'];
  const orphans = provincesAll.features.filter((f) => !f.properties.regionId);
  if (orphans.length) {
    throw new Error(`Provincias sin región: ${orphans.map((f) => f.properties.provinceName).join(', ')}`);
  }

  const lods = await ms(
    `-i provinces.json ` +
      `-simplify ${LOD.region} keep-shapes ` +
      `-o format=geojson precision=${PRECISION} region-lod.json ` +
      `-dissolve regionId copy-fields=regionName,regionIso + name=regions ` +
      `-o target=regions format=geojson precision=${PRECISION} regions.json`,
    { 'provinces.json': provincesAll },
  );
  const detail = await ms(
    `-i provinces.json -simplify ${LOD.province} keep-shapes ` + `-o format=geojson precision=${PRECISION} detail.json`,
    { 'provinces.json': provincesAll },
  );

  // 4. Escritura de archivos finales.
  fs.rmSync(OUT_MAPS, { recursive: true, force: true });

  const regions = lods['regions.json'].features
    .map((f) => ({
      type: 'Feature',
      id: f.properties.regionId,
      properties: {
        id: f.properties.regionId,
        name: f.properties.regionName,
        iso: f.properties.regionIso,
        bbox: bboxOf(f.geometry),
        label: labelPointOf(f.geometry),
      },
      geometry: f.geometry,
    }))
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'es'));

  const regionProvinces = new Map();
  for (const f of lods['region-lod.json'].features) {
    const p = f.properties;
    const feature = {
      type: 'Feature',
      id: p.provinceId,
      properties: {
        id: p.provinceId,
        name: p.provinceName,
        regionId: p.regionId,
        bbox: bboxOf(f.geometry),
        label: labelPointOf(f.geometry),
      },
      geometry: f.geometry,
    };
    if (!regionProvinces.has(p.regionId)) regionProvinces.set(p.regionId, []);
    regionProvinces.get(p.regionId).push(feature);
  }

  let total = 0;
  total += writeJson(path.join(OUT_MAPS, 'peru-regions.geo.json'), {
    type: 'FeatureCollection',
    bbox: bboxOfCollection(regions),
    features: regions,
  });

  const index = [];
  for (const region of regions) {
    const provinces = (regionProvinces.get(region.id) ?? []).sort((a, b) =>
      a.properties.name.localeCompare(b.properties.name, 'es'),
    );
    assignTones(provinces);
    total += writeJson(path.join(OUT_MAPS, 'regions', `${region.id}.geo.json`), {
      type: 'FeatureCollection',
      bbox: region.properties.bbox,
      features: provinces,
    });
    index.push({
      id: region.id,
      name: region.properties.name,
      provinces: provinces.map((p) => ({ id: p.id, name: p.properties.name })),
    });
  }

  for (const f of detail['detail.json'].features) {
    const p = f.properties;
    total += writeJson(path.join(OUT_MAPS, 'provinces', `${p.provinceId}.geo.json`), {
      type: 'Feature',
      id: p.provinceId,
      properties: {
        id: p.provinceId,
        name: p.provinceName,
        regionId: p.regionId,
        bbox: bboxOf(f.geometry),
        label: labelPointOf(f.geometry),
      },
      geometry: f.geometry,
    });
  }

  writeManifest(index);

  const provincesCount = index.reduce((n, r) => n + r.provinces.length, 0);
  console.log(
    `✔ ${regions.length} regiones · ${provincesCount} provincias · ${(total / 1024).toFixed(0)} KB en assets/maps`,
  );
  for (const r of index) console.log(`  ${r.name.padEnd(16)} ${r.provinces.map((p) => p.name).join(', ')}`);
}

/**
 * Coloreado de grafos voraz: dos provincias vecinas (que comparten al menos
 * dos vértices, gracias a la topología compartida) nunca reciben el mismo
 * tono. Se procesan de mayor a menor número de vecinos (Welsh–Powell) y se
 * prefiere el tono libre menos usado para repartir la paleta.
 */
const TONES = 6;
function assignTones(features) {
  const vertexOwners = new Map();
  features.forEach((f, i) => {
    for (const poly of polygonsOf(f.geometry)) {
      for (const [x, y] of poly[0]) {
        const key = `${x},${y}`;
        if (!vertexOwners.has(key)) vertexOwners.set(key, new Set());
        vertexOwners.get(key).add(i);
      }
    }
  });
  const shared = features.map(() => new Map());
  for (const owners of vertexOwners.values()) {
    if (owners.size < 2) continue;
    for (const a of owners) for (const b of owners) if (a !== b) shared[a].set(b, (shared[a].get(b) ?? 0) + 1);
  }
  const neighbors = shared.map((m) => [...m].filter(([, n]) => n >= 2).map(([j]) => j));
  const order = features.map((_, i) => i).sort((a, b) => neighbors[b].length - neighbors[a].length);
  const tone = new Array(features.length).fill(-1);
  const usage = new Array(TONES).fill(0);
  for (const i of order) {
    const used = new Set(neighbors[i].map((j) => tone[j]));
    // Entre los tonos libres, el menos usado: más variedad visual en regiones pequeñas.
    const free = [...Array(TONES).keys()].filter((t) => !used.has(t));
    const t = (free.length ? free : [...Array(TONES).keys()]).reduce((a, b) => (usage[b] < usage[a] ? b : a));
    tone[i] = t;
    usage[t]++;
  }
  features.forEach((f, i) => {
    f.properties.tone = tone[i];
  });
}

function bboxOfCollection(features) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    const [a, c, d, e] = f.properties.bbox;
    b[0] = Math.min(b[0], a);
    b[1] = Math.min(b[1], c);
    b[2] = Math.max(b[2], d);
    b[3] = Math.max(b[3], e);
  }
  return b;
}

/**
 * Metro sólo admite `require` con rutas estáticas, así que generamos un índice
 * con un cargador por archivo. Cada `require` está dentro de una función:
 * el JSON no se evalúa hasta que el usuario entra en esa región/provincia.
 */
function writeManifest(index) {
  const q = JSON.stringify;
  const lines = [
    '/* eslint-disable */',
    '// ⚠️ Archivo generado por scripts/build-geo.mjs — no editar a mano.',
    "import type { ProvinceFeature, RegionFeatureCollection, ProvinceFeatureCollection } from '@/features/map/geo/types';",
    '',
    'export type RegionIndexEntry = { id: string; name: string; provinces: { id: string; name: string }[] };',
    '',
    `export const REGION_INDEX: RegionIndexEntry[] = ${q(index, null, 2)};`,
    '',
    "export const loadCountry = (): RegionFeatureCollection => require('../../../assets/maps/peru-regions.geo.json');",
    '',
    'export const REGION_LOADERS: Record<string, () => ProvinceFeatureCollection> = {',
    ...index.map((r) => `  ${q(r.id)}: () => require(${q(`../../../assets/maps/regions/${r.id}.geo.json`)}),`),
    '};',
    '',
    'export const PROVINCE_LOADERS: Record<string, () => ProvinceFeature> = {',
    ...index.flatMap((r) =>
      r.provinces.map((p) => `  ${q(p.id)}: () => require(${q(`../../../assets/maps/provinces/${p.id}.geo.json`)}),`),
    ),
    '};',
    '',
  ];
  fs.mkdirSync(path.dirname(OUT_MANIFEST), { recursive: true });
  fs.writeFileSync(OUT_MANIFEST, lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
