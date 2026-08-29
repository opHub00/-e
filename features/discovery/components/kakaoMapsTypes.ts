export type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

export type KakaoLatLngBounds = {
  extend(position: KakaoLatLng): void;
  contain(position: KakaoLatLng): boolean;
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
};

export type KakaoMap = {
  getBounds(): KakaoLatLngBounds;
  getCenter(): KakaoLatLng;
  getDraggable(): boolean;
  getLevel(): number;
  getZoomable(): boolean;
  relayout(): void;
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ): void;
  setDraggable(draggable: boolean): void;
  setZoomable(zoomable: boolean): void;
};

export type KakaoMarker = {
  setMap(map: KakaoMap | null): void;
  setZIndex(zIndex: number): void;
};

type KakaoMapOptions = {
  center: KakaoLatLng;
  level?: number;
  draggable?: boolean;
  scrollwheel?: boolean;
  keyboardShortcuts?: boolean;
};

export type KakaoMapsApi = {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Marker: new (options: {
    map: KakaoMap;
    position: KakaoLatLng;
    title?: string;
    clickable?: boolean;
  }) => KakaoMarker;
  event: {
    addListener(target: unknown, type: string, handler: () => void): void;
    removeListener(target: unknown, type: string, handler: () => void): void;
  };
};

export type KakaoGlobal = {
  maps: KakaoMapsApi;
};

declare global {
  interface Window {
    kakao?: KakaoGlobal;
  }
}
