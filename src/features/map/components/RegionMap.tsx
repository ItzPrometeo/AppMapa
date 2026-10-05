/**
 * RegionMap — nivel 2: provincias de la región seleccionada.
 *
 * Aparecen escalonadas (`regionReveal`) justo cuando termina el zoom, cubriendo
 * exactamente el contorno de la región. Al elegir una provincia, ésta pasa al
 * color de selección y las demás quedan como contexto tenue y tocable.
 */
import { memo } from 'react';
import { interpolateColor, useAnimatedProps } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';

import { shade } from '@/theme/mapPalette';
import { colors } from '@/theme/tokens';
import type { MapShape } from '../geo/types';
import { usePressValue } from '../hooks/usePressValue';
import { scaleAbout, staggered, svgFill, type MapScene } from '../scene';
import { AnimatedG } from './AnimatedSvg';

const { selection: selectionColor, ghost: ghostColor } = colors.map;

type Props = {
  shapes: MapShape[];
  selectedId: string | null;
  pressedId: string | null;
  scene: MapScene;
};

export const RegionMap = memo(function RegionMap({ shapes, selectedId, pressedId, scene }: Props) {
  // Orden de aparición: de norte a sur, como una lectura natural del mapa.
  const order = new Map([...shapes].sort((a, b) => a.label.y - b.label.y).map((s, i) => [s.id, i]));
  const ordered = selectedId
    ? [...shapes.filter((s) => s.id !== selectedId), ...shapes.filter((s) => s.id === selectedId)]
    : shapes;
  return (
    <G>
      {ordered.map((shape) => (
        <ProvinceShape
          key={shape.id}
          shape={shape}
          index={order.get(shape.id) ?? 0}
          count={shapes.length}
          selected={shape.id === selectedId}
          pressed={shape.id === pressedId}
          scene={scene}
        />
      ))}
    </G>
  );
});

type ShapeProps = {
  shape: MapShape;
  index: number;
  count: number;
  selected: boolean;
  pressed: boolean;
  scene: MapScene;
};

const ProvinceShape = memo(function ProvinceShape({ shape, index, count, selected, pressed, scene }: ShapeProps) {
  const { regionReveal, provinceFocus, provinceReveal, provincePulse } = scene;
  const baseColor = shape.color;
  const pressedColor = shade(baseColor, 0.14);
  const { x: lx, y: ly } = shape.label;
  const press = usePressValue(pressed);

  const animatedProps = useAnimatedProps(() => {
    const appear = staggered(regionReveal.value, index, count, 0.5);
    let fill = interpolateColor(press.value, [0, 1], [baseColor, pressedColor]);
    let opacity = appear;
    // Entrada con un leve "asentamiento": 0.96 → 1.
    let scale = 0.96 + 0.04 * appear + press.value * 0.02;
    if (selected) {
      fill = interpolateColor(provinceFocus.value, [0, 1], [fill, selectionColor]);
      opacity *= 1 - provinceReveal.value;
      scale += provincePulse.value * 0.05;
    } else {
      fill = interpolateColor(provinceFocus.value, [0, 1], [fill, ghostColor]);
      opacity *= 1 - 0.4 * provinceFocus.value;
    }
    return { ...svgFill(fill), fillOpacity: opacity, strokeOpacity: appear, ...scaleAbout(scale, lx, ly) };
  });

  return (
    <AnimatedG animatedProps={animatedProps}>
      <Path
        d={shape.path}
        stroke={colors.map.stroke}
        strokeWidth={selected ? 2.5 : 1.75}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </AnimatedG>
  );
});
