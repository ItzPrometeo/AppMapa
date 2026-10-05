/**
 * ExplorerAvatar — dibuja el GLB del guía (expo-gl + three.js).
 *
 * Por qué un lienzo pequeño que se mueve y no un lienzo a pantalla completa:
 * con cámara ortográfica, dibujar el personaje en un lienzo de ~130×160 px y
 * desplazar ese lienzo sobre el mapa da exactamente la misma imagen que moverlo
 * dentro de una escena a pantalla completa, pero el móvil sólo rellena una
 * fracción mínima de píxeles por frame y el lienzo nunca intercepta toques del
 * mapa. La POSICIÓN la decide AvatarMapController (coordenadas del mapa); este
 * componente sólo dibuja el cuerpo: clips, giro, tamaño y sombra.
 *
 * Integración visual en el mapa 2D:
 *  - cámara ORTOGRÁFICA (sin perspectiva agresiva) inclinada ~14° ⇒ vista 3/4
 *    ligeramente elevada; trabaja en unidades de píxel (1 unidad = 1 px);
 *  - sombra elíptica suave bajo los pies que se encoge/aclara al saltar;
 *  - tamaño = normalizeAvatarScale(alto del bounding box, alto deseado en px).
 *
 * Lee cada frame un objeto mutable (`link`) que escribe el controlador, así los
 * cambios de clip, dirección o tamaño no provocan renders de React.
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { memo, useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import * as THREE from 'three';

import { AVATAR_MAP_CONFIG, LOOPING_CLIPS, type AvatarClip } from './avatarMapConfig';
import { MAX_AVATAR_HEIGHT, normalizeAvatarScale, shortestAngle } from './avatarMath';
import { loadExplorerModel } from './loadExplorerModel';

const R = AVATAR_MAP_CONFIG.render;
const PITCH = THREE.MathUtils.degToRad(R.pitchDeg);

/**
 * Lienzo dimensionado UNA vez para el mayor tamaño posible del avatar: ancho
 * para brazos extendidos y giros, alto con margen para el salto.
 */
export const AVATAR_CANVAS = {
  width: Math.ceil(MAX_AVATAR_HEIGHT * 1.7),
  height: Math.ceil(MAX_AVATAR_HEIGHT * 1.95) + R.feetMarginPx,
} as const;
export const FEET_MARGIN = R.feetMarginPx;

/** Canal controlador → renderer (mutable, se lee en cada frame). */
export type AvatarRenderLink = {
  clip: AvatarClip;
  /** Cambia cada vez que el controlador pide (re)iniciar un clip. */
  seq: number;
  /** Duración del crossfade hacia `clip` (s). */
  fade: number;
  /** rotationY objetivo (rad); el cuerpo gira hacia ella suavemente. */
  heading: number;
  /** Alto objetivo en pantalla (px). */
  heightPx: number;
  paused: boolean;
  onClipEnd: (seq: number) => void;
};

type Props = {
  link: AvatarRenderLink;
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
  // expo-gl no implementa algunos parámetros de WebGL (sólo afectan a texturas de imagen).
  gl.pixelStorei = (pname: number, param: number | boolean) => {
    if (pname === gl.UNPACK_COLORSPACE_CONVERSION_WEBGL || pname === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) return;
    pixelStorei(pname, param as number);
  };
}

/**
 * Cámara ortográfica en PÍXELES: los pies (origen) quedan a FEET_MARGIN px del
 * borde inferior y centrados; así el contenedor se ancla por los pies.
 */
function frameCamera(camera: THREE.OrthographicCamera) {
  const dist = 600;
  camera.position.set(0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const feet = new THREE.Vector3(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
  camera.left = -AVATAR_CANVAS.width / 2;
  camera.right = AVATAR_CANVAS.width / 2;
  camera.bottom = feet.y - FEET_MARGIN;
  camera.top = camera.bottom + AVATAR_CANVAS.height;
  camera.near = 1;
  camera.far = 2000;
  camera.updateProjectionMatrix();
}

export const ExplorerAvatar = memo(function ExplorerAvatar({ link, onReady, onError }: Props) {
  const callbacks = useRef({ onReady, onError });
  useEffect(() => {
    callbacks.current = { onReady, onError };
  });
  const disposeRef = useRef<(() => void) | null>(null);
  useEffect(() => () => disposeRef.current?.(), []);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    let raf = 0;
    let disposed = false;
    const fail = (e: unknown) => {
      disposed = true;
      cancelAnimationFrame(raf);
      callbacks.current.onError?.(e);
    };
    try {
      if (Platform.OS !== 'web') patchNativeContext(gl);
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const webCanvas = (gl as unknown as { canvas?: HTMLCanvasElement }).canvas;
      const canvas =
        Platform.OS === 'web' && webCanvas
          ? webCanvas
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
      frameCamera(camera);

      // Iluminación suave y barata: hemisférica + clave + contraluz cálido.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d0ff, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(-150, 300, 250);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffc49b, 0.7);
      rim.position.set(200, 150, -200);
      scene.add(rim);

      // Sombra elíptica (un disco aplastado, sin shadow maps).
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x102a43,
        transparent: true,
        opacity: R.shadowOpacity,
        depthWrite: false,
      });
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.01;
      scene.add(shadow);

      // Modelo cargado una sola vez; aquí sólo se coloca en esta escena.
      const model = await loadExplorerModel();
      if (disposed) return;
      const avatar = model.root;
      scene.add(avatar);
      const mixer = model.mixer;
      mixer.stopAllAction();
      const actions = new Map<string, THREE.AnimationAction>();
      for (const clip of model.animations) {
        const action = mixer.clipAction(clip);
        if (!LOOPING_CLIPS.has(clip.name as AvatarClip)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
        actions.set(clip.name, action);
      }

      let current: THREE.AnimationAction | null = null;
      let playingSeq = -1;
      let heading = link.heading;
      let heightPx = link.heightPx;
      const restRootY = model.rootBone ? model.rootBone.getWorldPosition(new THREE.Vector3()).y : 0;
      const tmp = new THREE.Vector3();

      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === current) link.onClipEnd(playingSeq);
      };
      mixer.addEventListener('finished', onFinished);

      /** Crossfade al clip pedido (nunca corte seco entre clips). */
      const sync = () => {
        if (link.seq === playingSeq) return;
        playingSeq = link.seq;
        const next = actions.get(link.clip) ?? actions.get('avatar_idle');
        if (!next) return;
        if (next === current) {
          next.reset().play();
          return;
        }
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(link.fade).play();
        current?.fadeOut(link.fade);
        current = next;
      };

      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.1);
        if (link.paused) return;
        try {
          sync();
          mixer.update(dt);

          // Giro suave por el lado corto hacia la dirección objetivo.
          heading += shortestAngle(heading, link.heading) * Math.min(1, dt * AVATAR_MAP_CONFIG.turnSpeed);
          avatar.rotation.y = heading;

          // Tamaño en pantalla constante (independiente del zoom del mapa).
          heightPx += (link.heightPx - heightPx) * Math.min(1, dt * AVATAR_MAP_CONFIG.sizeLerpSpeed);
          const s = normalizeAvatarScale(model.height, heightPx, PITCH);
          avatar.scale.setScalar(s);

          // La sombra se encoge y aclara cuando el cuerpo se eleva (salto).
          const lift = model.rootBone ? (model.rootBone.getWorldPosition(tmp).y - restRootY * s) / heightPx : 0;
          const k = Math.max(0.45, 1 - Math.max(0, lift) * R.shadowJumpFalloff);
          const r = heightPx * R.shadowRadiusRatio * k;
          shadow.scale.set(r, r * 0.42, 1);
          shadowMat.opacity = R.shadowOpacity * k;

          renderer.render(scene, camera);
          gl.endFrameEXP?.();
        } catch (e) {
          // Un fallo de GL nunca debe romper el mapa: se pasa al guía 2D.
          fail(e);
        }
      };
      sync();
      callbacks.current.onReady?.();
      loop();

      disposeRef.current = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        mixer.removeEventListener('finished', onFinished);
        scene.remove(avatar);
        renderer.dispose();
      };
    } catch (e) {
      fail(e);
    }
  };

  // pointerEvents en el estilo: en web el <canvas> de GLView fija `auto` y
  // capturaría los toques destinados al mapa.
  return <GLView style={styles.canvas} pointerEvents="none" onContextCreate={onContextCreate} msaaSamples={4} />;
});

const styles = StyleSheet.create({
  canvas: {
    width: AVATAR_CANVAS.width,
    height: AVATAR_CANVAS.height,
    backgroundColor: 'transparent',
    pointerEvents: 'none',
  },
});
