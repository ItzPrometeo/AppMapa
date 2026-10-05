import Animated from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';

/**
 * Sólo se animan los <G>: relleno, opacidad y transformación se heredan a sus
 * hijos. Así el atributo `d` (pesado) de cada <Path> nunca se reescribe
 * durante una animación.
 */
export const AnimatedG = Animated.createAnimatedComponent(G);
export const AnimatedPath = Animated.createAnimatedComponent(Path);
