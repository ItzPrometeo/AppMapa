/**
 * Capa de lugares turísticos del nivel 3.
 *
 * - Agrupa en clusters según el zoom en reposo (`settled`).
 * - Decide qué nombres caben sin solaparse.
 * - Primera aparición escalonada: 200 ms tras el zoom y +100 ms por marcador.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Destination } from '@/features/destinations/types';
import { colors, fonts, motion, shadow } from '@/theme/tokens';
import { worldToScreen, type Camera, type Viewport } from '../camera/cameraMath';
import { clusterPoints, estimateLabelWidth, placeLabels, type Cluster } from '../geo/cluster';
import { project } from '../geo/projection';
import { useScreenPosition } from '../hooks/useScreenPosition';
import { TouristMarker } from './TouristMarker';

type Point = { id: string; x: number; y: number; popularity: number; destination: Destination };

type Props = {
  destinations: Destination[];
  camera: SharedValue<Camera>;
  viewport: SharedValue<Viewport>;
  /** Cámara en reposo: determina clusters y etiquetas. */
  settled: Camera | null;
  viewportSize: Viewport;
  visible: boolean;
  /** Date.now() del momento en que se mostraron: base de la aparición escalonada. */
  revealAt: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClusterPress: (cluster: Cluster<Point>) => void;
};

export const MarkersLayer = memo(function MarkersLayer(props: Props) {
  const {
    destinations,
    camera,
    viewport,
    settled,
    viewportSize,
    visible,
    revealAt,
    selectedId,
    onSelect,
    onClusterPress,
  } = props;

  const points = useMemo<Point[]>(
    () =>
      destinations.map((d) => {
        const p = project(d.longitude, d.latitude);
        return { id: d.id, x: p.x, y: p.y, popularity: d.popularity, destination: d };
      }),
    [destinations],
  );

  const k = settled?.k ?? 1;
  const clusters = useMemo(() => {
    const result = clusterPoints(points, k, 42);
    // El seleccionado nunca queda escondido dentro de un grupo.
    if (!selectedId) return result;
    return result.flatMap((c) => {
      if (c.members.length === 1 || !c.members.some((m) => m.id === selectedId)) return [c];
      const sel = c.members.find((m) => m.id === selectedId)!;
      const rest = c.members.filter((m) => m.id !== selectedId);
      const single = { id: sel.id, x: sel.x, y: sel.y, members: [sel], bounds: c.bounds };
      if (rest.length === 1) return [single, { ...single, id: rest[0].id, x: rest[0].x, y: rest[0].y, members: rest }];
      return [
        single,
        { ...c, id: `cluster:${rest.map((m) => m.id).join('+')}`, members: rest, x: rest[0].x, y: rest[0].y },
      ];
    });
  }, [points, k, selectedId]);

  const labelled = useMemo(() => {
    if (!settled) return new Set<string>();
    return placeLabels(
      clusters
        .filter((c) => c.members.length === 1)
        .map((c) => {
          const s = worldToScreen(c.x, c.y, settled, viewportSize);
          const d = c.members[0].destination;
          return { id: c.id, sx: s.x, sy: s.y, width: estimateLabelWidth(d.name), priority: d.popularity };
        }),
    );
  }, [clusters, settled, viewportSize]);

  // Orden de aparición estable por popularidad (lo más relevante primero).
  const revealOrder = useMemo(() => {
    const order = new Map<string, number>();
    [...clusters]
      .sort((a, b) => b.members[0].popularity - a.members[0].popularity)
      .forEach((c, i) => order.set(c.id, i));
    return order;
  }, [clusters]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {clusters.map((c) => {
        // 200 ms tras el zoom + 100 ms por marcador, contados desde `revealAt`:
        // un marcador que aparece más tarde (al reagrupar) no espera.
        const appearAt = revealAt + motion.markerDelay + (revealOrder.get(c.id) ?? 0) * motion.markerStagger;
        if (c.members.length > 1) {
          return (
            <ClusterMarker
              key={c.id}
              cluster={c}
              camera={camera}
              viewport={viewport}
              visible={visible}
              appearAt={appearAt}
              onPress={onClusterPress}
            />
          );
        }
        const d = c.members[0].destination;
        return (
          <TouristMarker
            key={c.id}
            id={d.id}
            name={d.name}
            category={d.category}
            popularity={d.popularity}
            x={c.x}
            y={c.y}
            camera={camera}
            viewport={viewport}
            appearAt={appearAt}
            visible={visible}
            selected={d.id === selectedId}
            showLabel={labelled.has(c.id)}
            onPress={onSelect}
          />
        );
      })}
    </View>
  );
});

const CLUSTER = 44;

function ClusterMarker({
  cluster,
  camera,
  viewport,
  visible,
  appearAt,
  onPress,
}: {
  cluster: Cluster<Point>;
  camera: SharedValue<Camera>;
  viewport: SharedValue<Viewport>;
  visible: boolean;
  appearAt: number;
  onPress: (c: Cluster<Point>) => void;
}) {
  const position = useScreenPosition(camera, viewport, cluster.x, cluster.y, -CLUSTER / 2, -CLUSTER / 2);
  const appear = useSharedValue(0);
  useEffect(() => {
    if (!visible) {
      appear.set(withTiming(0, { duration: 150 }));
      return;
    }
    if (appear.get() > 0.99) return; // ya visible: no repetir la animación
    appear.set(withDelay(Math.max(0, appearAt - Date.now()), withSpring(1, motion.springBouncy)));
  }, [visible, appearAt, appear]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, appear.value * 1.5),
    transform: [{ scale: appear.value }],
  }));
  const names = cluster.members.map((m) => m.destination.name).join(', ');

  return (
    // Posición (fuera) y escala de aparición (dentro) en vistas separadas:
    // dos `transform` en el mismo estilo se pisarían.
    <Animated.View style={[styles.clusterAnchor, position]}>
      <Animated.View style={style}>
        <Pressable
          onPress={() => onPress(cluster)}
          accessibilityRole="button"
          accessibilityLabel={`${cluster.members.length} lugares: ${names}. Toca para acercar.`}
          style={styles.cluster}
        >
          <View style={styles.clusterStack} />
          <View style={styles.clusterFace}>
            <MaterialCommunityIcons name="map-marker-multiple" size={12} color={colors.brand.purple} />
            <Text style={styles.clusterText}>{cluster.members.length}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clusterAnchor: { position: 'absolute', left: 0, top: 0, width: CLUSTER, height: CLUSTER },
  cluster: { width: CLUSTER, height: CLUSTER, alignItems: 'center', justifyContent: 'center' },
  clusterStack: {
    position: 'absolute',
    width: CLUSTER - 4,
    height: CLUSTER - 4,
    borderRadius: CLUSTER,
    backgroundColor: colors.brand.purpleSoft,
    transform: [{ translateX: 3 }, { translateY: -3 }],
  },
  clusterFace: {
    width: CLUSTER - 4,
    height: CLUSTER - 4,
    borderRadius: CLUSTER,
    backgroundColor: colors.surface,
    borderWidth: 2.5,
    borderColor: colors.brand.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    ...shadow.md,
  },
  clusterText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.brand.purple },
});
