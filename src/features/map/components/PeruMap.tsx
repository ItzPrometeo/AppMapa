/**
 * PeruMap — nivel 1: las 25 regiones como polígonos independientes.
 *
 * Cada región reacciona a la escena:
 *  - intro: contorno gris → toma su color con una ola de norte a sur
 *  - pressed: se oscurece y crece ~1.5 %
 *  - seleccionada: pasa al morado de selección, "pop" de escala y borde grueso
 *  - resto: se desatura y baja al ~25 % de opacidad; luego casi desaparece
 *  - al revelarse las provincias, el relleno de la región seleccionada se
 *    desvanece (las provincias la cubren exactamente)
 */
import { memo } from 'react';
import { interpolateColor, useAnimatedProps } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { shade } from '@/theme/mapPalette';
import type { MapShape } from '../geo/types';
import { usePressValue } from '../hooks/usePressValue';
import { clamp01, scaleAbout, svgFill, type MapScene } from '../scene';
import { AnimatedG } from './AnimatedSvg';

const { skeleton: skeletonColor, selection: selectionColor, ghost: ghostColor } = colors.map;

type Props = {
  shapes: MapShape[];
  selectedId: string | null;
  pressedId: string | null;
  scene: MapScene;
};

export const PeruMap = memo(function PeruMap({ shapes, selectedId, pressedId, scene }: Props) {
  const minY = Math.min(...shapes.map((s) => s.label.y));
  const maxY = Math.max(...shapes.map((s) => s.label.y));
  // La región seleccionada se dibuja la última para que su "pop" quede encima.
  const ordered = selectedId
    ? [...shapes.filter((s) => s.id !== selectedId), ...shapes.filter((s) => s.id === selectedId)]
    : shapes;

  return (
    <G>
      {ordered.map((shape) => (
        <RegionShape
          key={shape.id}
          shape={shape}
          selected={shape.id === selectedId}
          pressed={shape.id === pressedId}
          introOrder={(shape.label.y - minY) / (maxY - minY || 1)}
          scene={scene}
        />
      ))}
    </G>
  );
});

type ShapeProps = {
  shape: MapShape;
  selected: boolean;
  pressed: boolean;
  introOrder: number;
  scene: MapScene;
};

const RegionShape = memo(function RegionShape({ shape, selected, pressed, introOrder, scene }: ShapeProps) {
  const { regionFocus, regionReveal, regionPulse, intro } = scene;
  // Sólo primitivas dentro del worklet (no copiar geometría al hilo de UI).
  const baseColor = shape.color;
  const pressedColor = shade(baseColor, 0.14);
  const { x: lx, y: ly } = shape.label;

  const press = usePressValue(pressed);

  const animatedProps = useAnimatedProps(() => {
    // Intro: 0–25 % aparece el contorno, luego cada región toma color (norte → sur).
    const outline = clamp01(intro.value / 0.25);
    const colorIn = clamp01((intro.value - 0.25 - introOrder * 0.45) / 0.3);
    let fill = interpolateColor(colorIn, [0, 1], [skeletonColor, baseColor]);
    fill = interpolateColor(press.value, [0, 1], [fill, pressedColor]);

    let opacity = outline;
    let scale = 1 + press.value * 0.015;
    if (selected) {
      fill = interpolateColor(regionFocus.value, [0, 1], [fill, selectionColor]);
      opacity *= 1 - regionReveal.value;
      scale += regionPulse.value * 0.04;
    } else {
      fill = interpolateColor(regionFocus.value, [0, 1], [fill, ghostColor]);
      opacity *= (1 - 0.72 * regionFocus.value) * (1 - 0.25 * regionReveal.value);
    }
    return {
      ...svgFill(fill),
      fillOpacity: opacity,
      strokeOpacity: outline * (selected ? 1 : 1 - 0.6 * regionFocus.value),
      ...scaleAbout(scale, lx, ly),
    };
  });

  return (
    <AnimatedG animatedProps={animatedProps}>
      <Path
        d={shape.path}
        stroke={colors.map.stroke}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </AnimatedG>
  );
});
