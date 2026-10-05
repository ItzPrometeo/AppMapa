/**
 * Mini mapa estático de la página de destino: la región en tonos suaves, la
 * provincia resaltada y el punto exacto. Reutiliza la misma geometría y
 * proyección que el explorador (continuidad visual, cero datos extra).
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { geoRepository, type ShapeLayer } from '@/features/map/geo/geoRepository';
import { padBounds } from '@/features/map/camera/cameraMath';
import { project } from '@/features/map/geo/projection';
import type { MapShape } from '@/features/map/geo/types';
import { colors, radius } from '@/theme/tokens';

import type { Destination } from './types';

export const MiniMap = memo(function MiniMap({
  destination,
  height = 180,
}: {
  destination: Destination;
  height?: number;
}) {
  const [region, setRegion] = useState<ShapeLayer | null>(null);
  const [province, setProvince] = useState<MapShape | null>(null);

  useEffect(() => {
    let alive = true;
    geoRepository
      .loadRegion(destination.regionId)
      .then((r) => alive && setRegion(r))
      .catch(() => undefined);
    geoRepository
      .loadProvince(destination.provinceId)
      .then((p) => alive && setProvince(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [destination.regionId, destination.provinceId]);

  const point = project(destination.longitude, destination.latitude);
  const focus = province?.bounds ?? region?.byId.get(destination.provinceId)?.bounds;

  return (
    <View style={[styles.card, { height }]} accessibilityLabel={`Mapa de ubicación de ${destination.name}`}>
      {focus && (
        <Svg width="100%" height="100%" viewBox={viewBox(padBounds(focus, 0.35))} preserveAspectRatio="xMidYMid meet">
          <G>
            {region?.shapes.map((s) => (
              <Path
                key={s.id}
                d={s.path}
                fill={s.id === destination.provinceId ? 'none' : colors.map.ghost}
                stroke="#FFFFFF"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {province && (
              <Path
                d={province.path}
                fill={colors.map.provinceBase}
                stroke={colors.map.provinceBorder}
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <Circle
              cx={point.x}
              cy={point.y}
              r={pointRadius(focus) * 2.4}
              fill={colors.brand.orange}
              fillOpacity={0.2}
            />
            <Circle
              cx={point.x}
              cy={point.y}
              r={pointRadius(focus)}
              fill={colors.brand.orange}
              stroke="#FFFFFF"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </G>
        </Svg>
      )}
    </View>
  );
});

const viewBox = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
  `${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`;

const pointRadius = (b: { minX: number; maxX: number; minY: number; maxY: number }) =>
  Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.022;

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
});
