import { fonts, tracking } from '../../../design/tokens';
import type { Density } from './density';

/**
 * 밀도별 글자 크기. 의미 단위(page·section·cardTitle·body…)는 같고 크기만 다르다.
 * 글꼴·자간은 design/tokens 의 값만 쓴다.
 */
type TextToken = { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number };
export type DensityType = Record<'page' | 'section' | 'cardTitle' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'button' | 'buttonLarge', TextToken>;

const t = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing: number): TextToken => ({ fontFamily, fontSize, lineHeight, letterSpacing });

export const DENSITY_TYPE: Record<Density, DensityType> = {
  compact: {
    page: t(fonts.bold, 28, 38, tracking.headline),
    section: t(fonts.bold, 19, 27, tracking.tight),
    cardTitle: t(fonts.semibold, 17, 24, tracking.snug),
    body: t(fonts.regular, 15, 22, tracking.normal),
    bodyStrong: t(fonts.semibold, 15, 22, tracking.normal),
    label: t(fonts.semibold, 13, 18, tracking.normal),
    caption: t(fonts.regular, 13, 19, tracking.normal),
    button: t(fonts.semibold, 15, 21, tracking.normal),
    buttonLarge: t(fonts.semibold, 17, 24, tracking.snug),
  },
  comfortable: {
    page: t(fonts.bold, 36, 50, tracking.headline),
    section: t(fonts.bold, 24, 36, tracking.tight),
    cardTitle: t(fonts.bold, 24, 36, tracking.tight),
    body: t(fonts.regular, 18, 27, tracking.normal),
    bodyStrong: t(fonts.semibold, 18, 27, tracking.normal),
    label: t(fonts.semibold, 16, 24, tracking.normal),
    caption: t(fonts.regular, 14, 21, tracking.normal),
    button: t(fonts.semibold, 20, 30, tracking.snug),
    buttonLarge: t(fonts.bold, 24, 36, tracking.tight),
  },
  touch: {
    page: t(fonts.bold, 26, 36, tracking.headline),
    section: t(fonts.bold, 20, 28, tracking.tight),
    cardTitle: t(fonts.bold, 19, 27, tracking.tight),
    body: t(fonts.regular, 16, 24, tracking.normal),
    bodyStrong: t(fonts.semibold, 16, 24, tracking.normal),
    label: t(fonts.semibold, 14, 20, tracking.normal),
    caption: t(fonts.regular, 13, 19, tracking.normal),
    button: t(fonts.semibold, 17, 24, tracking.snug),
    buttonLarge: t(fonts.bold, 19, 27, tracking.tight),
  },
};
