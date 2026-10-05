import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { Camera, Viewport } from '../camera/cameraMath';

/**
 * Estilo animado que sitúa una vista en la posición de pantalla de un punto
 * del mundo. Se recalcula en el hilo de UI en cada frame de la cámara, por lo
 * que etiquetas y marcadores siguen al mapa sin re-renderizar React y con
 * tamaño constante (no escalan con el zoom).
 */
export function useScreenPosition(
  camera: SharedValue<Camera>,
  viewport: SharedValue<Viewport>,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
) {
  return useAnimatedStyle(() => {
    const cam = camera.value;
    const vp = viewport.value;
    return {
      transform: [
        { translateX: (x - cam.x) * cam.k + vp.width / 2 + offsetX },
        { translateY: (y - cam.y) * cam.k + vp.height / 2 + offsetY },
      ],
    };
  });
}
