#!/usr/bin/env node
/**
 * SPoint — optimiza el avatar "SPoint Explorer" para móvil.
 *
 * Entrada:  data/source/avatar/spoint-explorer-rig.glb   (exportado desde three.js)
 * Salida:   assets/models/spoint-explorer.glb
 *
 * El original (≈ 6 MB, ≈ 121 k triángulos sin indexar, 70 mallas con 70 skins
 * idénticos) es excesivo para un personaje que se ve a ~70 px. Pasos:
 *   1. unifySkins→ los 66 skins comparten articulaciones y sólo difieren en una
 *                  matriz fija por malla: se hornea en los vértices y todas usan
 *                  un único skin (1 esqueleto que actualizar por frame)
 *   2. weld      → indexa la geometría (comparte vértices)
 *   3. join      → une por material las mallas con skin (joinSkinned) y el resto
 *   4. simplify  → meshoptimizer, conservando la silueta
 *   5. resample  → elimina keyframes redundantes de las 13 animaciones
 *   6. quantize  → KHR_mesh_quantization (lo lee three.js sin decodificador)
 *
 * No se usa Draco ni Meshopt: sus decodificadores necesitan WebAssembly, que
 * Hermes (React Native) no tiene.
 *
 * Uso: npm run data:avatar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join,
  joinPrimitives,
  prune,
  quantize,
  resample,
  simplify,
  transformPrimitive,
  weld,
} from '@gltf-transform/functions';
import { Matrix4 } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'data/source/avatar/spoint-explorer-rig.glb');
const OUTPUT = path.join(ROOT, 'assets/models/spoint-explorer.glb');

export const REQUIRED_CLIPS = [
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
];

/**
 * Proporción de triángulos objetivo y error máximo (1 % del tamaño ≈ 0,7 px con
 * el avatar a 68 px de alto: imperceptible).
 */
const SIMPLIFY = { ratio: 0.1, error: 0.01 };

/**
 * Cada skin i cumple IBM_ij = IBM_0j · M_i para todas las articulaciones j.
 * Como v_skin = J_j · IBM_ij · v = J_j · IBM_0j · (M_i · v), basta con
 * transformar los vértices por M_i y apuntar la malla al skin 0.
 */
function unifySkins() {
  return (doc) => {
    const skins = doc.getRoot().listSkins();
    if (skins.length < 2) return;
    const base = skins[0];
    const ibm = (skin, j) => new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(j, new Array(16)));
    const joints = base.listJoints();
    for (const skin of skins.slice(1)) {
      const same = skin.listJoints().every((n, i) => n === joints[i]);
      if (!same) throw new Error('Los skins no comparten articulaciones: no se pueden unificar');
      const M = ibm(base, 0).invert().multiply(ibm(skin, 0));
      for (let j = 1; j < joints.length; j++) {
        const Mj = ibm(base, j).invert().multiply(ibm(skin, j));
        if (!Mj.equals(M) && Mj.elements.some((v, k) => Math.abs(v - M.elements[k]) > 1e-5)) {
          throw new Error('Bind-shape inconsistente entre articulaciones');
        }
      }
      for (const node of doc
        .getRoot()
        .listNodes()
        .filter((n) => n.getSkin() === skin)) {
        for (const prim of node.getMesh().listPrimitives()) transformPrimitive(prim, M.elements);
        node.setSkin(base);
      }
      skin.dispose();
    }
  };
}

/**
 * `join()` de gltf-transform ignora las mallas con skin. Una vez que todas
 * comparten skin, se agrupan sus primitivas por material y se unen en una sola
 * malla: de 66 draw calls a ~13 (uno por material).
 */
function joinSkinned() {
  return (doc) => {
    const nodes = doc
      .getRoot()
      .listNodes()
      .filter((n) => n.getSkin() && n.getMesh());
    if (nodes.length < 2) return;
    const skin = nodes[0].getSkin();
    const parent = nodes[0].getParentNode();
    for (const n of nodes) {
      if (n.getSkin() !== skin || n.getParentNode() !== parent) throw new Error('Mallas con skins distintos');
      const identity = n.getMatrix().every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);
      if (!identity) throw new Error(`El nodo ${n.getName()} tiene transformación propia`);
    }
    // El exportador duplica materiales idénticos: se canonizan por nombre.
    const canonical = new Map();
    const groups = new Map();
    for (const n of nodes) {
      for (const prim of n.getMesh().listPrimitives()) {
        const mat = prim.getMaterial();
        if (mat) {
          if (!canonical.has(mat.getName())) canonical.set(mat.getName(), mat);
          prim.setMaterial(canonical.get(mat.getName()));
        }
        const key = [
          prim.getMaterial()?.getName(),
          prim.getMode(),
          ...prim
            .listSemantics()
            .sort()
            .map((s) => `${s}:${prim.getAttribute(s).getComponentType()}`),
        ].join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(prim);
      }
    }
    const mesh = doc.createMesh('explorer_body');
    for (const prims of groups.values()) mesh.addPrimitive(prims.length > 1 ? joinPrimitives(prims) : prims[0]);
    const body = doc.createNode('explorer_body').setMesh(mesh).setSkin(skin);
    (parent ?? doc.getRoot().listScenes()[0]).addChild(body);
    for (const n of nodes) {
      n.setMesh(null).setSkin(null);
      if (n.listChildren().length === 0) n.dispose();
    }
  };
}

/** El modelo no usa texturas: las UV sólo ocupan espacio. */
function dropUnusedUVs() {
  return (doc) => {
    if (doc.getRoot().listTextures().length > 0) return;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) prim.setAttribute('TEXCOORD_0', null);
    }
  };
}

function stats(doc) {
  const root = doc.getRoot();
  let tris = 0;
  let prims = 0;
  for (const mesh of root.listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      prims++;
      const idx = p.getIndices();
      tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return {
    meshes: root.listMeshes().length,
    primitives: prims,
    triangles: Math.round(tris),
    skins: root.listSkins().length,
    animations: root.listAnimations().length,
  };
}

async function main() {
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(INPUT);
  const before = stats(doc);

  await doc.transform(
    dedup(),
    dropUnusedUVs(),
    unifySkins(),
    flatten(),
    weld(),
    joinSkinned(),
    join({ keepNamed: false, keepMeshes: false }),
    simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY.ratio, error: SIMPLIFY.error }),
    resample(),
    prune({ keepLeaves: true }),
    dedup(),
    // Volumen único: si cada malla tuviera el suyo, quantize clonaría el skin.
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizationVolume: 'scene' }),
    dedup(),
  );

  const after = stats(doc);
  const clips = doc
    .getRoot()
    .listAnimations()
    .map((a) => a.getName());
  const missing = REQUIRED_CLIPS.filter((c) => !clips.includes(c));
  if (missing.length) throw new Error(`Faltan animaciones tras optimizar: ${missing.join(', ')}`);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  await io.write(OUTPUT, doc);
  const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`;
  console.log(`✔ Avatar optimizado: ${kb(INPUT)} → ${kb(OUTPUT)}`);
  console.log('  antes  ', before);
  console.log('  después', after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
