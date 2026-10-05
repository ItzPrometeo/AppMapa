/**
 * ExplorerAvatar — render 3D del guía "SPoint Explorer".
 *
 * Un único GLView pequeño y transparente (≈ 112 × 150 px) con three.js:
 *  - cámara ortográfica con ligero picado; los pies quedan fijos a FEET_MARGIN
 *    del borde inferior, así el contenedor puede anclarse por los pies;
 *  - AnimationMixer con crossfade de 0,2 s; los clips de una vez notifican su
 *    fin (`onClipEnd(seq)`) para que la máquina de estados avance;
 *  - render limitado a 30 FPS, en pausa cuando `paused`;
 *  - si GL o el modelo fallan, `onError` y el contenedor muestra un 2D.
 *
 * Las props cambian sin recrear el contexto: el bucle lee siempre las últimas
 * mediante refs.
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { memo, useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import * as THREE from 'three';

import { LOOPING_CLIPS, type AvatarClip } from './avatarMachine';
import { instantiateExplorer } from './loadExplorerModel';

/** Tamaño del lienzo en puntos y alto del avatar en pantalla (escala fija, independiente del zoom). */
export const AVATAR_CANVAS = { width: 112, height: 150 } as const;
export const AVATAR_HEIGHT_PX = 68;
/** Distancia de los pies al borde inferior del lienzo. */
export const FEET_MARGIN = 12;

const MODEL_HEIGHT = 1.48; // unidades del GLB (pies en y≈0)
const FADE = 0.2;
const FRAME_MS = 1000 / 30;
const PITCH = THREE.MathUtils.degToRad(12);
const YAW_PER_FACING = THREE.MathUtils.degToRad(38);
/** El GLB mira hacia −Z: se gira 180° para que el guía mire al usuario. */
const BASE_YAW = Math.PI;

type Props = {
  clip: AvatarClip;
  seq: number;
  facing: -1 | 0 | 1;
  paused?: boolean;
  onClipEnd: (seq: number) => void;
  onReady?: () => void;
  onError?: (e: unknown) => void;
};

/** Ajustes defensivos para el contexto de expo-gl en iOS/Android. */
function patchNativeContext(gl: ExpoWebGLRenderingContext) {
  const original = gl.getContextAttributes?.bind(gl);
  gl.getContextAttributes = () =>
    original?.() ?? {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
      desynchronized: false,
    };
  const pixelStorei = gl.pixelStorei.bind(gl);
  // expo-gl no implementa algunos parámetros de WebGL (sólo usados con texturas de imagen).
  gl.pixelStorei = (pname: number, param: number | boolean) => {
    if (pname === gl.UNPACK_COLORSPACE_CONVERSION_WEBGL || pname === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) return;
    pixelStorei(pname, param as number);
  };
}

function frameCamera(camera: THREE.OrthographicCamera, aspect: number) {
  const frustumH = (MODEL_HEIGHT * AVATAR_CANVAS.height) / AVATAR_HEIGHT_PX;
  const frustumW = frustumH * aspect;
  const target = new THREE.Vector3(0, MODEL_HEIGHT * 0.5, 0);
  const dist = 6;
  camera.position.set(0, target.y + Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  // Pies (origen) a FEET_MARGIN px del borde inferior, en coordenadas de vista.
  const feet = new THREE.Vector3(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
  const marginU = (FEET_MARGIN / AVATAR_CANVAS.height) * frustumH;
  camera.bottom = feet.y - marginU;
  camera.top = camera.bottom + frustumH;
  camera.left = -frustumW / 2;
  camera.right = frustumW / 2;
  camera.near = 0.1;
  camera.far = 20;
  camera.updateProjectionMatrix();
}

export const ExplorerAvatar = memo(function ExplorerAvatar(props: Props) {
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => disposeRef.current?.(), []);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    let raf = 0;
    let disposed = false;
    try {
      if (Platform.OS !== 'web') patchNativeContext(gl);
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const canvas =
        Platform.OS === 'web' && (gl as unknown as { canvas?: HTMLCanvasElement }).canvas
          ? (gl as unknown as { canvas: HTMLCanvasElement }).canvas
          : ({
              width,
              height,
              style: {},
              addEventListener: () => {},
              removeEventListener: () => {},
              clientWidth: width,
              clientHeight: height,
              getContext: () => gl,
            } as unknown as HTMLCanvasElement);

      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: false });
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera();
      frameCamera(camera, width / height);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d0ff, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(-1.5, 3, 2.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffc49b, 0.7);
      rim.position.set(2, 1.5, -2);
      scene.add(rim);

      // Sombra falsa: elipse suave bajo los pies (sin shadow maps).
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.38, 28),
        new THREE.MeshBasicMaterial({ color: 0x102a43, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(1, 0.55, 1);
      shadow.position.y = 0.002;
      scene.add(shadow);

      const model = await instantiateExplorer();
      if (disposed) return;
      const avatar = model.scene;
      scene.add(avatar);

      const mixer = new THREE.AnimationMixer(avatar);
      const actions = new Map<string, THREE.AnimationAction>();
      for (const clip of model.animations) {
        const action = mixer.clipAction(clip);
        if (!LOOPING_CLIPS.has(clip.name as AvatarClip)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        actions.set(clip.name, action);
      }

      let current: THREE.AnimationAction | null = null;
      let playingSeq = -1;
      let yaw = 0;
      mixer.addEventListener('finished', (e) => {
        if (e.action === current) latest.current.onClipEnd(playingSeq);
      });

      const sync = () => {
        const { clip, seq } = latest.current;
        if (seq === playingSeq) return;
        playingSeq = seq;
        const next = actions.get(clip) ?? actions.get('avatar_idle');
        if (!next) return;
        if (next === current) {
          next.reset().play();
          return;
        }
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(FADE).play();
        current?.fadeOut(FADE);
        current = next;
      };

      const clock = new THREE.Clock();
      let acc = 0;
      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.1);
        if (latest.current.paused) return;
        acc += dt * 1000;
        if (acc < FRAME_MS) return;
        const step = acc / 1000;
        acc = 0;
        try {
          sync();
          mixer.update(step);
          // Giro suave hacia el lado que mira (destino, polígono pulsado…).
          const targetYaw = latest.current.facing * YAW_PER_FACING;
          yaw += (targetYaw - yaw) * Math.min(1, step * 8);
          avatar.rotation.y = BASE_YAW + yaw;
          renderer.render(scene, camera);
          gl.endFrameEXP?.();
        } catch (e) {
          // Un fallo de GL no debe romper el mapa: se pasa al avatar 2D.
          disposed = true;
          cancelAnimationFrame(raf);
          latest.current.onError?.(e);
        }
      };
      sync();
      latest.current.onReady?.();
      loop();

      disposeRef.current = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        mixer.stopAllAction();
        renderer.dispose();
      };
    } catch (e) {
      disposed = true;
      cancelAnimationFrame(raf);
      latest.current.onError?.(e);
    }
  };

  return <GLView style={styles.canvas} onContextCreate={onContextCreate} msaaSamples={4} />;
});

const styles = StyleSheet.create({
  canvas: { width: AVATAR_CANVAS.width, height: AVATAR_CANVAS.height, backgroundColor: 'transparent' },
});
