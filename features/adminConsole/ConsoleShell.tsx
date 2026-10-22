import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, spacing, tint, type } from '../../design/tokens';
import { useAdminAccess } from '../adminPortal/useAdminAccess';
import { useAttached, useIsWide } from '../adminPortal/useIsWide';
import { ADMIN_LOGIN_ROUTE } from '../adminPortal/navigation';
import { Notice } from '../adminPortal/ui/AdminKit';
import { BrandMark } from '../eventKiosk/brand/BrandMark';
import { useAuthStore } from '../auth/useAuthStore';
import { DataStamp, LoadingView, StateView } from './ConsoleKit';
import { ConsoleLoadError, LOAD_ERROR_COPY, missingSections, SECTION_LABEL, type ConsoleLoadErrorKind } from './consoleState';
import type { ConsoleSnapshot } from './contract';
import type { ConsoleAiEvent, ConsoleAuditEntry, ConsoleNotice } from './contract';
import type { ConsolePage, ConsolePageQuery } from './server/pagination';
import { demoClock, demoScenario, parseDemoState, type DemoState } from './demoScenarios';
import { connectedPage, connectedSnapshot, consoleSource } from './source';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** 통합 운영 콘솔 메뉴(Product V3). 운영자가 하는 일 순서. */
export const CONSOLE_MENU: Array<{ key: string; label: string; hint: string; href: string; icon: IconName }> = [
  { key: 'dashboard', label: '대시보드', hint: '지금 정상인지', href: '/admin/console', icon: 'dashboard' },
  { key: 'analytics', label: '운영 지표', hint: '상담·판정 세션 흐름', href: '/admin/console/analytics', icon: 'query-stats' },
  { key: 'notices', label: '공고', hint: '활성·검토 상태', href: '/admin/console/notices', icon: 'campaign' },
  { key: 'rules', label: '규칙 패키지', hint: '규칙 검토·승인', href: '/admin/console/rules', icon: 'fact-check' },
  { key: 'assessments', label: '판정 현황', hint: '사용자가 막히는 곳', href: '/admin/console/assessments', icon: 'insights' },
  { key: 'ai', label: 'AI 모니터링', hint: '대체·근거 실패', href: '/admin/console/ai', icon: 'smart-toy' },
  { key: 'audit', label: '감사 로그', hint: '누가 무엇을 바꿨는지', href: '/admin/console/audit', icon: 'history' },
];

const WIDE = 1024;

export type ConsoleMode = 'CONNECTED' | 'DEMO';

/** 화면이 쓰는 공통 값: 기준 '지금'(예시 모드는 예시 기준 시각), 새로고침, 콘솔 안 링크. */
export type ConsoleContextValue = { now: Date; refresh: () => void; link: (path: string, query?: Record<string, string>) => Href; mode: ConsoleMode;
  loadPage: (query: ConsolePageQuery) => Promise<ConsolePage<ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice>>;
  /** 새로고침 버튼을 누를 때마다 1씩 오른다. 화면이 따로 부르는 데이터(운영 지표)도 함께 다시 부른다. */
  refreshCount: number };
const ConsoleContext = createContext<ConsoleContextValue | null>(null);
export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsole must be used inside ConsoleShell');
  return value;
}

type Props = {
  menuKey: string;
  title: string;
  subtitle: string;
  testID: string;
  children: (snapshot: ConsoleSnapshot, mode: ConsoleMode) => ReactNode;
  /** 오류 화면에 적는 '이 화면이 기다리는 데이터' */
  needs: string[];
};

type View_ =
  | { kind: 'LOADING' }
  | { kind: 'ERROR'; error: ConsoleLoadErrorKind; status: number | null }
  | { kind: 'READY'; snapshot: ConsoleSnapshot; mode: ConsoleMode; refreshError: ConsoleLoadErrorKind | null };

const DEMO_STATE_LABEL: Record<DemoState, string> = {
  populated: '기본', loading: '불러오는 중', empty: '빈 데이터', partial: '부분 데이터', stale: '오래된 데이터', large: '많은 데이터(100건)',
  error: '서버 오류', timeout: '연결 지연', network: '네트워크 끊김', auth: '권한 확인 불가', unauthorized: '로그인 필요', forbidden: '권한 없음',
};

/** 실제 운영 데이터: 권한 확인 → 불러오기. 새로고침이 실패하면 마지막 데이터는 남기고 실패를 알린다. */
function useConnectedView(enabled: boolean, nonce: number): View_ {
  const access = useAdminAccess();
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const [state, setState] = useState<{ snapshot: ConsoleSnapshot | null; error: { kind: ConsoleLoadErrorKind; status: number | null } | null; loading: boolean }>({ snapshot: null, error: null, loading: true });
  useEffect(() => {
    if (!enabled || access.status !== 'ALLOWED') return;
    if (!token) { setState(current => ({ ...current, loading: false, error: { kind: 'UNAUTHORIZED', status: null } })); return; }
    let active = true;
    setState(current => ({ ...current, loading: true }));
    connectedSnapshot(token).then(snapshot => {
      if (active) setState({ snapshot, error: null, loading: false });
    }).catch((error: unknown) => {
      const kind = error instanceof ConsoleLoadError ? error.kind : 'SERVER';
      const status = error instanceof ConsoleLoadError ? error.status : null;
      if (active) setState(current => ({ ...current, loading: false, error: { kind, status } }));
    });
    return () => { active = false; };
  }, [access.status, enabled, nonce, token]);
  if (access.status === 'LOADING') return { kind: 'LOADING' };
  if (access.status === 'SIGNED_OUT') return { kind: 'ERROR', error: 'UNAUTHORIZED', status: null };
  if (access.status === 'FORBIDDEN') return { kind: 'ERROR', error: 'FORBIDDEN', status: null };
  if (access.status === 'ERROR') return { kind: 'ERROR', error: access.code === 'NETWORK' ? 'NETWORK' : 'AUTH_UNAVAILABLE', status: null };
  if (state.snapshot) return { kind: 'READY', snapshot: state.snapshot, mode: 'CONNECTED', refreshError: state.error?.kind ?? null };
  if (state.error) return { kind: 'ERROR', error: state.error.kind, status: state.error.status };
  return { kind: 'LOADING' };
}

/**
 * 콘솔 껍데기. 일반 사용자 화면과 구분되는 운영 도구 모양(어두운 사이드바)이지만 완판e 토큰을 쓴다.
 * 넓은 화면: 왼쪽 사이드바. 좁은 화면: 위쪽 메뉴 격자(줄바꿈, 가로 스크롤 없음).
 *
 * 상태: 불러오는 중 · 로그인 필요 · 권한 없음 · 권한 확인 불가 · 서버 오류 · 네트워크 · 지연 · 준비됨(부분·오래된 데이터 포함).
 * 예시 데이터(?demo=1, Demo 빌드)만 로그인 없이 열리고, ?state= 로 각 상태를 그려 볼 수 있다.
 */
export function ConsoleShell({ menuKey, title, subtitle, testID, children, needs }: Props) {
  const params = useLocalSearchParams<{ demo?: string; state?: string }>();
  const attached = useAttached();
  const router = useRouter();
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const [nonce, setNonce] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const demo = attached && consoleSource(params.demo).status === 'DEMO';
  const demoState = parseDemoState(params.state);
  const connected = useConnectedView(attached && !demo, nonce);
  const scenario = demo ? demoScenario(demoState) : null;
  const view: View_ = !attached ? { kind: 'LOADING' }
    : scenario ? (scenario.kind === 'READY' ? { kind: 'READY', snapshot: scenario.snapshot, mode: 'DEMO', refreshError: null } : scenario)
      : connected;
  // 실제 모드의 '지금'은 1분마다 갱신해 '몇 분 전' 표시가 흐르게 한다.
  useEffect(() => {
    if (demo) return;
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, [demo]);
  const now = demo ? demoClock() : clock;
  const refresh = useCallback(() => { setClock(new Date()); setNonce(value => value + 1); }, []);
  const link = useCallback((path: string, query: Record<string, string> = {}) => {
    const all = { ...query, ...(demo ? { demo: '1', ...(demoState !== 'populated' ? { state: demoState } : {}) } : {}) };
    const search = Object.entries(all).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    return `${path}${search ? `?${search}` : ''}` as Href;
  }, [demo, demoState]);
  const login = () => router.replace(ADMIN_LOGIN_ROUTE as Href);
  const loadPage = useCallback((query: ConsolePageQuery) => {
    if (!token || demo) return Promise.reject(new ConsoleLoadError('UNAUTHORIZED'));
    return connectedPage(token, query);
  }, [demo, token]);
  return (
    <ConsoleContext.Provider value={{ now, refresh, link, mode: demo ? 'DEMO' : 'CONNECTED', loadPage, refreshCount: nonce }}>
      <ConsoleChrome menuKey={menuKey} demo={demo} link={link}>
        {/* 라우터 기본 머리(경로 이름)를 숨긴다. 콘솔은 자체 사이드바·제목을 쓴다. */}
        <Stack.Screen options={{ headerShown: false, title: `${title} · 운영 콘솔` }} />
        <View testID={testID} style={styles.page}>
          <View style={styles.pageHead}>
            <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
            <Text style={styles.pageSubtitle}>{subtitle}</Text>
          </View>
          {demo ? (
            <View testID="console-demo-banner" style={styles.demoBanner}>
              <MaterialIcons name="science" size={18} color={tint.amber.fg} />
              <Text style={styles.demoText}>예시 데이터로 보는 화면이에요 · 실제 운영 값이 아니고 저장되지 않아요{demoState !== 'populated' ? ` · 상태: ${DEMO_STATE_LABEL[demoState]}` : ''}</Text>
            </View>
          ) : null}
          {view.kind === 'LOADING' ? <LoadingView /> : null}
          {view.kind === 'ERROR' ? (
            <View style={styles.page}>
              <StateView kind={view.error} status={view.status} onRetry={refresh} onLogin={login} />
              {view.error === 'SERVER' || view.error === 'TIMEOUT' ? <Text style={styles.needs}>이 화면이 기다리는 데이터: {needs.join(' · ')}</Text> : null}
            </View>
          ) : null}
          {view.kind === 'READY' ? (
            <>
              <DataStamp generatedAt={view.snapshot.generatedAt} now={now} onRefresh={refresh} missing={missingSections(view.snapshot).map(section => SECTION_LABEL[section])} />
              {view.refreshError ? (
                <Notice tone="amber" icon="sync-problem">새로고침 실패 · {LOAD_ERROR_COPY[view.refreshError].title}. 아래는 마지막으로 받은 데이터예요.</Notice>
              ) : null}
              {children(view.snapshot, view.mode)}
            </>
          ) : null}
        </View>
      </ConsoleChrome>
    </ConsoleContext.Provider>
  );
}

/**
 * 아래 여백 맞추기: 내용이 화면에 들어맞는데 아래 여백 때문에만 생기는 스크롤을 없앤다.
 * 내용(여백 제외)이 들어맞으면 여백을 남는 만큼으로 줄이고, 넘치면 원래 여백을 쓴다.
 * 여백을 바꿔도 '여백 제외 내용 높이'는 그대로라 값이 흔들리지 않는다.
 */
function useFittedBottom(base: number) {
  const [viewport, setViewport] = useState(0);
  // 내용 높이는 잴 때 쓰인 여백과 함께 저장한다(여백을 뺀 순수 내용 높이를 정확히 구하려고).
  const [content, setContent] = useState<{ height: number; padding: number } | null>(null);
  const [padding, setPadding] = useState(base);
  const paddingRef = useRef(base);
  paddingRef.current = padding;
  useEffect(() => {
    if (!viewport || !content) return;
    const inner = content.height - content.padding;
    const next = inner <= viewport ? Math.max(0, Math.min(base, viewport - inner)) : base;
    if (next !== paddingRef.current) setPadding(next);
  }, [base, content, viewport]);
  return {
    padding,
    onLayout: (event: { nativeEvent: { layout: { height: number } } }) => setViewport(Math.round(event.nativeEvent.layout.height)),
    onContentSizeChange: (_width: number, height: number) => setContent({ height: Math.round(height), padding: paddingRef.current }),
  };
}

function ConsoleChrome({ menuKey, demo, link, children }: { menuKey: string; demo: boolean; link: ConsoleContextValue['link']; children: ReactNode }) {
  const wide = useIsWide(WIDE);
  const { width, height } = useWindowDimensions();
  // 노트북 높이(≤800)에서는 위아래 여백만 줄여 내용이 들어맞는데도 생기는 스크롤을 없앤다.
  const short = height > 0 && height <= 800;
  const router = useRouter();
  const pathname = usePathname();
  const go = (href: string) => router.push(link(href));
  const fit = useFittedBottom(wide ? (short ? spacing.sm : spacing.xl) : spacing.md);
  const columns = width >= 700 ? 3 : 2;
  const brand = (
    <View style={styles.brandRow}>
      <BrandMark size="header" compact={!wide} />
      <View style={styles.consoleTag}><Text style={styles.consoleTagText}>운영 콘솔</Text></View>
    </View>
  );
  const items = CONSOLE_MENU.map(item => {
    const active = item.key === menuKey || pathname === item.href;
    return (
      <MotionPressable
        key={item.key}
        testID={`console-nav-${item.key}`}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        accessibilityLabel={item.label}
        onPress={() => go(item.href)}
        style={[wide ? styles.navItem : [styles.navTile, { width: `${100 / columns - 2}%` }], active && (wide ? styles.navItemActive : styles.navTileActive)]}
      >
        <MaterialIcons name={item.icon} size={18} color={active ? colors.onPrimary : wide ? '#C9C5E8' : colors.primary} />
        <View style={styles.navCopy}>
          <Text style={[wide ? styles.navLabel : styles.navTileLabel, active && styles.navLabelActive]} numberOfLines={1}>{item.label}</Text>
          {wide ? <Text style={[styles.navHint, active && styles.navHintActive]} numberOfLines={1}>{item.hint}</Text> : null}
        </View>
      </MotionPressable>
    );
  });
  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <View style={styles.sidebar} testID="console-sidebar">
          <View style={styles.sidebarBrand}>{brand}</View>
          <View style={styles.navList}>{items}</View>
          <MotionPressable accessibilityRole="link" accessibilityLabel="기존 운영 화면" onPress={() => router.push('/admin' as Href)} style={styles.legacyLink}>
            <MaterialIcons name="arrow-back" size={16} color="#C9C5E8" />
            <Text style={styles.navHint}>기존 운영 화면</Text>
          </MotionPressable>
        </View>
        <ScrollView style={styles.main} onLayout={fit.onLayout} onContentSizeChange={fit.onContentSizeChange} contentContainerStyle={[styles.mainContent, short && styles.mainContentShort, { paddingBottom: fit.padding }]}>{children}</ScrollView>
      </View>
    );
  }
  return (
    <ScrollView style={styles.narrowRoot} onLayout={fit.onLayout} onContentSizeChange={fit.onContentSizeChange} contentContainerStyle={[styles.narrowContent, { paddingBottom: fit.padding }]}>
      <View style={styles.narrowHead}>{brand}</View>
      <View testID="console-nav-grid" style={styles.navGrid}>{items}</View>
      {children}
    </ScrollView>
  );
}

const SIDEBAR = '#1F1B3A';

const styles = StyleSheet.create({
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  sidebar: { width: 248, backgroundColor: SIDEBAR, paddingVertical: spacing.lg, paddingHorizontal: spacing.md, gap: spacing.lg },
  sidebarBrand: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.button, backgroundColor: '#FFFFFF' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  consoleTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.primary },
  consoleTagText: { ...type.caption, color: colors.onPrimary, fontFamily: type.label.fontFamily },
  navList: { gap: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.button },
  navItemActive: { backgroundColor: colors.primary },
  navCopy: { flex: 1, minWidth: 0 },
  navLabel: { ...type.label, color: '#FFFFFF' },
  navLabelActive: { color: colors.onPrimary },
  navHint: { ...type.caption, color: '#A9A4CC' },
  navHintActive: { color: '#E6E2FF' },
  legacyLink: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  main: { flex: 1 },
  mainContent: { padding: spacing.xl, gap: spacing.lg, maxWidth: 1360, width: '100%' },
  mainContentShort: { paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.md },
  narrowRoot: { flex: 1, backgroundColor: colors.background },
  narrowContent: { padding: spacing.md, gap: spacing.md },
  narrowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  navTile: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.button, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  navTileActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  navTileLabel: { ...type.label, color: colors.text },
  page: { gap: spacing.md },
  pageHead: { gap: 2 },
  pageTitle: { ...type.title, color: colors.text },
  pageSubtitle: { ...type.body, color: colors.textMuted },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.button, backgroundColor: tint.amber.bg },
  demoText: { ...type.label, color: tint.amber.fg, flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.xl },
  needs: { ...type.caption, color: colors.textMuted },
  muted: { ...type.body, color: colors.textMuted },
});
