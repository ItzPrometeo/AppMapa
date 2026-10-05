import { useEffect } from 'react';
import { useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

/** 0→1 rápido al presionar y retorno con spring al soltar. */
export function usePressValue(pressed: boolean) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.set(pressed ? withTiming(1, { duration: 90 }) : withSpring(0, motion.spring));
  }, [pressed, value]);
  return value;
}
