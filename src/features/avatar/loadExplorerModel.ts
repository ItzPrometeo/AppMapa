/**
 * Carga del avatar "SPoint Explorer" — UNA vez por sesión.
 *
 * El archivo assets/models/spoint-explorer-rig.glb es el GLB original, sin
 * modificar (ni geometría, ni materiales, ni animaciones). Todo lo que se hace
 * aquí ocurre en memoria y no cambia su aspecto:
 *
 *  1. Esqueleto compartido: el GLB trae 66 mallas con skin, cada una con su
 *     propio Skeleton aunque todas usan las mismas 15 articulaciones y las
 *     mismas matrices inversas. Se comprueba que son idénticas y se apunta
 *     todas al mismo Skeleton → los huesos se actualizan 1 vez por frame, no 66.
 *  2. Fusión por material: las mallas con skin que comparten material, padre y
 *     matriz de enlace se funden en una sola (mergeGeometries) → ~13 draw
 *     calls en lugar de 66. Mismos vértices, mismos pesos: mismo resultado visual.
 *  3. Bounding box: se calcula una sola vez (pose de enlace) para conocer el
 *     alto del modelo y dónde están sus pies; nunca se recalcula por frame.
 *
 * `preloadExplorerModel()` se llama al montar el módulo de mapa para que el
 * guía esté listo cuando termine la animación de entrada.
 */
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type ExplorerModel = {
  /** Raíz lista para añadir a la escena (pies en y = 0, centrado en x/z). */
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  /** Alto del modelo en sus propias unidades (del bounding box). */
  height: number;
  /** Hueso raíz (su altura sobre el suelo alimenta la sombra durante saltos). */
  rootBone: THREE.Object3D | null;
  /** Mixer único, reutilizado entre niveles y aunque se recree el contexto GL. */
  mixer: THREE.AnimationMixer;
};

let cache: Promise<ExplorerModel> | null = null;

/** Hermes no siempre trae TextDecoder (GLTFLoader lo usa para leer el JSON del GLB). */
function ensureTextDecoder() {
  if (typeof globalThis.TextDecoder !== 'undefined') return;
  class Utf8Decoder {
    decode(input?: ArrayBuffer | ArrayBufferView) {
      if (!input) return '';
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '';
      for (let i = 0; i < bytes.length;) {
        const b = bytes[i++];
        if (b < 0x80) out += String.fromCharCode(b);
        else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (b < 0xf0)
          out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else {
          const cp =
            (((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)) -
            0x10000;
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
      }
      return out;
    }
  }
  (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = Utf8Decoder;
}

async function readBytes(): Promise<ArrayBuffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asset = Asset.fromModule(require('../../../assets/models/spoint-explorer-rig.glb'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`No se pudo descargar el avatar (${res.status})`);
    return res.arrayBuffer();
  }
  const { File } = await import('expo-file-system');
  return new File(uri).arrayBuffer();
}

function parse(buffer: ArrayBuffer): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  ensureTextDecoder();
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

const sameMatrices = (a: THREE.Matrix4[], b: THREE.Matrix4[]) =>
  a.length === b.length && a.every((m, i) => m.elements.every((v, k) => Math.abs(v - b[i].elements[k]) < 1e-6));

const materialKey = (m: THREE.Material) => {
  const s = m as THREE.MeshStandardMaterial;
  return [m.name, s.color?.getHexString(), s.roughness, s.metalness, m.side, m.transparent].join('|');
};

/** Pasos 1 y 2 (ver cabecera): sin cambios visuales, menos trabajo por frame. */
function optimizeInMemory(scene: THREE.Group) {
  scene.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  if (skinned.length < 2) return;

  // 1. Esqueleto compartido (sólo si huesos e inversas coinciden exactamente).
  const shared = skinned[0].skeleton;
  for (const mesh of skinned) {
    const sk = mesh.skeleton;
    const sameBones = sk.bones.length === shared.bones.length && sk.bones.every((b, i) => b === shared.bones[i]);
    if (sameBones && sameMatrices(sk.boneInverses, shared.boneInverses)) mesh.bind(shared, mesh.bindMatrix);
  }

  // 2. Fusión por (material, padre, matriz de enlace, atributos).
  const identity = new THREE.Matrix4();
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  for (const mesh of skinned) {
    if (mesh.skeleton !== shared || Array.isArray(mesh.material) || !mesh.parent) continue;
    // Sólo mallas sin transformación local propia: así fundirlas no mueve nada.
    if (!mesh.matrix.equals(identity)) continue;
    const attrs = Object.keys(mesh.geometry.attributes).sort().join(',');
    const key = [
      materialKey(mesh.material),
      mesh.parent.uuid,
      mesh.bindMatrix.elements.map((v) => v.toFixed(6)).join(','),
      attrs,
      mesh.geometry.index ? 'i' : 'n',
    ].join('#');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(mesh);
  }
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const merged = mergeGeometries(
      meshes.map((m) => m.geometry),
      false,
    );
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new THREE.SkinnedMesh(merged, first.material);
    mesh.name = `explorer_${(first.material as THREE.Material).name || 'part'}`;
    first.parent!.add(mesh);
    mesh.bind(shared, first.bindMatrix);
    for (const m of meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
  }
}

async function loadOnce(): Promise<ExplorerModel> {
  const { scene, animations } = await parse(await readBytes());
  optimizeInMemory(scene);

  // 3. Bounding box UNA vez: alto del modelo y pies en y = 0.
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const height = Math.max(1e-6, box.max.y - box.min.y);
  const center = box.getCenter(new THREE.Vector3());
  const root = new THREE.Group();
  root.name = 'ExplorerRoot';
  scene.position.set(-center.x, -box.min.y, -center.z);
  root.add(scene);
  scene.traverse((o) => {
    // Con skinning, el bounding box de la pose de enlace no sirve para el
    // frustum culling durante animaciones amplias: se desactiva (el lienzo es pequeño).
    o.frustumCulled = false;
  });

  return {
    root,
    animations,
    height,
    rootBone: scene.getObjectByName('root') ?? null,
    mixer: new THREE.AnimationMixer(root),
  };
}

/** Carga (o devuelve la carga en curso). Reintenta en la siguiente llamada si falló. */
export function loadExplorerModel(): Promise<ExplorerModel> {
  if (!cache) {
    cache = loadOnce().catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

/** Precarga sin bloquear (al entrar en el mapa). */
export function preloadExplorerModel() {
  loadExplorerModel().catch(() => undefined);
}
