import { Linking, Platform } from 'react-native';

/**
 * Abre la app de mapas del sistema con la ruta hasta el destino.
 * Se evita `canOpenURL` (requiere declarar esquemas en iOS/Android 11+):
 * se intenta el enlace nativo y, si falla, Google Maps web.
 */
export async function openDirections(latitude: number, longitude: number, label: string) {
  const q = encodeURIComponent(label);
  const web = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  const native =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${latitude},${longitude}&q=${q}`
      : Platform.OS === 'android'
        ? `geo:0,0?q=${latitude},${longitude}(${q})`
        : web;
  try {
    await Linking.openURL(native);
  } catch {
    await Linking.openURL(web).catch(() => undefined);
  }
}
