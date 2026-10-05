/**
 * Feedback háptico con degradación elegante: en web o dispositivos sin motor
 * háptico simplemente no hace nada.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn: () => Promise<void>) => {
  if (enabled) fn().catch(() => undefined);
};

export const haptics = {
  /** Al tocar/presionar un polígono o chip. */
  selection: () => safe(() => Haptics.selectionAsync()),
  /** Al confirmar la entrada a una región o provincia. */
  impact: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Al guardar un favorito. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
