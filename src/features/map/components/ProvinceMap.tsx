/**
 * ProvinceMap — nivel 3: contorno en alto detalle de la provincia abierta.
 *
 * Funciona como "suelo" sobre el que aparecen los marcadores: un relleno muy
 * claro con borde de marca y un halo suave. Se carga sólo al entrar en la
 * provincia (LOD alto), y se desvanece (`provinceReveal`) al volver.
 */
import { memo } from 'react';
import { useAnimatedProps } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import type { MapShape } from '../geo/types';
import type { MapScene } from '../scene';
import { AnimatedG } from './AnimatedSvg';

type Props = { shape: MapShape; scene: MapScene };

export const ProvinceMap = memo(function ProvinceMap({ shape, scene }: Props) {
  const { provinceReveal } = scene;

  const haloProps = useAnimatedProps(() => ({ strokeOpacity: provinceReveal.value * 0.14 }));
  const bodyProps = useAnimatedProps(() => ({
    fillOpacity: provinceReveal.value,
    strokeOpacity: provinceReveal.value,
  }));

  return (
    <G>
      <AnimatedG animatedProps={haloProps}>
        <Path
          d={shape.path}
          fill="none"
          stroke={colors.map.provinceBorder}
          strokeWidth={12}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </AnimatedG>
      <AnimatedG animatedProps={bodyProps}>
        <Path
          d={shape.path}
          fill={colors.map.provinceBase}
          stroke={colors.map.provinceBorder}
          strokeWidth={2.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </AnimatedG>
    </G>
  );
});
