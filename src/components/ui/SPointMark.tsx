import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/** Isotipo de SPoint: un punto de mapa con la "S" de ruta. */
export function SPointMark({ size = 28 }: { size?: number }) {
  const gid = `spoint${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="SPoint">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7B5CFF" />
          <Stop offset="1" stopColor="#5236D8" />
        </LinearGradient>
      </Defs>
      <Path d="M16 2C9.4 2 4 7.2 4 13.7 4 22.3 16 30 16 30s12-7.7 12-16.3C28 7.2 22.6 2 16 2Z" fill={`url(#${gid})`} />
      <Path
        d="M19.6 10.2c-.8-1-2.1-1.6-3.6-1.6-2.1 0-3.7 1.2-3.7 3 0 3.8 7.6 2.2 7.6 6.3 0 1.9-1.7 3.3-4 3.3-1.7 0-3.1-.7-3.9-1.9"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="22.6" cy="8" r="2.6" fill="#FF7A21" stroke="#FFFFFF" strokeWidth={1.2} />
    </Svg>
  );
}
