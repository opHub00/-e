import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import {
  BRAND_ENTRANCE_ATTR,
  BRAND_ENTRANCE_KEY,
  BRAND_ENTRANCE_MAX_MS,
} from '../features/brandEntrance/session';
import { colors } from '../design/tokens';

const ENTRANCE_MARK = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors.primaryContainer}"/><stop offset="1" stop-color="${colors.primary}"/></linearGradient></defs>
<rect width="32" height="32" rx="10" fill="url(#m)"/>
<circle cx="9.2" cy="10.2" r="3.4" fill="${colors.onPrimary}"/><circle cx="22.8" cy="10.2" r="3.4" fill="${colors.onPrimary}"/>
<circle cx="16" cy="18" r="8.2" fill="${colors.onPrimary}"/>
<rect x="13.9" y="11.4" width="1.6" height="3.4" rx=".8" fill="${colors.primary}"/><rect x="16.5" y="11.4" width="1.6" height="3.4" rx=".8" fill="${colors.primary}"/>
<circle cx="12.9" cy="17.6" r="1.45" fill="${colors.primary}"/><circle cx="19.1" cy="17.6" r="1.45" fill="${colors.primary}"/>
<path d="M13.4 21.2Q16 23.4 18.6 21.2" fill="none" stroke="${colors.primary}" stroke-width="1.5" stroke-linecap="round"/>
</svg>`);

/**
 * manifest 의 background_color 와 같은 값을 문서에도 깔아 둔다.
 * PWA cold start 에서 splash 가 사라진 뒤 RN Web 스타일이 붙기 전까지
 * 흰 화면이 끼어드는 구간을 없앤다.
 *
 * 표식이 서 있는 동안에는 body::before 로 앱을 덮는다.
 * 실제 element 가 아니라 가상 요소라서 hydration 과 접근성 트리를 건드리지 않는다.
 *
 * 이 판은 앱 컨테이너 위에 그려지므로 인트로 overlay 의 로고까지 가린다.
 * 그래서 overlay 가 화면에 올라오는 즉시 BrandEntrance 가 표식을 걷는다.
 * 덮을 구간은 첫 paint 부터 React 가 붙기 전까지 하나뿐이라 겹칠 일이 없다.
 */
const ENTRANCE_CSS = [
  `html,body,#root{background-color:${colors.background};}`,
  `html[${BRAND_ENTRANCE_ATTR}="pending"] body::before{`,
  'content:"";position:fixed;inset:0;pointer-events:none;z-index:9;',
  `background-color:${colors.background};}`,
  `html[${BRAND_ENTRANCE_ATTR}="pending"] body::after{`,
  'content:"완판e";position:fixed;left:50%;top:50%;width:128px;padding-top:80px;',
  'transform:translate(-50%,-50%);pointer-events:none;z-index:9;text-align:center;',
  'font-family:Pretendard-SemiBold,Arial,sans-serif;font-size:24px;font-weight:700;line-height:30px;',
  `letter-spacing:-0.6px;color:${colors.primary};background:url("data:image/svg+xml,${ENTRANCE_MARK}") center top/64px 64px no-repeat;}`,
].join('');

/**
 * 정적 export 는 route HTML 을 미리 그려두기 때문에 React 가 붙기 전에 앱이 먼저 보인다.
 * 첫 paint 전에 표식을 세워 그 구간을 덮고, 시작 시각을 남겨 인트로가 길이를 조절하게 한다.
 * JS 가 붙지 않아도 화면이 잠기지 않도록 표식은 시간으로도 반드시 걷어낸다.
 */
const ENTRANCE_BOOTSTRAP = `(function(){try{
if(sessionStorage.getItem(${JSON.stringify(BRAND_ENTRANCE_KEY)})!==null)return;
}catch(e){return;}
var d=document.documentElement;
d.setAttribute(${JSON.stringify(BRAND_ENTRANCE_ATTR)},"pending");
window.__wanpaneEntranceStart=Date.now();
setTimeout(function(){d.removeAttribute(${JSON.stringify(BRAND_ENTRANCE_ATTR)});},${BRAND_ENTRANCE_MAX_MS});
})();`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#4F3AA8" />
        <meta name="application-name" content="완판e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="완판e" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/svg+xml" href="/icons/wanpane-192.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <script defer src="/pwa-register.js" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: ENTRANCE_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: ENTRANCE_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
