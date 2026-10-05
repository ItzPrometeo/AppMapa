# SPoint · Explora Perú

Mapa interactivo y progresivo del Perú para la app turística **SPoint**:

```
PERÚ ──tap──▶ REGIÓN (zoom) ──tap──▶ PROVINCIA (zoom) ──tap──▶ BOTTOM SHEET ──▶ PÁGINA DEL DESTINO
```

Todo ocurre en **una única superficie continua**: la cámara vuela entre niveles y las capas se
transforman. No hay cambios de pantalla hasta "Ver destino".

- Expo SDK 57 · React Native 0.86 (New Architecture) · TypeScript estricto
- `react-native-svg` para el mapa vectorial · `react-native-reanimated` 4 para cámara y animaciones (hilo de UI)
- `react-native-gesture-handler` para tap / pan / pinch · Expo Router para la navegación
- Datos reales de **geoBoundaries** (ADM1 / ADM2) procesados con un pipeline propio

## Puesta en marcha

```bash
npm install
npm start            # Expo dev server (i = iOS, a = Android, w = web)
npm run check        # typecheck + lint + tests
npm run data         # regenera mapas y destinos (sólo si cambian las fuentes)
```

> Requiere un *development build* (`npx expo run:ios|android` o EAS) o Expo Go del SDK 57.

---

## 1. Experiencia (UX)

| Nivel | Qué ve el usuario | Interacción |
|---|---|---|
| **Perú** | 25 regiones coloreadas, cabecera "Explora Perú", panel *Explorar* con regiones y nº de destinos, tab bar | Tocar región en el mapa o en el panel |
| **Región** | Provincias (aparecen escalonadas al final del zoom), nombre de cada una si cabe, breadcrumb `Perú › Ica`, controles de zoom | Tocar provincia (mapa o chips), tocar una región vecina para saltar, volver |
| **Provincia** | Contorno en alto detalle, marcadores SPoint con aparición escalonada, leyenda-filtro por categoría, carrusel de destinos | Tocar marcador / grupo / tarjeta, pinch y pan, volver |
| **Destino** | Bottom sheet `collapsed · medium · expanded`, marcador seleccionado en naranja con pulso | Arrastrar el sheet, *Ver destino*, *Cómo llegar*, *Guardar* |

**Secuencia al tocar una región** (≈ 750 ms en total):

1. Detección del toque + feedback háptico (estado *pressed*: se oscurece y crece 1,5 %).
2. La región pasa al morado de selección con un "pop" de escala (+4 %) y borde blanco grueso.
3. El resto del Perú se desatura y baja al ~28 % de opacidad.
4. Pausa de 130 ms.
5. Vuelo de cámara `fitBounds(región)` con interpolación *smooth zoom & pan* (van Wijk) y `easeInOutCubic`.
6. Durante el último 45 % del vuelo las demás regiones casi desaparecen y las provincias aparecen
   escalonadas de norte a sur, cubriendo exactamente el contorno de la región (ver §4).

La provincia repite el mismo patrón (highlight → fade → zoom → `fitBounds` → lugares). Los marcadores
aparecen **200 ms después del zoom y cada 100 ms** con `scale 0 → 1.1 → 1` (spring).

**Volver** (botón, breadcrumb, botón atrás de Android o gesto desde el borde izquierdo) ejecuta la
coreografía inversa: los marcadores se ocultan, el contorno detallado se funde, la cámara se aleja y
los colores vuelven.

**Accesibilidad**: la selección nunca depende sólo del color (borde, escala, opacidad, etiqueta y
texto en cabecera); todos los controles tienen ≥ 44 px táctiles y `accessibilityLabel`; los paneles
inferiores son una alternativa navegable al mapa para lectores de pantalla.

## 2. Identidad visual

Tokens en [`src/theme/tokens.ts`](src/theme/tokens.ts) y paleta del mapa en
[`src/theme/mapPalette.ts`](src/theme/mapPalette.ts).

| Token | Valor | Uso |
|---|---|---|
| Morado | `#6C4CF5` | Selección, acciones primarias, marcador |
| Naranja | `#FF7A21` | Marcador seleccionado, "Popular", favoritos |
| Turquesa | `#16B8A6` | Acentos, Naturaleza |
| Azul oscuro | `#102A43` | Marca y sombras |
| Fondo | `#F7F9FC` | Fondo general (también "mar") |
| Texto | `#14213D` | Texto principal |

- Regiones: 6 familias pastel, asignadas a mano para que **ninguna región comparta familia con una
  vecina**. Anclas de marca: Cusco morado, Ica naranja, Arequipa turquesa, Lima azul, Loreto verde.
- Provincias: tono 0–5 asignado por **coloreado de grafos** en el pipeline (vecinas nunca coinciden).
- Bordes blancos de 1,5–2,5 px con `vectorEffect="non-scaling-stroke"` (grosor constante a cualquier zoom).
- Tipografía Plus Jakarta Sans; sombras suaves; sin gradientes agresivos.

## 3. Arquitectura

```
src/
├── app/                              Rutas (Expo Router)
│   ├── _layout.tsx                   Fuentes, providers, Stack
│   ├── (tabs)/                       Explorar · Favoritos · Perfil (tabs headless + barra propia)
│   └── destination/[id].tsx          Página completa del destino
├── features/
│   ├── map/
│   │   ├── ExploreMapScreen.tsx      Composición de la pantalla (header, mapa, sheet, búsqueda…)
│   │   ├── state/
│   │   │   ├── explorerMachine.ts    Máquina de estados PURA (testeada)
│   │   │   └── useMapExplorer.ts     Orquestador: datos + cámara + coreografía
│   │   ├── camera/
│   │   │   ├── cameraMath.ts         fitBounds, centerOn, zoomAround, van Wijk… (worklets puros)
│   │   │   └── useMapCamera.ts       flyTo · animateCamera · fitBounds · zoomTo · zoomBy · gestos
│   │   ├── geo/
│   │   │   ├── projection.ts         Mercator
│   │   │   ├── shapes.ts             GeoJSON → path SVG + anillos para hit-test (una vez)
│   │   │   ├── hitTest.ts            Punto-en-polígono con tolerancia para polígonos diminutos
│   │   │   ├── cluster.ts            Clustering y colocación de etiquetas sin solapes
│   │   │   └── geoRepository.ts      Carga perezosa por nivel + cachés
│   │   ├── scene.ts                  Shared values de la escena (focus / reveal / pulse / intro)
│   │   └── components/
│   │       ├── MapCanvas.tsx         SVG + gestos + transformación de cámara
│   │       ├── PeruMap.tsx           Nivel 1 (regiones)
│   │       ├── RegionMap.tsx         Nivel 2 (provincias)
│   │       ├── ProvinceMap.tsx       Nivel 3 (contorno detallado)
│   │       ├── TouristMarker.tsx     Marcador SPoint
│   │       ├── MarkersLayer.tsx      Clusters + stagger + etiquetas
│   │       ├── MapLabels.tsx         Nombres sobre el mapa
│   │       ├── MapHeader.tsx · MapBreadcrumb.tsx · MapControls.tsx · MapLegend.tsx
│   │       ├── MapBottomSheet.tsx    Sheet arrastrable con detents
│   │       ├── DestinationCard.tsx   Contenido del sheet del destino
│   │       ├── panels/               Paneles del sheet por nivel (Perú / región / provincia)
│   │       └── SearchOverlay.tsx · MapSkeleton.tsx · MapStatusBanner.tsx
│   ├── destinations/                 Tipos, categorías, repositorio, favoritos, imagen, mini mapa
│   └── navigation/                   Tab bar que se oculta al entrar en una región
├── lib/                              cache (LRU + disco), http, haptics, red, direcciones, texto
├── theme/                            tokens y paleta del mapa
└── data/geo/manifest.ts              (generado) índice + cargadores perezosos
```

### Flujo de datos

```
gesto ─▶ MapCanvas ─▶ useMapExplorer.onTap ─▶ hitTest ─▶ dispatch(SELECT_REGION)
                                                              │
                         explorerMachine (estado lógico) ◀────┘
                                   │ efecto: cambió región/provincia
                                   ▼
                         runTransition(from, to)
                          ├─ geoRepository.loadRegion/loadProvince (en paralelo)
                          ├─ escena: focus/pulse/reveal (shared values, hilo UI)
                          └─ cámara: flyTo(fitBounds(...)) → al terminar: marcadores
```

Un **token de transición** invalida la coreografía anterior si el usuario toca otra cosa en mitad
de una animación (la cámara se interrumpe desde su posición actual, sin saltos).

### Estados

`explorerMachine.ts` modela exactamente: `loading · loaded · regionSelected · provinceSelected ·
destinationSelected · empty · error`. `offline` es ortogonal (banner "Sin conexión · usando datos
guardados", la app sigue funcionando con datos locales). Si una provincia no tiene lugares se
muestra *"Aún no tenemos destinos registrados en esta zona."* sin romper la navegación.

## 4. Datos geográficos

Fuente: geoBoundaries `PER-ADM1_simplified` y `PER-ADM2_simplified` (en `data/source/`).
`scripts/build-geo.mjs` (mapshaper) hace:

1. Corrige el UTF-8 doble-codificado ("CaÃ±ete" → "Cañete") y añade tildes/nombres turísticos ("Nasca" → "Nazca").
2. Asigna cada provincia a su región por **join espacial** (punto interior ∈ ADM1). Lima Metropolitana se integra en Lima.
3. Simplifica con **topología compartida** en dos niveles de detalle (LOD).
4. **Genera las regiones disolviendo provincias**: el contorno de una región coincide al píxel con la
   unión de sus provincias → el crossfade región → provincias es perfecto.
5. Calcula `bbox`, punto de etiqueta (**polo de inaccesibilidad**, mejor que el centroide) y tono de color.
6. Escribe archivos por nivel + `manifest.ts` con `require` perezosos.

| Archivo | Contenido | Tamaño |
|---|---|---|
| `assets/maps/peru-regions.geo.json` | 25 regiones (≈ 5 k vértices) | 104 KB |
| `assets/maps/regions/<región>.geo.json` | provincias de esa región (LOD medio) | 3–33 KB |
| `assets/maps/provinces/<provincia>.geo.json` | contorno de una provincia (LOD alto) | 1–20 KB |

Resultado validado por tests: 25 regiones, 196 provincias, Ica = {Chincha, Ica, Nazca, Palpa, Pisco}.

### Destinos

Separados de la geometría. Se editan en `data/destinations.seed.json` y
`scripts/build-destinations.mjs` valida campos/categorías y **asigna región y provincia por
punto-en-polígono real** (islas y litoral: provincia más cercana < 30 km), generando
`assets/data/destinations.json`:

```json
{
  "id": "huacachina", "name": "Huacachina",
  "region": "Ica", "regionId": "ica", "province": "Ica", "provinceId": "ica", "district": "Ica",
  "latitude": -14.0875, "longitude": -75.763,
  "category": "Naturaleza", "image": "", "rating": 4.8, "popularity": 98,
  "subtitle": "Oasis natural", "summary": "Uno de los oasis naturales más conocidos del Perú.",
  "description": "…", "schedule": "Abierto todo el día", "price": "Acceso libre",
  "services": ["Tubulares", "Sandboard"], "tags": ["Aventura", "Atardecer"]
}
```

Incluye 104 lugares de ejemplo en 54 provincias. **Horarios, precios y valoraciones son datos de
muestra** que el equipo de contenido debe validar antes de publicar. Sin `image`, la app genera una
ilustración por categoría (nunca hay huecos grises); con URL usa `expo-image` con caché en disco.

## 5. Cámara

`useMapCamera` expone `fitBounds · flyTo · animateCamera · zoomTo · zoomBy · jumpTo`.

- Modelo `{x, y, k}`: punto del mundo en el centro del viewport y píxeles por unidad.
- `fitBounds` calcula zoom y centro respetando **paddings asimétricos** (cabecera, leyenda, sheet).
- `flyTo` usa *smooth zoom & pan* de van Wijk & Nuij (como `d3.interpolateZoom`); `animateCamera`
  interpola centro lineal + zoom logarítmico (ajustes cortos).
- Duración proporcional a la distancia del vuelo, acotada a 520–1100 ms.
- Todo corre en el hilo de UI: la cámara es un `useDerivedValue` (plan de vuelo + progreso, o
  cámara manual de los gestos). React sólo se entera al **detenerse** (`settled`), momento en que se
  recalculan clusters y etiquetas.
- Pan con inercia (`withDecay`), pinch con foco, límites por nivel con rebote suave.

## 6. Rendimiento (objetivo 60 FPS)

- Un único `<G>` con la matriz de cámara; los `<Path>` nunca se reescriben durante una animación
  (relleno, opacidad y escala se animan en su `<G>` padre y se heredan).
- Pocos shared values (focus/reveal/pulse) gobiernan todos los polígonos; el stagger se calcula a
  partir de un único progreso.
- LOD y carga perezosa: Perú = ADM1; región = sólo sus provincias; provincia = un contorno detallado
  + sus lugares. Nunca se dibujan las 196 provincias a la vez.
- Proyección y paths se calculan una vez por feature y se guardan en LRU de memoria.
- Hit-testing propio con prefiltrado por bbox (sin un `onPress` por polígono).
- Etiquetas y marcadores son vistas nativas posicionadas con `useAnimatedStyle` (tamaño constante,
  sin re-render de React por frame).

## 7. Caché y modo remoto

Por defecto todo va empaquetado (funciona offline desde el primer arranque). Definiendo
`EXPO_PUBLIC_SPOINT_API_URL` los repositorios descargan de un CDN/API:

```
GET {API}/maps/peru-regions.geo.json
GET {API}/maps/regions/{regionId}.geo.json
GET {API}/maps/provinces/{provinceId}.geo.json
GET {API}/destinations?provinceId={provinceId}
```

`lib/cache.ts` implementa caché de dos niveles (LRU en memoria + AsyncStorage con versión y TTL) con
*stale-while-revalidate*: si hay datos guardados se muestran al instante y se refrescan en segundo
plano; si la red falla se usan los guardados o los empaquetados. Favoritos y "vistos recientemente"
también se guardan en el dispositivo.

## 8. Calidad

```bash
npm run typecheck   # TypeScript estricto
npm run lint        # eslint-config-expo (incluye reglas del React Compiler)
npm test            # 27 tests: cámara, máquina de estados, datos, hit-test, clustering, caché
```

Los tests de datos comprueban, entre otras cosas, que **cada destino cae dentro de su provincia** y
que el hit-test identifica correctamente Ica, Cusco, Arequipa, Lima, Loreto y Puno.

### Notas de plataforma

- El flujo completo se verificó en web (Chromium, 390 × 844). En iOS/Android la cámara anima la
  prop nativa `matrix` del `<G>` (Fabric) y en web el atributo `transform`; el relleno animado usa
  `fill` en nativo y estilo CSS en web (ver `scene.ts`).
- Gesto atrás: botón atrás de Android, deslizar desde el borde izquierdo, botón de cabecera y breadcrumb.
- Safe areas en cabecera, sheet, tab bar y página de destino; layout probado a 390 × 844 y adaptable
  a cualquier tamaño (el encuadre se recalcula al cambiar el viewport).
