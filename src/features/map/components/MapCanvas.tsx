/**
 * MapCanvas — superficie del mapa.
 *
 *  ┌ GestureDetector (tap · pan · pinch) ┐
 *  │  <Svg>                               │
 *  │    <G matrix={cámara}>  ← hilo de UI  │
 *  │       capas vectoriales (mundo)      │
 *  └──────────────────────────────────────┘
 *  overlay (hermano, encima): etiquetas y marcadores en coordenadas de pantalla
 *
 * El overlay es hermano y no hijo del detector para que los Pressable de los
 * marcadores no compitan con el tap del mapa.
 */
import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedProps } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { cameraMatrix } from '../camera/cameraMath';
import type { MapCameraApi } from '../camera/useMapCamera';
import { svgMatrix } from '../scene';
import { AnimatedG } from './AnimatedSvg';

type Props = {
  camera: MapCameraApi;
  size: { width: number; height: number };
  onLayout: (width: number, height: number) => void;
  onPressIn: (x: number, y: number) => void;
  onPressOut: () => void;
  onTap: (x: number, y: number) => void;
  /** Capas SVG en coordenadas de mundo. */
  children: ReactNode;
  /** Vistas superpuestas en coordenadas de pantalla. */
  overlay?: ReactNode;
  gesturesEnabled?: boolean;
  accessibilityLabel: string;
};

export const MapCanvas = memo(function MapCanvas(props: Props) {
  const { camera, size, onLayout, onPressIn, onPressOut, onTap, children, overlay, accessibilityLabel } = props;
  const gesturesEnabled = props.gesturesEnabled ?? true;
  const { gestures } = camera;
  const cam = camera.camera;
  const vp = camera.viewport;

  const cameraProps = useAnimatedProps(() => {
    const [a, b, c, d, e, f] = cameraMatrix(cam.value, vp.value);
    return svgMatrix(a, b, c, d, e, f);
  });

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(12)
      .maxDuration(500)
      .runOnJS(true)
      .onBegin((e) => onPressIn(e.x, e.y))
      .onEnd((e, success) => {
        if (success) onTap(e.x, e.y);
      })
      .onFinalize(() => onPressOut());

    const pan = Gesture.Pan()
      .enabled(gesturesEnabled)
      .maxPointers(1)
      .minDistance(8)
      .onStart(() => gestures.begin())
      .onUpdate((e) => gestures.pan(e.translationX, e.translationY))
      .onEnd((e) => gestures.panEnd(e.velocityX, e.velocityY));

    const pinch = Gesture.Pinch()
      .enabled(gesturesEnabled)
      .onUpdate((e) => gestures.pinch(e.scale, e.focalX, e.focalY))
      .onEnd(() => gestures.pinchEnd());

    return Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);
  }, [gestures, gesturesEnabled, onPressIn, onPressOut, onTap]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) onLayout(width, height);
  };

  return (
    <View style={styles.fill} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <View style={styles.fill} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
          {size.width > 0 && (
            <Svg width={size.width} height={size.height} style={styles.svg}>
              <AnimatedG animatedProps={cameraProps}>{children}</AnimatedG>
            </Svg>
          )}
        </View>
      </GestureDetector>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {overlay}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  svg: { position: 'absolute', left: 0, top: 0 },
});
