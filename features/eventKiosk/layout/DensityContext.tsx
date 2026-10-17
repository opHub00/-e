import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useKioskWidth } from '../ui/useKioskWidth';
import { applySpacing, DENSITY, deriveDensity, densityFor, type Density, type DensityTokens, type Spacing, type ViewportProfile } from './density';
import { DENSITY_TYPE, type DensityType } from './densityType';

/**
 * 화면 밀도 공급자. 행사 화면 틀(KioskFrame)이 한 번 정하고, 안쪽 component 는 useDensity() 로 읽는다.
 *
 * 정적으로 미리 그린 HTML 과 첫 화면이 같아야 하므로(hydration), 붙기 전에는 comfortable 로 그린다.
 * 지금의 행사 UI 가 comfortable 이라 붙기 전후 모습이 iPad 에서는 같다.
 */
const DensityContext = createContext<Density | null>(null);

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') { setCoarse(true); return; }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(pointer: coarse)');
    setCoarse(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return coarse;
}

/** 화면 폭으로 밀도를 정한다. 이미 위에서 정해져 있으면 그 값을 쓴다(중첩된 틀이 다시 계산하지 않게). */
export function useResolvedDensity(): Density {
  const parent = useContext(DensityContext);
  const width = useKioskWidth();
  const coarse = useCoarsePointer();
  return parent ?? densityFor(width, { coarsePointer: coarse });
}

export function DensityProvider({ children, density }: { children: ReactNode; density?: Density }) {
  const resolved = useResolvedDensity();
  return <DensityContext.Provider value={density ?? resolved}>{children}</DensityContext.Provider>;
}

/** 창 높이. 붙기 전에는 0(정적 화면과 같게 comfortable 간격). */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => setHeight(window.innerHeight);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return height;
}

/** 폭·높이·입력 방식을 함께 본 화면 성격(deriveDensity). */
export function useViewportProfile(contentType?: Parameters<typeof deriveDensity>[0]['contentType']): ViewportProfile {
  const width = useKioskWidth();
  const height = useViewportHeight();
  const coarse = useCoarsePointer();
  const parent = useContext(DensityContext);
  const profile = deriveDensity({ width, height, pointerType: coarse ? 'coarse' : 'fine', contentType });
  return parent ? { ...profile, density: parent } : profile;
}

/** 지금 화면의 밀도와 그 token(높이에 따른 간격 단계까지 반영). 공급자 밖에서는 폭으로 직접 계산한다. */
export function useDensity(): { density: Density; spacing: Spacing; shortHeight: boolean; d: DensityTokens & { type: DensityType } } {
  const density = useResolvedDensity();
  const { spacing, shortHeight } = useViewportProfile();
  return { density, spacing, shortHeight, d: { ...applySpacing(DENSITY[density], spacing), type: DENSITY_TYPE[density] } };
}
