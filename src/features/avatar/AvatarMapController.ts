/**
 * AvatarMapController — cerebro del guía sobre el mapa.
 *
 * Separado del componente visual del mapa: el mapa sólo EMITE eventos
 * (mapReady, transitionStart ≈ onMapLevelChange, zoomStart/zoomEnd, mapPan,
 * destinationSelected/Cleared; el progreso del zoom llega como shared value) y
 * este controlador decide qué hace el avatar.
 *
 * Responsabilidades: clips del GLB con crossfade, posición sobre el mapa,
 * orientación, tamaño en pantalla, sincronización con el zoom, recolocación
 * durante transiciones, movimiento real en el nivel local y colocación segura.
 *
 * Estrategia híbrida:
 *  - Niveles grandes (Perú → región → provincia): el cambio de escala es enorme,
 *    así que el guía NO recorre distancias reales. Mira, da unos pasos, salta,
 *    se desvanece con el zoom, se recoloca invisible en el ancla del nuevo nivel
 *    y reaparece con "arrive". Parece que viajó con la cámara.
 *  - Si el zoom es pequeño (≤ physicalZoomRatio) y el destino está a la vista,
 *    camina de verdad hasta allí (caso provincia → distrito).
 *  - Nivel local (varios destinos visibles): camina/corre de verdad hasta el
 *    atractivo; si está demasiado lejos, fundido + recolocación.
 *
 * Todo el estado del avatar vive aquí (AvatarMapState); los pasos temporizados
 * pasan por una única TransitionTimeline y `cancelAvatarTransition()` deja todo
 * listo para empezar desde el estado visual actual.
 */
import {
  cancelAnimation,
  Easing,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { screenToWorld, worldToScreen, type Camera, type Viewport } from '@/features/map/camera/cameraMath';
import type { Level } from '@/features/map/state/explorerMachine';
import type { ExplorerEvent } from '@/features/map/state/useMapExplorer';
import { motion } from '@/theme/tokens';

import {
  AVATAR_MAP_CONFIG,
  type AvatarClip,
  type AvatarMapLevel,
  type AvatarMovementMode,
  type AvatarPositionMode,
} from './avatarMapConfig';
import {
  avatarHeightFor,
  chooseMovement,
  crossFadeFor,
  headingFromScreenDelta,
  travelDurationMs,
  zoomOpacity,
} from './avatarMath';
import type { AvatarRenderLink } from './ExplorerAvatar';
import { findSafeAvatarPosition, type Point, type Rect } from './safePosition';
import { TransitionTimeline } from './transitionTimeline';

const C = AVATAR_MAP_CONFIG;
/** El GLB mira hacia −Z; con rotationY = π mira al usuario. */
export const MODEL_FORWARD_OFFSET = Math.PI;
const IDLE_HEADING = MODEL_FORWARD_OFFSET + (C.render.idleHeadingDeg * Math.PI) / 180;

/** Estado único del avatar (no repartido entre componentes). */
export type AvatarMapState = {
  level: AvatarMapLevel;
  /** Pies del avatar en coordenadas del mapa (mundo proyectado). */
  position: Point;
  targetPosition: Point | null;
  animation: AvatarClip;
  movementMode: AvatarMovementMode;
  positionMode: AvatarPositionMode;
  visible: boolean;
  transitioning: boolean;
  /** Destino junto al que está (para no repetir "discover"). */
  destinationId: string | null;
};

/** Shared values (hilo de UI) que mueven el contenedor del avatar. */
export type AvatarSharedValues = {
  worldX: SharedValue<number>;
  worldY: SharedValue<number>;
  /** Opacidad fuera de los zooms. */
  opacity: SharedValue<number>;
  /** 1 mientras la opacidad sigue al progreso del zoom. */
  zoomSync: SharedValue<number>;
  /** Opacidad visible al empezar el zoom (evita parpadeos al interrumpir). */
  zoomFrom: SharedValue<number>;
  /** Recolocación pendiente que se aplica a mitad del zoom (invisible). */
  pendingX: SharedValue<number>;
  pendingY: SharedValue<number>;
  pendingActive: SharedValue<number>;
  /** Escala de "aparición" (0.75 → 1.05 → 1) multiplicada sobre el contenedor. */
  popScale: SharedValue<number>;
  /** Desplazamiento vertical de la aparición (px). */
  lift: SharedValue<number>;
};

/** Lo que el controlador necesita saber de la pantalla y de los datos del mapa. */
export type AvatarEnvironment = {
  viewport(): Viewport;
  /** Cámara actual del mapa. */
  camera(): Camera;
  /** Progreso actual del zoom (0–1). */
  zoomProgress(): number;
  /** Alto visible del mapa (pantalla menos cabecera) para el tamaño del avatar. */
  visibleMapHeight(): number;
  /** Zona de pantalla donde el mapa es visible en ese nivel (sin cabecera ni sheet). */
  visibleArea(level: AvatarMapLevel): Rect;
  /** Etiquetas, marcadores y controles que el avatar no debe tapar. */
  obstacles(level: AvatarMapLevel, cam: Camera, ctx: LevelContext): Rect[];
  /** Restricción de "dónde puede pisar" (p. ej. dentro de la región). */
  accept(level: AvatarMapLevel, ctx: LevelContext): ((world: Point) => boolean) | undefined;
};

export type LevelContext = { regionId: string | null; provinceId: string | null };

type MoveOptions = {
  cam?: Camera;
  /** Clips al llegar (por defecto arrive). */
  arriveClips?: AvatarClip[];
  /** Punto (pantalla, con `cam`) hacia el que mirar al llegar. */
  faceAt?: Point | null;
  positionMode: AvatarPositionMode;
  onArrive?: () => void;
};

const toAvatarLevel = (l: Level): AvatarMapLevel =>
  l === 'country' ? 'COUNTRY' : l === 'region' ? 'REGION' : 'PROVINCE';
const depth = (l: Level) => (l === 'country' ? 0 : l === 'region' ? 1 : 2);

export class AvatarMapController {
  readonly state: AvatarMapState = {
    level: 'COUNTRY',
    position: { x: 0, y: 0 },
    targetPosition: null,
    animation: 'avatar_idle',
    movementMode: 'IDLE',
    positionMode: 'MAP_ANCHOR',
    visible: false,
    transitioning: false,
    destinationId: null,
  };

  private timeline = new TransitionTimeline();
  private queue: AvatarClip[] = [];
  private base: AvatarClip = 'avatar_idle';
  private moveToken = 0;
  private ctx: LevelContext = { regionId: null, provinceId: null };
  /** true si la transición en curso es "física" (camina) en lugar de fundido. */
  private physical = false;
  private userLocation: Point | null = null;
  /**
   * Destino elegido mientras el mapa todavía hace zoom (p. ej. desde la
   * búsqueda): se atiende al terminar el zoom, con la vista final.
   */
  private deferredDestination: Extract<ExplorerEvent, { type: 'destinationSelected' }> | null = null;
  private appeared = false;

  /** Inyectado por el hook: actualiza los insets de pantalla que usa el entorno. */
  setInsetsProvider: (
    fn: (level: Level, opts?: { destinationOpen?: boolean }) => { top: number; bottom: number },
  ) => void = () => undefined;

  constructor(
    private readonly sv: AvatarSharedValues,
    /** Canal mutable que el renderer lee en cada frame. */
    readonly link: AvatarRenderLink,
    private readonly env: () => AvatarEnvironment,
    private readonly onVisibleChange: (visible: boolean) => void,
  ) {
    link.onClipEnd = (seq) => this.onClipEnd(seq);
  }

  // ===========================================================================
  // Clips (crossfade siempre; nunca corte seco)
  // ===========================================================================

  /** Reproduce `queue` (clips de una vez) y después queda en `base` (bucle). */
  private play(queue: AvatarClip[], base: AvatarClip = 'avatar_idle') {
    this.queue = [...queue];
    this.base = base;
    this.applyClip(this.queue[0] ?? base);
  }

  private applyClip(clip: AvatarClip) {
    this.link.fade = crossFadeFor(this.link.clip, clip);
    this.link.clip = clip;
    this.link.seq++;
    this.state.animation = clip;
  }

  private onClipEnd(seq: number) {
    if (seq !== this.link.seq || this.queue.length === 0) return;
    this.queue.shift();
    this.applyClip(this.queue[0] ?? this.base);
  }

  // ===========================================================================
  // Utilidades de espacio
  // ===========================================================================

  private heightFor(level: AvatarMapLevel) {
    return avatarHeightFor(this.env().visibleMapHeight(), level);
  }

  private setLevel(level: AvatarMapLevel) {
    this.state.level = level;
    this.link.heightPx = this.heightFor(level);
  }

  private currentWorld(): Point {
    return { x: this.sv.worldX.get(), y: this.sv.worldY.get() };
  }

  private toScreen(p: Point, cam: Camera) {
    return worldToScreen(p.x, p.y, cam, this.env().viewport());
  }

  private toWorld(p: Point, cam: Camera) {
    return screenToWorld(p.x, p.y, cam, this.env().viewport());
  }

  private faceScreen(dx: number, dy: number) {
    if (Math.hypot(dx, dy) < 1) return;
    this.link.heading = headingFromScreenDelta(dx, dy, MODEL_FORWARD_OFFSET);
  }

  private faceIdle() {
    this.link.heading = IDLE_HEADING;
  }

  /** Opacidad que el usuario ve ahora mismo (dentro o fuera de un zoom). */
  private visibleOpacity() {
    return this.sv.zoomSync.get()
      ? zoomOpacity(this.env().zoomProgress(), this.sv.zoomFrom.get())
      : this.sv.opacity.get();
  }

  /**
   * Punto seguro para los pies en un nivel y con una cámara dada.
   * Preferencia: ubicación real (sólo en niveles locales y si cae dentro de la
   * zona) → ancla del nivel. Después se aparta de etiquetas, marcadores y controles.
   */
  private anchorFor(level: AvatarMapLevel, cam: Camera, ctx: LevelContext): { world: Point; mode: AvatarPositionMode } {
    const env = this.env();
    const area = env.visibleArea(level);
    const accept = env.accept(level, ctx);
    const local = level === 'DISTRICT' || level === 'DESTINATION' || level === 'PROVINCE';
    let preferred: Point;
    let mode: AvatarPositionMode = 'MAP_ANCHOR';
    if (local && this.userLocation && (!accept || accept(this.userLocation))) {
      preferred = this.toScreen(this.userLocation, cam);
      mode = 'USER_LOCATION';
    } else {
      const a = C.safety.anchors[level];
      preferred = { x: area.x0 + (area.x1 - area.x0) * a.x, y: area.y0 + (area.y1 - area.y0) * a.y };
    }
    const feet = this.safeScreenPoint(preferred, level, cam, ctx);
    return { world: this.toWorld(feet, cam), mode };
  }

  private safeScreenPoint(preferred: Point, level: AvatarMapLevel, cam: Camera, ctx: LevelContext, extra: Rect[] = []) {
    const env = this.env();
    const accept = env.accept(level, ctx);
    return findSafeAvatarPosition({
      preferred,
      avatarHeight: this.heightFor(level),
      widthRatio: C.safety.footprintWidthRatio,
      obstacles: [...env.obstacles(level, cam, ctx), ...extra],
      area: env.visibleArea(level),
      accept: accept ? (p) => accept(this.toWorld(p, cam)) : undefined,
      padding: C.safety.paddingPx,
      stepPx: C.safety.searchStepPx,
      maxRadiusPx: C.safety.searchMaxRadiusPx,
    });
  }

  private setWorld(p: Point) {
    cancelAnimation(this.sv.worldX);
    cancelAnimation(this.sv.worldY);
    this.sv.worldX.set(p.x);
    this.sv.worldY.set(p.y);
    this.state.position = p;
  }

  // ===========================================================================
  // Cancelación
  // ===========================================================================

  /**
   * Corta lo que esté pasando y congela el estado visual actual: posición y
   * opacidad se quedan donde están, sin acumular clips ni pasos pendientes.
   */
  cancelAvatarTransition() {
    this.timeline.cancel();
    this.moveToken++;
    cancelAnimation(this.sv.worldX);
    cancelAnimation(this.sv.worldY);
    cancelAnimation(this.sv.opacity);
    this.sv.pendingActive.set(0);
    this.state.position = this.currentWorld();
    this.state.targetPosition = null;
    this.state.movementMode = 'IDLE';
    this.physical = false;
  }

  // ===========================================================================
  // Eventos del mapa
  // ===========================================================================

  handle(e: ExplorerEvent) {
    switch (e.type) {
      case 'mapReady':
        return this.appear();
      case 'transitionStart':
        return this.onTransitionStart(e);
      case 'zoomStart':
        return this.onZoomStart(e);
      case 'zoomEnd':
        return this.onZoomEnd(e);
      case 'destinationSelected':
        return this.onDestinationSelected(e);
      case 'destinationCleared':
        if (this.state.level === 'DESTINATION') this.setLevel('PROVINCE');
        return;
      case 'mapPan':
        return;
    }
  }

  /**
   * Primera aparición (≈ 550 ms): pausa breve → fade 0→1, escala
   * 0.75 → 1.05 → 1, pequeña caída y "arrive" → idle. Rápida y sobria.
   */
  appear() {
    if (this.appeared) return;
    this.appeared = true;
    const cam = this.env().camera();
    this.setLevel('COUNTRY');
    const { world, mode } = this.anchorFor('COUNTRY', cam, this.ctx);
    this.setWorld(world);
    this.state.positionMode = mode;
    this.faceIdle();
    const a = C.appear;
    this.sv.opacity.set(0);
    this.sv.popScale.set(a.fromScale);
    this.sv.lift.set(a.dropPx);
    this.timeline.at(a.delayMs, () => {
      this.sv.opacity.set(withTiming(1, { duration: a.fadeMs }));
      this.sv.popScale.set(
        withSequence(
          withTiming(a.overshootScale, { duration: a.overshootMs, easing: motion.easeOutCubic }),
          withSpring(1, motion.spring),
        ),
      );
      this.sv.lift.set(withSpring(0, motion.springSoft));
      this.play(['avatar_arrive']);
      this.state.visible = true;
      this.onVisibleChange(true);
    });
  }

  /** onMapLevelChange: llega antes del zoom, durante el resaltado del mapa. */
  private onTransitionStart(e: Extract<ExplorerEvent, { type: 'transitionStart' }>) {
    this.cancelAvatarTransition();
    this.deferredDestination = null;
    this.ctx = { regionId: e.regionId, provinceId: e.provinceId };
    this.state.destinationId = null;
    if (!this.appeared) return;
    this.state.transitioning = true;
    const goingIn = depth(e.to) > depth(e.from) || (depth(e.to) === depth(e.from) && e.to !== 'country');
    const cam = this.env().camera();
    const me = this.toScreen(this.currentWorld(), cam);

    if (!goingIn) {
      // Volver: rápido. Saltito y el zoom se encarga del resto.
      this.faceIdle();
      this.play(['avatar_jump']);
      return;
    }

    // ¿Cambio de escala pequeño y destino a la vista? → caminar de verdad.
    if (e.targetScreen && e.targetCamera) {
      const ratio = e.targetCamera.k / cam.k;
      const area = this.env().visibleArea(this.state.level);
      const visible =
        e.targetScreen.x > area.x0 &&
        e.targetScreen.x < area.x1 &&
        e.targetScreen.y > area.y0 &&
        e.targetScreen.y < area.y1;
      const dist = Math.hypot(e.targetScreen.x - me.x, e.targetScreen.y - me.y);
      const W = area.x1 - area.x0;
      if (ratio <= C.transition.physicalZoomRatio && visible && dist < W * C.movement.transitionDistanceThreshold) {
        this.physical = true;
        const level = toAvatarLevel(e.to);
        const feet = this.safeScreenPoint(e.targetScreen, level, cam, this.ctx);
        this.moveAvatarTo(this.toWorld(feet, cam), { cam, positionMode: 'MAP_ANCHOR' });
        return;
      }
    }

    // Transición cinematográfica: point → unos pasos → jump (el zoom arranca).
    const t = C.transition;
    if (e.targetScreen) this.faceScreen(e.targetScreen.x - me.x, e.targetScreen.y - me.y);
    this.play(['avatar_point_destination']);
    this.timeline.at(t.pointMs, () => {
      this.play([], 'avatar_walk');
      if (e.targetScreen) {
        const dx = e.targetScreen.x - me.x;
        const dy = e.targetScreen.y - me.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(t.stepsPx, d * 0.5);
        const to = this.toWorld({ x: me.x + (dx / d) * step, y: me.y + (dy / d) * step }, this.env().camera());
        this.sv.worldX.set(withTiming(to.x, { duration: t.walkMs, easing: Easing.linear }));
        this.sv.worldY.set(withTiming(to.y, { duration: t.walkMs, easing: Easing.linear }));
      }
    });
    this.timeline.at(t.pointMs + t.walkMs, () => this.play(['avatar_jump']));
  }

  /** onZoomStart: prepara la recolocación invisible y engancha la opacidad al zoom. */
  private onZoomStart(e: Extract<ExplorerEvent, { type: 'zoomStart' }>) {
    if (!this.appeared || this.physical) return;
    const level = toAvatarLevel(e.to);
    const cam = e.targetCamera ?? this.env().camera();
    const { world, mode } = this.anchorFor(level, cam, { regionId: e.regionId, provinceId: e.provinceId });
    this.sv.zoomFrom.set(this.visibleOpacity());
    this.sv.pendingX.set(world.x);
    this.sv.pendingY.set(world.y);
    this.sv.pendingActive.set(1);
    this.sv.zoomSync.set(1);
    this.state.positionMode = 'TRANSITION';
    this.state.targetPosition = world;
    this.nextAnchorMode = mode;
    // El tamaño del nuevo nivel se ajusta mientras está invisible.
    this.setLevel(level);
  }

  private nextAnchorMode: AvatarPositionMode = 'MAP_ANCHOR';

  /** onZoomEnd: reaparece con "arrive" y se aparta si quedó sobre algo importante. */
  private onZoomEnd(e: Extract<ExplorerEvent, { type: 'zoomEnd' }>) {
    if (!e.completed || !this.appeared) return; // otra transición tomó el control
    this.setLevel(toAvatarLevel(e.to));
    if (this.physical) {
      this.physical = false;
      this.state.transitioning = false;
      this.flushDeferredDestination();
      return;
    }
    if (this.sv.pendingActive.get() && this.state.targetPosition) this.setWorld(this.state.targetPosition);
    this.sv.pendingActive.set(0);
    this.sv.zoomSync.set(0);
    this.sv.opacity.set(1);
    this.state.position = this.currentWorld();
    this.state.targetPosition = null;
    this.state.positionMode = this.nextAnchorMode;
    this.state.transitioning = false;
    this.faceIdle();
    this.play(['avatar_arrive']);
    // Cuando ya se dibujaron etiquetas/marcadores del nuevo nivel, comprobar que no los tapa
    // (o, si había un destino pendiente, ir hacia él).
    this.timeline.at(120, () => {
      if (!this.flushDeferredDestination()) this.settleSafely();
    });
  }

  private flushDeferredDestination(): boolean {
    const e = this.deferredDestination;
    if (!e) return false;
    this.deferredDestination = null;
    // La cámara final que calculó el mapa era previa al zoom: se usa la actual.
    this.onDestinationSelected({ ...e, finalCamera: this.env().camera() });
    return true;
  }

  /** Si la posición actual pisa una etiqueta/marcador, desplazarse unos píxeles. */
  private settleSafely() {
    const cam = this.env().camera();
    const here = this.toScreen(this.currentWorld(), cam);
    const safe = this.safeScreenPoint(here, this.state.level, cam, this.ctx);
    if (Math.hypot(safe.x - here.x, safe.y - here.y) < 3) return;
    const w = this.toWorld(safe, cam);
    const cfg = { duration: 260, easing: motion.easeOutCubic };
    this.sv.worldX.set(withTiming(w.x, cfg));
    this.sv.worldY.set(withTiming(w.y, cfg));
    this.state.position = w;
  }

  /**
   * Nivel local: caminar hasta el atractivo. Si ya está junto a él, sólo lo
   * mira (no repite "discover" mientras la ficha siga abierta).
   */
  private onDestinationSelected(e: Extract<ExplorerEvent, { type: 'destinationSelected' }>) {
    if (!this.appeared) return;
    if (this.state.transitioning) {
      this.deferredDestination = e;
      return;
    }
    const cam = e.finalCamera;
    const marker = this.toScreen(e.world, cam);
    if (this.state.destinationId === e.destinationId && this.state.positionMode === 'DESTINATION') {
      const me = this.toScreen(this.currentWorld(), cam);
      this.faceScreen(marker.x - me.x, marker.y - me.y);
      return;
    }
    this.cancelAvatarTransition();
    this.setLevel('DESTINATION');
    // De pie junto al marcador (a su izquierda si cabe), sin taparlo.
    const off = C.movement.destinationStandOffsetPx;
    const pin: Rect = { x0: marker.x - 22, y0: marker.y - 50, x1: marker.x + 22, y1: marker.y + 26 };
    const feet = this.safeScreenPoint({ x: marker.x - off, y: marker.y + 6 }, 'DESTINATION', cam, this.ctx, [pin]);
    const id = e.destinationId;
    // Walk/run/transition se decide con la vista que el usuario tiene AHORA (la
    // cámara puede acercarse a la vez para separar marcadores agrupados): así
    // el guía camina de verdad hasta un lugar cercano aunque el mapa haga zoom.
    const now = this.env().camera();
    this.moveAvatarTo(this.toWorld(feet, cam), {
      cam: now,
      positionMode: 'DESTINATION',
      faceAt: this.toScreen(e.world, now),
      arriveClips: ['avatar_arrive', 'avatar_discover'],
      onArrive: () => {
        this.state.destinationId = id;
      },
    });
  }

  // ===========================================================================
  // Movimiento real
  // ===========================================================================

  /**
   * moveAvatarTo — desplaza el avatar por el mapa hasta `target` (mundo):
   *  1. posición actual · 2. dirección · 3. orientación · 4. walk/run según la
   *  distancia en pantalla · 5. interpolación easeInOutCubic (el clip va
   *  in-place: el código mueve el avatar) · 6. walk/run en bucle · 7. llegada
   *  detectada al terminar la interpolación · 8. crossfade a arrive · 9. idle.
   *  Si la distancia es excesiva: fundido + recolocación (TRANSITION).
   */
  moveAvatarTo(target: Point, opts: MoveOptions) {
    const token = ++this.moveToken;
    const cam = opts.cam ?? this.env().camera();
    const from = this.toScreen(this.currentWorld(), cam);
    const to = this.toScreen(target, cam);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const area = this.env().visibleArea(this.state.level);
    const mode = chooseMovement(dist, area.x1 - area.x0);
    this.state.targetPosition = target;
    this.state.movementMode = mode;
    // Si estaba medio transparente (transición interrumpida), vuelve a verse.
    if (!this.sv.zoomSync.get() && this.sv.opacity.get() < 1) this.sv.opacity.set(withTiming(1, { duration: 150 }));

    const arrive = () => {
      if (token !== this.moveToken) return;
      this.state.position = target;
      this.state.targetPosition = null;
      this.state.movementMode = 'IDLE';
      this.state.positionMode = opts.positionMode;
      if (opts.faceAt) this.faceScreen(opts.faceAt.x - to.x, opts.faceAt.y - to.y);
      else this.faceIdle();
      this.play(opts.arriveClips ?? ['avatar_arrive']);
      opts.onArrive?.();
    };

    if (mode === 'IDLE') return arrive();

    if (mode === 'TRANSITION') {
      const fade = C.movement.transitionFadeMs;
      this.play(['avatar_jump']);
      this.sv.opacity.set(withTiming(0, { duration: fade }));
      this.timeline.at(fade, () => {
        this.setWorld(target);
        this.sv.opacity.set(withTiming(1, { duration: fade }));
        arrive();
      });
      return;
    }

    this.faceScreen(dx, dy);
    this.play([], mode === 'RUN' ? 'avatar_run' : 'avatar_walk');
    const duration = travelDurationMs(dist, mode);
    const cfg = { duration, easing: motion.easeInOutCubic };
    this.sv.worldX.set(withTiming(target.x, cfg));
    this.sv.worldY.set(
      withTiming(target.y, cfg, (finished) => {
        if (finished) scheduleOnRN(arrive);
      }),
    );
  }

  // ===========================================================================
  // Interacción y ubicación
  // ===========================================================================

  /** Ubicación real (mundo). Sólo se usa en niveles locales. */
  setUserLocation(p: Point | null) {
    this.userLocation = p;
  }

  /** Lleva al guía a tu ubicación si estás en la zona local visible. Devuelve si fue posible. */
  goToUserLocation(): boolean {
    if (!this.userLocation || !this.appeared) return false;
    const level = this.state.level;
    if (level === 'COUNTRY' || level === 'REGION') return false;
    const accept = this.env().accept(level, this.ctx);
    if (accept && !accept(this.userLocation)) return false;
    this.cancelAvatarTransition();
    const cam = this.env().camera();
    const feet = this.safeScreenPoint(this.toScreen(this.userLocation, cam), level, cam, this.ctx);
    this.moveAvatarTo(this.toWorld(feet, cam), { cam, positionMode: 'USER_LOCATION' });
    return true;
  }

  /** Pausa el render 3D cuando no se ve (ahorra batería). */
  setPaused(paused: boolean) {
    this.link.paused = paused;
  }

  isLocalLevel() {
    return this.state.level === 'PROVINCE' || this.state.level === 'DISTRICT' || this.state.level === 'DESTINATION';
  }

  dispose() {
    this.cancelAvatarTransition();
  }
}
