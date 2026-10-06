import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { toQR } from 'toqr';

/**
 * QR 코드. 비트맵을 한 개의 path 로 그린다(칸마다 Rect 를 만들면 수천 개가 된다).
 * 둘레에 4칸 여백을 둔다. 여백이 없으면 휴대폰 카메라가 잘 못 읽는다.
 */
export function QrCode({ value, size = 280, testID }: { value: string; size?: number; testID?: string }) {
  const { path, cells } = useMemo(() => {
    const bits = toQR(value);
    const n = Math.round(Math.sqrt(bits.length));
    let d = '';
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (bits[y * n + x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    }
    return { path: d, cells: n + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`} testID={testID} accessibilityLabel="결과 요약 QR 코드">
      <Rect x={0} y={0} width={cells} height={cells} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
