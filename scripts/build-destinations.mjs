#!/usr/bin/env node
/**
 * SPoint — compila y valida los destinos turísticos.
 *
 * Lee data/destinations.seed.json (lo que edita el equipo de contenido) y:
 *  1. Valida campos obligatorios, categoría, rango de rating y coordenadas.
 *  2. Asigna región y provincia por geometría real (punto en polígono contra
 *     assets/maps/provinces/*). Para islas o puntos sobre el agua se usa la
 *     provincia más cercana (< 30 km).
 *  3. Escribe assets/data/destinations.json, que es lo que consume la app.
 *
 * Uso: npm run data:destinations   (falla con código 1 si hay errores)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data/destinations.seed.json');
const OUT = path.join(ROOT, 'assets/data/destinations.json');
const PROVINCES_DIR = path.join(ROOT, 'assets/maps/provinces');
const REGIONS_FILE = path.join(ROOT, 'assets/maps/peru-regions.geo.json');

const CATEGORIES = [
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
];
const MAX_OFFSHORE_KM = 30;

const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const pointInGeometry = (pt, g) =>
  polygonsOf(g).some(([outer, ...holes]) => pointInRing(pt, outer) && !holes.some((h) => pointInRing(pt, h)));

/** Distancia aproximada en km de un punto al borde de una geometría. */
function distanceKm([x, y], g) {
  const kx = 111.32 * Math.cos((y * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  for (const poly of polygonsOf(g)) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        const dx = (bx - ax) * kx,
          dy = (by - ay) * ky;
        const px = (x - ax) * kx,
          py = (y - ay) * ky;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
      }
    }
  }
  return best;
}

function main() {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const regions = JSON.parse(fs.readFileSync(REGIONS_FILE, 'utf8')).features;
  const regionName = Object.fromEntries(regions.map((r) => [r.id, r.properties.name]));
  const provinces = fs
    .readdirSync(PROVINCES_DIR)
    .map((f) => JSON.parse(fs.readFileSync(path.join(PROVINCES_DIR, f), 'utf8')));

  const errors = [];
  const ids = new Set();
  const out = [];

  for (const d of seed) {
    const where = `[${d.id ?? '?'}]`;
    for (const key of ['id', 'name', 'latitude', 'longitude', 'category', 'subtitle', 'summary']) {
      if (d[key] === undefined || d[key] === '') errors.push(`${where} falta "${key}"`);
    }
    if (ids.has(d.id)) errors.push(`${where} id duplicado`);
    ids.add(d.id);
    if (!CATEGORIES.includes(d.category)) errors.push(`${where} categoría desconocida "${d.category}"`);
    if (d.rating !== undefined && (d.rating < 0 || d.rating > 5)) errors.push(`${where} rating fuera de rango`);

    const pt = [d.longitude, d.latitude];
    let province = provinces.find((p) => pointInGeometry(pt, p.geometry));
    let offshoreKm = 0;
    if (!province) {
      const ranked = provinces.map((p) => ({ p, km: distanceKm(pt, p.geometry) })).sort((a, b) => a.km - b.km);
      if (ranked[0].km <= MAX_OFFSHORE_KM) {
        province = ranked[0].p;
        offshoreKm = ranked[0].km;
      } else {
        errors.push(`${where} fuera del Perú (${ranked[0].km.toFixed(1)} km de ${ranked[0].p.properties.name})`);
        continue;
      }
    }

    const { id: provinceId, name: provinceNameValue, regionId } = province.properties;
    if (offshoreKm > 0) {
      console.log(`  · ${d.id}: fuera de costa/lago, asignado a ${provinceNameValue} (${offshoreKm.toFixed(1)} km)`);
    }
    out.push({
      id: d.id,
      name: d.name,
      region: regionName[regionId],
      regionId,
      province: provinceNameValue,
      provinceId,
      district: d.district ?? null,
      latitude: d.latitude,
      longitude: d.longitude,
      category: d.category,
      image: d.image ?? '',
      rating: d.rating ?? null,
      popularity: d.popularity ?? 0,
      subtitle: d.subtitle,
      summary: d.summary,
      description: d.description ?? null,
      schedule: d.schedule ?? null,
      price: d.price ?? null,
      services: d.services ?? [],
      tags: d.tags ?? [],
    });
  }

  if (errors.length) {
    console.error(`✖ ${errors.length} errores:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }

  out.sort(
    (a, b) =>
      a.regionId.localeCompare(b.regionId) || a.provinceId.localeCompare(b.provinceId) || b.popularity - a.popularity,
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

  const byProvince = {};
  for (const d of out) byProvince[`${d.region} › ${d.province}`] = (byProvince[`${d.region} › ${d.province}`] ?? 0) + 1;
  console.log(`✔ ${out.length} destinos en ${Object.keys(byProvince).length} provincias`);
  for (const [k, n] of Object.entries(byProvince)) console.log(`  ${k}: ${n}`);
}

main();
