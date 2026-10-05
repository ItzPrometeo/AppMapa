import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** `false` sólo cuando sabemos con certeza que no hay conexión. */
export function useIsOnline() {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    [],
  );
  return online;
}
