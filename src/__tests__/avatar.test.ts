import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { AVATAR_MAP_CONFIG } from '@/features/avatar/avatarMapConfig';
import {
  avatarHeightFor,
  chooseMovement,
  crossFadeFor,
  headingFromScreenDelta,
  normalizeAvatarScale,
  shortestAngle,
  travelDurationMs,
  zoomOpacity,
} from '@/features/avatar/avatarMath';
import { findSafeAvatarPosition, footprint } from '@/features/avatar/safePosition';
import { TransitionTimeline } from '@/features/avatar/transitionTimeline';

const cfg = AVATAR_MAP_CONFIG;

describe('tamaño del avatar', () => {
  it('se mantiene entre 44 y 72 px y escala con el alto visible del mapa', () => {
    expect(avatarHeightFor(300, 'PROVINCE')).toBe(44);
    expect(avatarHeightFor(674, 'PROVINCE')).toBeCloseTo(64, 0);
    expect(avatarHeightFor(2000, 'PROVINCE')).toBe(72);
  });

  it('los niveles sólo aplican ajustes pequeños', () => {
    const base = avatarHeightFor(674, 'PROVINCE');
    expect(avatarHeightFor(674, 'COUNTRY') / base).toBeCloseTo(0.9);
    expect(avatarHeightFor(674, 'DESTINATION') / base).toBeCloseTo(1.05);
  });

  it('normalizeAvatarScale convierte el alto del bounding box en píxeles deseados', () => {
    // Modelo de 1.48 unidades, 64 px deseados, sin inclinación.
    expect(normalizeAvatarScale(1.48, 64, 0) * 1.48).toBeCloseTo(64);
    // Con cámara inclinada compensa el acortamiento cos(pitch).
    const pitch = (14 * Math.PI) / 180;
    expect(normalizeAvatarScale(1.48, 64, pitch) * 1.48 * Math.cos(pitch)).toBeCloseTo(64);
  });
});

describe('orientación', () => {
  it('mira hacia donde se desplaza (rotationY = atan2(dx, dz) + offset del modelo)', () => {
    expect(headingFromScreenDelta(0, 1, 0)).toBeCloseTo(0); // hacia el usuario
    expect(headingFromScreenDelta(1, 0, 0)).toBeCloseTo(Math.PI / 2); // derecha
    expect(headingFromScreenDelta(0, 1, Math.PI)).toBeCloseTo(Math.PI); // GLB mira a −Z
  });

  it('gira por el lado corto', () => {
    expect(shortestAngle(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(shortestAngle(-3, 3)).toBeCloseTo(-(Math.PI * 2 - 6));
  });
});

describe('movimiento', () => {
  it('elige walk / run / transition según la distancia relativa al ancho del mapa', () => {
    expect(chooseMovement(0, 350)).toBe('IDLE');
    expect(chooseMovement(60, 350)).toBe('WALK');
    expect(chooseMovement(150, 350)).toBe('RUN');
    expect(chooseMovement(300, 350)).toBe('TRANSITION');
  });

  it('la duración depende de la distancia y está acotada', () => {
    expect(travelDurationMs(10, 'WALK')).toBe(cfg.movement.minTravelMs);
    expect(travelDurationMs(120, 'WALK')).toBe(1000);
    expect(travelDurationMs(5000, 'RUN')).toBe(cfg.movement.maxTravelMs);
  });

  it('crossfades específicos y por defecto', () => {
    expect(crossFadeFor('avatar_walk', 'avatar_run')).toBe(0.18);
    expect(crossFadeFor('avatar_idle', 'avatar_jump')).toBe(cfg.crossFadeDuration);
  });
});

describe('opacidad sincronizada con el zoom', () => {
  const t = cfg.transition;
  it('desaparece en la primera mitad, invisible al recolocar y reaparece al final', () => {
    expect(zoomOpacity(0, 1)).toBe(1);
    expect(zoomOpacity(t.zoomFadeEnd, 1)).toBe(0);
    expect(zoomOpacity(t.repositionAt, 1)).toBe(0);
    expect(zoomOpacity(1, 1)).toBe(1);
    const mid = zoomOpacity((t.zoomFadeStart + t.zoomFadeEnd) / 2, 1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('parte de la opacidad visible si se interrumpió una transición', () => {
    expect(zoomOpacity(0, 0.3)).toBeCloseTo(0.3);
  });
});

describe('findSafeAvatarPosition', () => {
  const base = {
    avatarHeight: 60,
    widthRatio: 0.6,
    area: { x0: 0, y0: 0, x1: 400, y1: 600 },
    padding: 4,
    stepPx: 10,
    maxRadiusPx: 160,
  };

  it('usa el punto preferido si está libre', () => {
    expect(findSafeAvatarPosition({ ...base, preferred: { x: 200, y: 300 }, obstacles: [] })).toEqual({
      x: 200,
      y: 300,
    });
  });

  it('se aparta de una etiqueta importante', () => {
    const label = { x0: 160, y0: 250, x1: 240, y1: 280 };
    const p = findSafeAvatarPosition({ ...base, preferred: { x: 200, y: 300 }, obstacles: [label] });
    const fp = footprint(p, 60, 0.6);
    const overlaps = fp.x0 < label.x1 + 4 && fp.x1 > label.x0 - 4 && fp.y0 < label.y1 + 4 && fp.y1 > label.y0 - 4;
    expect(overlaps).toBe(false);
    expect(Math.hypot(p.x - 200, p.y - 300)).toBeLessThan(100);
  });

  it('respeta el área visible y la restricción de terreno', () => {
    const p = findSafeAvatarPosition({
      ...base,
      preferred: { x: 395, y: 30 },
      obstacles: [],
      accept: (q) => q.x < 300,
    });
    const fp = footprint(p, 60, 0.6);
    expect(fp.x1).toBeLessThanOrEqual(400);
    expect(fp.y0).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThan(300);
  });
});

describe('TransitionTimeline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cancelar anula todos los pasos pendientes (no se acumulan transiciones)', () => {
    const tl = new TransitionTimeline();
    const calls: string[] = [];
    tl.at(100, () => calls.push('walk'));
    tl.at(300, () => calls.push('jump'));
    jest.advanceTimersByTime(150);
    tl.cancel();
    tl.at(50, () => calls.push('arrive'));
    jest.advanceTimersByTime(1000);
    expect(calls).toEqual(['walk', 'arrive']);
  });
});

describe('GLB del avatar', () => {
  const file = path.join(__dirname, '../../assets/models/spoint-explorer-rig.glb');
  const glb = fs.readFileSync(file);

  it('es el archivo original sin modificar', () => {
    const sha = crypto.createHash('sha256').update(glb).digest('hex');
    expect(sha).toBe('7e89dd4ea8b72048f13f27aaffea7279d8ac33e3d6a740a7e33a3cef35259587');
  });

  it('trae las animaciones que usa el controlador', () => {
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    const names: string[] = json.animations.map((a: { name: string }) => a.name);
    for (const clip of [
      'avatar_idle',
      'avatar_walk',
      'avatar_run',
      'avatar_jump',
      'avatar_point_destination',
      'avatar_arrive',
      'avatar_discover',
      'avatar_look_map',
    ]) {
      expect(names).toContain(clip);
    }
  });
});
