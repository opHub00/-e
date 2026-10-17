import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, spacing, tint, type } from '../../design/tokens';
import { useAdminAccess } from '../adminPortal/useAdminAccess';
import { adminAccessMessage } from '../adminPortal/access';
import { useAttached, useIsWide } from '../adminPortal/useIsWide';
import { ADMIN_LOGIN_ROUTE } from '../adminPortal/navigation';
import { AdminButton, NotConnected, SectionCard } from '../adminPortal/ui/AdminKit';
import { BrandMark } from '../eventKiosk/brand/BrandMark';
import { useAuthStore } from '../auth/useAuthStore';
import type { ConsoleSnapshot } from './contract';
import { connectedSnapshot, consoleSource } from './source';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** 통합 운영 콘솔 메뉴(Product V3). 운영자가 하는 일 순서. */
export const CONSOLE_MENU: Array<{ key: string; label: string; hint: string; href: string; icon: IconName }> = [
  { key: 'dashboard', label: '대시보드', hint: '지금 정상인지', href: '/admin/console', icon: 'dashboard' },
  { key: 'notices', label: '공고', hint: '활성·검토 상태', href: '/admin/console/notices', icon: 'campaign' },
  { key: 'rules', label: '규칙 패키지', hint: '규칙 검토·승인', href: '/admin/console/rules', icon: 'fact-check' },
  { key: 'assessments', label: '판정 현황', hint: '사용자가 막히는 곳', href: '/admin/console/assessments', icon: 'insights' },
  { key: 'ai', label: 'AI 모니터링', hint: '대체·근거 실패', href: '/admin/console/ai', icon: 'smart-toy' },
  { key: 'audit', label: '감사 로그', hint: '누가 무엇을 바꿨는지', href: '/admin/console/audit', icon: 'history' },
];

const WIDE = 1024;

type Props = {
  menuKey: string;
  title: string;
  subtitle: string;
  testID: string;
  children: (snapshot: ConsoleSnapshot, mode: 'CONNECTED' | 'DEMO') => ReactNode;
  /** 연결 전 화면에 적을 '필요한 것' */
  needs: string[];
};

/**
 * 콘솔 껍데기. 일반 사용자 화면과 구분되는 운영 도구 모양(어두운 사이드바)이지만 완판e 토큰을 쓴다.
 * 넓은 화면: 왼쪽 사이드바. 좁은 화면: 위쪽 메뉴 격자(줄바꿈, 가로 스크롤 없음).
 * 실제 데이터 모드는 관리자 권한을 확인한다. 예시 데이터(?demo=1, Demo 빌드)만 로그인 없이 열린다.
 */
export function ConsoleShell({ menuKey, title, subtitle, testID, children, needs }: Props) {
  const params = useLocalSearchParams<{ demo?: string }>();
  const attached = useAttached();
  const access = useAdminAccess();
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const [connected, setConnected] = useState<ConsoleSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setConnected(null);
    setLoadError(null);
    if (!attached || access.status !== 'ALLOWED' || !token || consoleSource(params.demo).status === 'DEMO') return;
    let active = true;
    void connectedSnapshot(token).then(snapshot => {
      if (active) { setConnected(snapshot); setLoadError(null); }
    }).catch(() => {
      if (active) { setConnected(null); setLoadError('운영 데이터 서버에 연결하지 못했어요.'); }
    });
    return () => { active = false; };
  }, [access.status, attached, params.demo, token]);
  const source = consoleSource(attached ? params.demo : undefined, access.status === 'ALLOWED' ? connected : null);
  const demo = source.status === 'DEMO';
  return (
    <ConsoleChrome menuKey={menuKey} demo={demo}>
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
            <Text style={styles.demoText}>예시 데이터로 보는 화면이에요 · 실제 운영 값이 아니고 저장되지 않아요</Text>
          </View>
        ) : null}
        {!attached ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          : source.status === 'NOT_CONNECTED' ? <Gated><NotConnected title={loadError ?? `${title} 데이터 연결 중`} purpose={subtitle} needs={needs} /></Gated>
            : source.status === 'DEMO' ? children(source.snapshot, 'DEMO')
              : <Gated>{children(source.snapshot, 'CONNECTED')}</Gated>}
      </View>
    </ConsoleChrome>
  );
}

/** 실제 데이터 모드의 관리자 권한 확인. */
function Gated({ children }: { children: ReactNode }) {
  const access = useAdminAccess();
  const router = useRouter();
  if (access.status === 'LOADING') return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>권한을 확인하는 중이에요</Text></View>;
  if (access.status === 'ALLOWED') return <>{children}</>;
  const body = access.status === 'SIGNED_OUT' ? '운영 콘솔은 관리자 계정으로만 열 수 있어요.'
    : access.status === 'FORBIDDEN' ? '이 계정은 운영 권한이 없어요.'
      : adminAccessMessage(access.code);
  return (
    <SectionCard title="관리자 권한이 필요해요" description={body}>
      <AdminButton label="관리자 로그인" icon="login" onPress={() => router.replace(ADMIN_LOGIN_ROUTE as Href)} />
    </SectionCard>
  );
}

function ConsoleChrome({ menuKey, demo, children }: { menuKey: string; demo: boolean; children: ReactNode }) {
  const wide = useIsWide(WIDE);
  const { width, height } = useWindowDimensions();
  // 노트북 높이(≤800)에서는 위아래 여백만 줄여 내용이 들어맞는데도 생기는 스크롤을 없앤다.
  const short = height > 0 && height <= 800;
  const router = useRouter();
  const pathname = usePathname();
  const go = (href: string) => router.push(`${href}${demo ? '?demo=1' : ''}` as Href);
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
        <ScrollView style={styles.main} contentContainerStyle={[styles.mainContent, short && styles.mainContentShort]}>{children}</ScrollView>
      </View>
    );
  }
  return (
    <ScrollView style={styles.narrowRoot} contentContainerStyle={styles.narrowContent}>
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
  muted: { ...type.body, color: colors.textMuted },
});
