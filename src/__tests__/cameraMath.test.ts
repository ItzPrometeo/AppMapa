import {
  centerOn,
  constrain,
  fitBounds,
  flightDuration,
  planEase,
  planFlight,
  sampleFlight,
  screenToWorld,
  worldToScreen,
  zoomAround,
} from '@/features/map/camera/cameraMath';

const viewport = { width: 390, height: 844 };
const bounds = { minX: -76.4, maxX: -74.66, minY: 13.1, maxY: 15.7 };

describe('fitBounds', () => {
  it('encuadra los límites dentro del área útil respetando el padding', () => {
    const padding = { top: 180, right: 20, bottom: 200, left: 20 };
    const cam = fitBounds(bounds, viewport, { padding });
    const tl = worldToScreen(bounds.minX, bounds.minY, cam, viewport);
    const br = worldToScreen(bounds.maxX, bounds.maxY, cam, viewport);
    expect(tl.x).toBeGreaterThanOrEqual(padding.left - 1e-6);
    expect(tl.y).toBeGreaterThanOrEqual(padding.top - 1e-6);
    expect(br.x).toBeLessThanOrEqual(viewport.width - padding.right + 1e-6);
    expect(br.y).toBeLessThanOrEqual(viewport.height - padding.bottom + 1e-6);
    // Al menos un eje queda ajustado exactamente (zoom máximo posible).
    const fitsW = Math.abs(br.x - tl.x - (viewport.width - 40)) < 1e-6;
    const fitsH = Math.abs(br.y - tl.y - (viewport.height - 380)) < 1e-6;
    expect(fitsW || fitsH).toBe(true);
    // Centrado en el área útil.
    expect((tl.x + br.x) / 2).toBeCloseTo(195);
    expect((tl.y + br.y) / 2).toBeCloseTo(180 + (844 - 380) / 2);
  });

  it('respeta maxZoom y minExtent', () => {
    const tiny = { minX: 0, maxX: 0.001, minY: 0, maxY: 0.001 };
    expect(fitBounds(tiny, viewport, { maxZoom: 500 }).k).toBe(500);
    expect(fitBounds(tiny, viewport, { minExtent: 1 }).k).toBeCloseTo(390);
  });
});

describe('transformaciones', () => {
  it('worldToScreen y screenToWorld son inversas', () => {
    const cam = { x: -75, y: 14, k: 123 };
    const s = worldToScreen(-75.76, 14.2, cam, viewport);
    const w = screenToWorld(s.x, s.y, cam, viewport);
    expect(w.x).toBeCloseTo(-75.76);
    expect(w.y).toBeCloseTo(14.2);
  });

  it('zoomAround mantiene fijo el punto focal', () => {
    const cam = { x: -75, y: 14, k: 100 };
    const before = screenToWorld(100, 300, cam, viewport);
    const next = zoomAround(cam, 2.5, 100, 300, viewport);
    const after = screenToWorld(100, 300, next, viewport);
    expect(next.k).toBe(250);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('centerOn coloca el punto en el centro del área útil', () => {
    const padding = { top: 200, right: 0, bottom: 300, left: 0 };
    const cam = centerOn(-75, 14, 50, viewport, padding);
    const s = worldToScreen(-75, 14, cam, viewport);
    expect(s.x).toBeCloseTo(195);
    expect(s.y).toBeCloseTo(200 + (844 - 500) / 2);
  });

  it('constrain limita zoom y centro', () => {
    const limits = { minK: 10, maxK: 100, bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } };
    expect(constrain({ x: 5, y: -5, k: 500 }, limits)).toEqual({ x: 1, y: 0, k: 100 });
    expect(constrain({ x: 0.5, y: 0.5, k: 1 }, limits).k).toBe(10);
  });
});

describe('vuelos (van Wijk)', () => {
  const from = { x: -75, y: 9.5, k: 28 };
  const to = { x: -75.5, y: 14.3, k: 160 };

  it('empieza y termina exactamente en las cámaras dadas', () => {
    for (const plan of [planFlight(from, to, 390), planEase(from, to, 390)]) {
      const start = sampleFlight(plan, 0);
      expect(start.x).toBeCloseTo(from.x);
      expect(start.y).toBeCloseTo(from.y);
      expect(start.k).toBeCloseTo(from.k);
      expect(sampleFlight(plan, 1)).toEqual(to);
    }
  });

  it('es continuo (sin saltos entre frames)', () => {
    const plan = planFlight(from, to, 390);
    let prev = sampleFlight(plan, 0);
    for (let i = 1; i <= 60; i++) {
      const cur = sampleFlight(plan, i / 60);
      expect(Math.abs(Math.log(cur.k / prev.k))).toBeLessThan(0.2);
      expect(Math.hypot(cur.x - prev.x, cur.y - prev.y) * cur.k).toBeLessThan(80);
      prev = cur;
    }
  });

  it('zoom puro (mismo centro) interpola geométricamente', () => {
    const plan = planFlight({ x: 0, y: 0, k: 10 }, { x: 0, y: 0, k: 40 }, 390);
    expect(plan.pureZoom).toBe(true);
    expect(sampleFlight(plan, 0.5).k).toBeCloseTo(20);
  });

  it('la duración queda acotada', () => {
    const near = planFlight(from, { ...from, k: from.k * 1.01 }, 390);
    const far = planFlight({ x: -80, y: 4, k: 2000 }, { x: -69, y: 18, k: 2000 }, 390);
    expect(flightDuration(near, 620, 520, 1100)).toBe(520);
    expect(flightDuration(far, 620, 520, 1100)).toBe(1100);
  });
});
