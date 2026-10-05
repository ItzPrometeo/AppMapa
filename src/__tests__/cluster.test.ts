import { clusterPoints, placeLabels } from '@/features/map/geo/cluster';

const pts = [
  { id: 'a', x: 0, y: 0, popularity: 90 },
  { id: 'b', x: 0.01, y: 0, popularity: 50 },
  { id: 'c', x: 1, y: 1, popularity: 70 },
];

describe('clusterPoints', () => {
  it('agrupa puntos cercanos en pantalla y separa los lejanos', () => {
    const clusters = clusterPoints(pts, 1000, 40); // a y b quedan a 10 px
    expect(clusters).toHaveLength(2);
    const group = clusters.find((c) => c.members.length === 2)!;
    expect(group.members.map((m) => m.id)).toEqual(['a', 'b']);
    // Anclado en el más popular para que la posición sea estable.
    expect(group.x).toBe(0);
  });

  it('al acercar el zoom los grupos se deshacen', () => {
    expect(clusterPoints(pts, 10000, 40)).toHaveLength(3);
  });
});

describe('placeLabels', () => {
  it('prioriza por popularidad y evita solapes', () => {
    const placed = placeLabels([
      { id: 'low', sx: 100, sy: 100, width: 120, priority: 1 },
      { id: 'high', sx: 110, sy: 104, width: 120, priority: 9 },
      { id: 'far', sx: 300, sy: 400, width: 80, priority: 2 },
    ]);
    expect(placed.has('high')).toBe(true);
    expect(placed.has('low')).toBe(false);
    expect(placed.has('far')).toBe(true);
  });
});
