import { MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../../../design/tokens';
import {
  DiscoveryMapFallback,
  type DiscoveryMapProps,
} from './DiscoveryMapFallback';
import { hasListingCoordinates } from '../domain';
import {
  countListingsInMapBounds,
  getKakaoMapFocusAction,
  getMapMarkerSetKey,
  hasUsableMapLayout,
} from './kakaoMapDomain';
import { loadKakaoMapsSdk } from './kakaoMapsLoader';
import type { KakaoMap, KakaoMapsApi, KakaoMarker } from './kakaoMapsTypes';

type Runtime = {
  maps: KakaoMapsApi;
  map: KakaoMap;
};

type MarkerEntry = {
  listingId: string;
  marker: KakaoMarker;
  clickHandler: () => void;
};

const mapElementStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'auto',
  touchAction: 'none',
  userSelect: 'none',
};

function writeInteractionState(container: HTMLDivElement, map: KakaoMap) {
  const center = map.getCenter();
  container.dataset.mapDraggable = String(map.getDraggable());
  container.dataset.mapZoomable = String(map.getZoomable());
  container.dataset.mapCenter = `${center.getLat()},${center.getLng()}`;
  container.dataset.mapLevel = String(map.getLevel());
}

function logMapLifecycle(
  event: string,
  focused: boolean,
  container: HTMLDivElement | null,
  map: KakaoMap | null,
) {
  if (process.env.NODE_ENV === 'production') return;
  const rect = container?.getBoundingClientRect();
  const target = rect
    ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    : null;
  console.info('[KakaoMap] lifecycle', {
    event,
    focused,
    rect: rect ? { width: rect.width, height: rect.height } : null,
    hasMap: Boolean(map),
    draggable: map?.getDraggable() ?? null,
    level: map?.getLevel() ?? null,
    center: map ? `${map.getCenter().getLat()},${map.getCenter().getLng()}` : null,
    hitTarget: target
      ? {
          tag: target.tagName.toLowerCase(),
          className: typeof target.className === 'string' ? target.className.slice(0, 80) : '',
          insideMap: container?.contains(target) ?? false,
        }
      : null,
  });
}

const kakaoMapKey = process.env.EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? '';

export function DiscoveryMap(props: DiscoveryMapProps) {
  if (!kakaoMapKey) {
    return (
      <DiscoveryMapFallback
        {...props}
        fallbackLabel="Kakao Map 키 없음 · 좌표 지도"
      />
    );
  }

  return <KakaoMapCanvas {...props} appKey={kakaoMapKey} />;
}

function KakaoMapCanvas({
  listings,
  referenceListings,
  selected,
  onSelect,
  fill,
  appKey,
  ...fallbackProps
}: DiscoveryMapProps & { appKey: string }) {
  const focused = useIsFocused();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const activateMapRef = useRef<(() => void) | null>(null);
  const focusedRef = useRef(focused);
  const markersRef = useRef<MarkerEntry[]>([]);
  const selectedIdRef = useRef(selected?.id);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [inViewCount, setInViewCount] = useState(listings.length);
  const markerSetKey = getMapMarkerSetKey(listings);
  const mappableListings = useMemo(
    () => listings.filter(hasListingCoordinates),
    [markerSetKey],
  );
  focusedRef.current = focused;
  selectedIdRef.current = selected?.id;

  useEffect(() => {
    logMapLifecycle('component mounted', focusedRef.current, containerRef.current, mapInstanceRef.current);
    return () => logMapLifecycle('component unmounted', focusedRef.current, containerRef.current, mapInstanceRef.current);
  }, []);

  useEffect(() => {
    let disposed = false;
    let mapsApi: KakaoMapsApi | null = null;
    let tilesLoadedHandler: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let observedWidth = 0;
    let observedHeight = 0;

    setStatus('loading');
    setRuntime(null);

    loadKakaoMapsSdk(appKey)
      .then((maps) => {
        if (disposed || !containerRef.current) return;
        mapsApi = maps;
        const initializeMap = () => {
          const container = containerRef.current;
          if (disposed || !container) return;
          const { width, height } = container.getBoundingClientRect();
          const action = getKakaoMapFocusAction({
            focused: focusedRef.current,
            hasMapInstance: mapInstanceRef.current !== null,
            width,
            height,
          });
          if (action !== 'initialize') return;

          observedWidth = width;
          observedHeight = height;
          const seed = referenceListings.find(hasListingCoordinates) ?? listings.find(hasListingCoordinates);
          const center = new maps.LatLng(seed?.latitude ?? 37.5665, seed?.longitude ?? 126.978);
          const map = new maps.Map(container, {
            center,
            level: 8,
            draggable: true,
            scrollwheel: true,
            keyboardShortcuts: true,
          });
          map.setDraggable(true);
          map.setZoomable(true);
          writeInteractionState(container, map);

          mapInstanceRef.current = map;
          logMapLifecycle('constructor', focusedRef.current, container, map);
          tilesLoadedHandler = () => {
            if (disposed) return;
            maps.event.removeListener(map, 'tilesloaded', tilesLoadedHandler!);
            setStatus('ready');
          };
          maps.event.addListener(map, 'tilesloaded', tilesLoadedHandler);

          setRuntime({ maps, map });
        };

        const activateMap = () => {
          const container = containerRef.current;
          if (disposed || !container) return;
          const { width, height } = container.getBoundingClientRect();
          const map = mapInstanceRef.current;
          const action = getKakaoMapFocusAction({
            focused: focusedRef.current,
            hasMapInstance: map !== null,
            width,
            height,
          });
          logMapLifecycle(`focus action: ${action}`, focusedRef.current, container, map);
          if (action === 'initialize') {
            initializeMap();
            return;
          }
          if (action === 'relayout' && map) {
            observedWidth = width;
            observedHeight = height;
            map.relayout();
            writeInteractionState(container, map);
            logMapLifecycle('focus relayout complete', focusedRef.current, container, map);
          }
        };
        activateMapRef.current = activateMap;

        resizeObserver = new ResizeObserver(([entry]) => {
          if (disposed || !entry) return;
          const { width, height } = entry.contentRect;
          if (!hasUsableMapLayout(width, height)) return;
          if (!focusedRef.current) return;
          const map = mapInstanceRef.current;
          if (!map) {
            initializeMap();
            return;
          }
          if (width === observedWidth && height === observedHeight) return;
          observedWidth = width;
          observedHeight = height;
          map.relayout();
          if (containerRef.current) writeInteractionState(containerRef.current, map);
        });
        resizeObserver.observe(containerRef.current);
        activateMap();
      })
      .catch((error) => {
        if (!disposed) {
          if (process.env.NODE_ENV !== 'production') {
            console.error(
              `[KakaoMap] SDK unavailable: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          setStatus('error');
        }
      });

    return () => {
      disposed = true;
      activateMapRef.current = null;
      resizeObserver?.disconnect();
      if (mapsApi && mapInstanceRef.current && tilesLoadedHandler) {
        mapsApi.event.removeListener(mapInstanceRef.current, 'tilesloaded', tilesLoadedHandler);
      }
      mapInstanceRef.current = null;
    };
  }, [appKey]);

  useEffect(() => {
    logMapLifecycle('focus changed', focused, containerRef.current, mapInstanceRef.current);
    if (focused) activateMapRef.current?.();
  }, [focused]);

  useEffect(() => {
    if (!runtime) return undefined;
    const { maps, map } = runtime;
    const bounds = new maps.LatLngBounds();
    const entries = mappableListings.map((listing) => {
      const position = new maps.LatLng(listing.latitude, listing.longitude);
      const marker = new maps.Marker({
        map,
        position,
        title: listing.complexName,
        clickable: true,
      });
      marker.setZIndex(listing.id === selectedIdRef.current ? 10 : 1);
      const clickHandler = () => onSelect(listing.id);
      maps.event.addListener(marker, 'click', clickHandler);
      bounds.extend(position);
      return { listingId: listing.id, marker, clickHandler };
    });

    markersRef.current = entries;
    setInViewCount(mappableListings.length);
    if (entries.length > 0) {
      map.setBounds(bounds, fill ? 126 : 48, 48, fill ? 176 : 72, 48);
      if (containerRef.current) writeInteractionState(containerRef.current, map);
    }

    return () => {
      entries.forEach(({ marker, clickHandler }) => {
        maps.event.removeListener(marker, 'click', clickHandler);
        marker.setMap(null);
      });
      if (markersRef.current === entries) markersRef.current = [];
    };
  }, [fill, mappableListings, onSelect, runtime]);

  useEffect(() => {
    markersRef.current.forEach(({ listingId, marker }) => {
      marker.setZIndex(listingId === selected?.id ? 10 : 1);
    });
  }, [selected?.id]);

  useEffect(() => {
    if (!runtime) return undefined;
    const { maps, map } = runtime;
    const updateInteractionState = () => {
      if (containerRef.current) writeInteractionState(containerRef.current, map);
    };
    const logDragStart = () => {
      logMapLifecycle('drag start', focusedRef.current, containerRef.current, map);
    };
    const logDragEnd = () => {
      updateInteractionState();
      logMapLifecycle('drag end', focusedRef.current, containerRef.current, map);
    };
    const updateVisibleCount = () => {
      const bounds = map.getBounds();
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();
      setInViewCount(
        countListingsInMapBounds(listings, {
          south: southWest.getLat(),
          west: southWest.getLng(),
          north: northEast.getLat(),
          east: northEast.getLng(),
        }),
      );
      updateInteractionState();
    };

    maps.event.addListener(map, 'drag', updateInteractionState);
    maps.event.addListener(map, 'dragstart', logDragStart);
    maps.event.addListener(map, 'dragend', logDragEnd);
    maps.event.addListener(map, 'idle', updateVisibleCount);
    updateVisibleCount();
    return () => {
      maps.event.removeListener(map, 'drag', updateInteractionState);
      maps.event.removeListener(map, 'dragstart', logDragStart);
      maps.event.removeListener(map, 'dragend', logDragEnd);
      maps.event.removeListener(map, 'idle', updateVisibleCount);
    };
  }, [listings, runtime]);

  if (status === 'error') {
    return (
      <DiscoveryMapFallback
        {...fallbackProps}
        listings={listings}
        referenceListings={referenceListings}
        selected={selected}
        onSelect={onSelect}
        fill={fill}
        fallbackLabel="Kakao 지도 오류 · 좌표 지도"
      />
    );
  }

  return (
    <View style={[styles.map, styles.mapPointerInteractive, fill && styles.mapFill]}>
      <div
        ref={containerRef}
        aria-label={`Kakao 지도, 현재 화면 청약 ${inViewCount}개`}
        data-testid="kakao-discovery-map"
        style={mapElementStyle}
      />

      {status === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Kakao 지도를 불러오는 중이에요</Text>
        </View>
      ) : (
        <View style={[styles.mapBadge, fill && styles.mapBadgeFill]}>
          <MaterialIcons name="place" size={14} color={colors.primary} />
          <Text style={styles.mapBadgeText}>현재 지도 {inViewCount}개</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 520,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: '#ECEAF8',
    ...shadow.card,
  },
  mapFill: {
    flex: 1,
    height: '100%',
    borderRadius: 0,
    borderWidth: 0,
    boxShadow: 'none',
  },
  mapPointerInteractive: { pointerEvents: 'auto' },
  loading: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(252,248,255,0.88)',
    pointerEvents: 'none',
  },
  loadingText: { ...type.bodySm, color: colors.textMuted },
  mapBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    pointerEvents: 'none',
    ...shadow.card,
  },
  mapBadgeFill: { left: spacing.screen, bottom: 164 },
  mapBadgeText: { ...type.micro, color: colors.primary },
});
