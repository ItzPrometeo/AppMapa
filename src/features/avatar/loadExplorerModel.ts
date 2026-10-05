/**
 * Carga (una sola vez por sesión) el GLB optimizado del avatar.
 *
 * - Nativo: expo-asset lo copia a disco y expo-file-system lee los bytes.
 * - Web: fetch del asset servido por Metro.
 * El modelo parseado se cachea; cada instancia usa un clon con su propio
 * esqueleto (SkeletonUtils.clone).
 */
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import type { AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export type ExplorerModel = { scene: Object3D; animations: AnimationClip[] };

let cache: Promise<ExplorerModel> | null = null;

/** Hermes no siempre trae TextDecoder (GLTFLoader lo usa para el JSON del GLB). */
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
  const asset = Asset.fromModule(require('../../../assets/models/spoint-explorer.glb'));
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

function parse(buffer: ArrayBuffer): Promise<ExplorerModel> {
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

export function loadExplorerModel(): Promise<ExplorerModel> {
  if (!cache) {
    cache = readBytes()
      .then(parse)
      .catch((e) => {
        cache = null; // permitir reintento
        throw e;
      });
  }
  return cache;
}

/** Instancia independiente (esqueleto propio) del modelo cacheado. */
export async function instantiateExplorer(): Promise<ExplorerModel> {
  const model = await loadExplorerModel();
  return { scene: cloneSkinned(model.scene), animations: model.animations };
}
