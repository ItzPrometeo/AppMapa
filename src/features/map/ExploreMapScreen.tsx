/**
 * Pantalla "Explorar": una única superficie continua para los tres niveles.
 *
 *   PERÚ ──tap región──▶ REGIÓN ──tap provincia──▶ PROVINCIA ──tap lugar──▶ BOTTOM SHEET ──▶ /destination/[id]
 *
 * No hay cambios de pantalla entre niveles: la cámara vuela y las capas se
 * transforman. Sólo "Ver destino" abre una página nueva (con transición desde abajo).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { AVATAR_MAP_CONFIG } from '@/features/avatar/avatarMapConfig';
import { AvatarLayer } from '@/features/avatar/AvatarLayer';
import { preloadExplorerModel } from '@/features/avatar/loadExplorerModel';
import { useAvatarMapController } from '@/features/avatar/useAvatarMapController';
import { useSaved } from '@/features/destinations/favorites';
import { TAB_BAR_HEIGHT, tabBarStore } from '@/features/navigation/tabBarStore';
import { openDirections } from '@/lib/directions';
import { haptics } from '@/lib/haptics';
import { pluralize } from '@/lib/text';
import { colors, motion, type } from '@/theme/tokens';

import { DestinationCard } from './components/DestinationCard';
import { MapBottomSheet } from './components/MapBottomSheet';
import type { Crumb } from './components/MapBreadcrumb';
import { MapCanvas } from './components/MapCanvas';
import { MapControls } from './components/MapControls';
import { MapHeader } from './components/MapHeader';
import { MapLabels } from './components/MapLabels';
import { MapLegend } from './components/MapLegend';
import { MapSkeleton } from './components/MapSkeleton';
import { MapStatusBanner } from './components/MapStatusBanner';
import { MarkersLayer } from './components/MarkersLayer';
import { CountryPanel } from './components/panels/CountryPanel';
import { ProvincePanel } from './components/panels/ProvincePanel';
import { RegionPanel } from './components/panels/RegionPanel';
import { PeruMap } from './components/PeruMap';
import { ProvinceMap } from './components/ProvinceMap';
import { RegionMap } from './components/RegionMap';
import { SearchOverlay } from './components/SearchOverlay';
import { geoRepository } from './geo/geoRepository';
import type { Level } from './state/explorerMachine';
import { useMapExplorer } from './state/useMapExplorer';

/** Alturas visibles del bottom sheet (sin el inset inferior del dispositivo). */
const SHEET = {
  country: 138,
  region: 138,
  provincePeek: 84,
  province: 196,
  provinceEmpty: 230,
  destCollapsed: 112,
  destMedium: 312,
} as const;
const LEGEND_HEIGHT = 52;

export function ExploreMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const saved = useSaved();
  const [searchOpen, setSearchOpen] = useState(false);

  // Altura estimada de la cabecera por nivel (determinista: la cámara la
  // necesita ANTES de que la nueva cabecera se mida).
  const headerHeight = useCallback(
    (level: Level) => insets.top + 8 + 44 + 10 + 34 + 4 + (level === 'country' ? 0 : 22) + 22,
    [insets.top],
  );

  const insetsFor = useCallback(
    (level: Level, opts?: { destinationOpen?: boolean }) => {
      const top = headerHeight(level) + (level === 'province' ? LEGEND_HEIGHT : 0);
      if (opts?.destinationOpen) return { top, bottom: SHEET.destMedium + insets.bottom };
      if (level === 'country') return { top, bottom: SHEET.country + TAB_BAR_HEIGHT + insets.bottom };
      if (level === 'region') return { top, bottom: SHEET.region + insets.bottom };
      return { top, bottom: SHEET.province + insets.bottom };
    },
    [headerHeight, insets.bottom],
  );

  // El mapa espera un instante antes de hacer zoom para que el guía mire y dé unos pasos.
  const ex = useMapExplorer(insetsFor, { preZoomDelayMs: AVATAR_MAP_CONFIG.transition.zoomStartDelayMs });

  // El GLB se carga una sola vez al entrar en el módulo de mapa.
  useEffect(() => preloadExplorerModel(), []);
  const { state, level, display, actions } = ex;

  // ---- Barra inferior: visible sólo en el nivel Perú ------------------------
  const tabsVisible = level === 'country' && !searchOpen;
  useEffect(() => {
    tabBarStore.setHidden(!tabsVisible);
  }, [tabsVisible]);
  useFocusEffect(
    useCallback(() => {
      tabBarStore.setHidden(!tabsVisible);
      return () => tabBarStore.setHidden(false);
    }, [tabsVisible]),
  );
  const sheetBottom = useSharedValue(TAB_BAR_HEIGHT + insets.bottom);
  useEffect(() => {
    sheetBottom.set(
      withTiming(tabsVisible ? TAB_BAR_HEIGHT + insets.bottom : 0, {
        duration: 320,
        easing: motion.easeInOutCubic,
      }),
    );
  }, [tabsVisible, insets.bottom, sheetBottom]);

  // ---- Bottom sheet: contenido y detents según el modo ---------------------
  const destination = ex.selectedDestination;
  const mode: 'none' | 'country' | 'region' | 'province' | 'destination' =
    state.phase === 'loading' || state.phase === 'error' ? 'none' : destination ? 'destination' : level;
  const safeBottom = mode === 'country' ? 0 : insets.bottom;
  const isEmpty = state.phase === 'empty';
  const snapPoints = useMemo(() => {
    switch (mode) {
      case 'destination':
        return [SHEET.destCollapsed, SHEET.destMedium, Math.round(windowHeight * 0.86) - safeBottom].map(
          (h) => h + safeBottom,
        );
      case 'province':
        return isEmpty
          ? [SHEET.provinceEmpty + safeBottom]
          : [SHEET.provincePeek + safeBottom, SHEET.province + safeBottom];
      case 'region':
        return [SHEET.region + safeBottom];
      default:
        return [SHEET.country];
    }
  }, [mode, isEmpty, safeBottom, windowHeight]);
  const defaultIndex = mode === 'destination' || mode === 'province' ? Math.min(1, snapPoints.length - 1) : 0;
  // Al cambiar el contenido, el sheet vuelve a su detent por defecto
  // (estado derivado: se reinicia durante el render, sin efectos en cascada).
  const sheetKey = `${mode}:${destination?.id ?? ''}:${snapPoints.length}`;
  const [sheet, setSheet] = useState({ key: sheetKey, index: defaultIndex });
  if (sheet.key !== sheetKey) setSheet({ key: sheetKey, index: defaultIndex });
  const sheetIndex = sheet.key === sheetKey ? sheet.index : defaultIndex;
  const setSheetIndex = useCallback((index: number) => setSheet((s) => ({ ...s, index })), []);

  // ---- Avatar guía ------------------------------------------------------------
  // Se oculta con la búsqueda abierta o la ficha expandida (nunca tapa una tarjeta).
  const avatar = useAvatarMapController(ex, {
    insetsFor,
    hidden: searchOpen || mode === 'none' || (mode === 'destination' && sheetIndex === snapPoints.length - 1),
  });

  // ---- Cabecera ---------------------------------------------------------------
  const regionName = state.regionId ? geoRepository.regionName(state.regionId) : '';
  const provinceName = state.provinceId ? geoRepository.provinceName(state.provinceId) : '';
  const header = useMemo(() => {
    const peru: Crumb = { key: 'peru', label: 'Perú', onPress: () => actions.goTo('country') };
    if (level === 'country') {
      return { title: 'Explora Perú', subtitle: 'Descubre destinos increíbles en cada región.', crumbs: [peru] };
    }
    if (level === 'region') {
      return {
        title: regionName,
        subtitle: 'Selecciona una provincia',
        crumbs: [peru, { key: `r-${state.regionId}`, label: regionName }],
      };
    }
    const count = state.destinations?.length;
    return {
      title: `Provincia de ${provinceName}`,
      subtitle:
        count === undefined
          ? 'Cargando destinos…'
          : count === 0
            ? 'Sin destinos registrados por ahora'
            : `${pluralize(count, 'destino', 'destinos')} · toca un lugar`,
      crumbs: [
        peru,
        { key: `r-${state.regionId}`, label: regionName, onPress: () => actions.goTo('region') },
        { key: `p-${state.provinceId}`, label: provinceName },
      ],
    };
  }, [actions, level, provinceName, regionName, state.destinations, state.provinceId, state.regionId]);

  // ---- Gesto de volver desde el borde izquierdo (estilo iOS) -----------------
  const edgeBack = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX(24)
        .failOffsetY([-24, 24])
        .onEnd((e) => {
          if (e.translationX > 70 || e.velocityX > 600) {
            haptics.selection();
            actions.back();
          }
        }),
    [actions],
  );

  // ---- Acciones del destino --------------------------------------------------
  const openDestinationPage = useCallback(() => {
    if (!destination) return;
    saved.markViewed(destination.id);
    router.push({ pathname: '/destination/[id]', params: { id: destination.id } });
  }, [destination, router, saved]);

  const toggleSave = useCallback(() => {
    if (!destination) return;
    if (saved.toggleFavorite(destination.id)) haptics.success();
    else haptics.selection();
  }, [destination, saved]);

  // ---- Render -------------------------------------------------------------------
  if (state.phase === 'error') {
    return (
      <View style={[styles.screen, styles.center, { paddingHorizontal: 32 }]}>
        <Text style={[type.title, styles.textCenter]}>No pudimos cargar el mapa</Text>
        <Text style={[type.subhead, styles.textCenter]}>Revisa tu conexión e inténtalo de nuevo.</Text>
        <Button label="Reintentar" icon="refresh" onPress={actions.retry} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const topInset = insetsFor(level).top;
  const regionShapesReady = ex.regionLayer && ex.regionLayer.id === display.regionId;

  return (
    <View style={styles.screen}>
      <MapCanvas
        camera={ex.camera}
        size={ex.size}
        onLayout={actions.onLayout}
        onPressIn={actions.onPressIn}
        onPressOut={actions.onPressOut}
        onTap={actions.onTap}
        accessibilityLabel={
          level === 'country'
            ? 'Mapa del Perú dividido en regiones. Usa la lista inferior para elegir una región.'
            : `Mapa de ${level === 'region' ? regionName : provinceName}`
        }
        overlay={
          // Orden de capas: marcadores → avatar → etiquetas importantes (→ UI fuera del mapa).
          <>
            {display.provinceId && state.destinations && (
              <MarkersLayer
                destinations={ex.destinations}
                camera={ex.camera.camera}
                viewport={ex.camera.viewport}
                settled={ex.settled}
                viewportSize={ex.size}
                visible={ex.markersVisible}
                revealAt={ex.markersRevealAt}
                selectedId={state.destinationId}
                onSelect={actions.selectDestination}
                onClusterPress={actions.onClusterPress}
              />
            )}
            <AvatarLayer avatar={avatar} />
            <MapLabels
              items={ex.labels.items}
              size={ex.labels.size}
              camera={ex.camera.camera}
              viewport={ex.camera.viewport}
            />
          </>
        }
      >
        {ex.country && (
          <PeruMap shapes={ex.country.shapes} selectedId={display.regionId} pressedId={ex.pressedId} scene={ex.scene} />
        )}
        {regionShapesReady && (
          <RegionMap
            shapes={ex.regionLayer!.shapes}
            selectedId={display.provinceId}
            pressedId={ex.pressedId}
            scene={ex.scene}
          />
        )}
        {ex.provinceShape && display.provinceId === ex.provinceShape.id && (
          <ProvinceMap shape={ex.provinceShape} scene={ex.scene} />
        )}
      </MapCanvas>

      {state.phase === 'loading' && <MapSkeleton />}

      <MapHeader
        title={header.title}
        subtitle={header.subtitle}
        crumbs={header.crumbs}
        onBack={ex.canGoBack && level !== 'country' ? actions.back : undefined}
        onSearch={() => setSearchOpen(true)}
        onFavorites={() => router.navigate('/favorites')}
      />

      {level === 'province' && state.destinations && state.destinations.length > 0 && (
        <View style={[styles.legend, { top: headerHeight('province') - 6 }]} pointerEvents="box-none">
          <MapLegend destinations={state.destinations} selected={state.categoryFilter} onSelect={actions.setFilter} />
        </View>
      )}

      <View style={[styles.banners, { top: topInset + 4 }]} pointerEvents="box-none">
        {!ex.isOnline && <MapStatusBanner kind="offline" message="Sin conexión · usando datos guardados" />}
        {ex.notice && <MapStatusBanner kind="error" message={ex.notice} onDismiss={ex.dismissNotice} />}
      </View>

      {level !== 'country' && !destination && (
        <View style={[styles.controls, { top: topInset + 8 }]} pointerEvents="box-none">
          <MapControls
            onZoomIn={actions.zoomIn}
            onZoomOut={actions.zoomOut}
            onRecenter={actions.recenter}
            // "Cerca de mí" sólo en el nivel local: allí la ubicación real tiene sentido geográfico.
            onLocate={level === 'province' ? avatar.locate : undefined}
            locating={avatar.locating}
          />
        </View>
      )}

      {mode !== 'none' && (
        <MapBottomSheet
          snapPoints={snapPoints}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          bottomOffset={sheetBottom}
          accessibilityLabel="Panel de exploración"
        >
          {(progress) => {
            if (mode === 'destination' && destination) {
              return (
                <DestinationCard
                  destination={destination}
                  progress={progress}
                  expanded={sheetIndex === snapPoints.length - 1}
                  saved={saved.isFavorite(destination.id)}
                  onClose={actions.clearDestination}
                  onOpen={openDestinationPage}
                  onDirections={() => openDirections(destination.latitude, destination.longitude, destination.name)}
                  onToggleSave={toggleSave}
                  bottomInset={insets.bottom}
                />
              );
            }
            if (mode === 'province') {
              return (
                <ProvincePanel
                  provinceName={provinceName}
                  destinations={state.destinations === null ? null : ex.destinations}
                  filtered={Boolean(state.categoryFilter)}
                  onSelect={actions.selectDestination}
                  onBack={actions.back}
                />
              );
            }
            if (mode === 'region' && state.regionId && regionShapesReady) {
              return (
                <RegionPanel
                  regionId={state.regionId}
                  regionName={regionName}
                  provinces={ex.regionLayer!.shapes}
                  onSelect={(id) => actions.selectProvince(id, state.regionId!)}
                />
              );
            }
            if (mode === 'country' && ex.country) {
              return <CountryPanel regions={ex.country.shapes} onSelect={actions.selectRegion} />;
            }
            return null;
          }}
        </MapBottomSheet>
      )}

      {ex.canGoBack && (
        <GestureDetector gesture={edgeBack}>
          <View style={styles.edge} accessibilityElementsHidden />
        </GestureDetector>
      )}

      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onRegion={actions.selectRegion}
          onProvince={actions.selectProvince}
          onDestination={actions.openDestination}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  textCenter: { textAlign: 'center' },
  legend: { position: 'absolute', left: 0, right: 0 },
  banners: { position: 'absolute', left: 16, right: 16, gap: 8, alignItems: 'center' },
  controls: { position: 'absolute', right: 16 },
  edge: { position: 'absolute', left: 0, top: 120, bottom: 160, width: 18 },
});
