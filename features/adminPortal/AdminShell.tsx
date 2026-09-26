import type { ReactNode } from 'react';
import { useRouter, usePathname, type Href } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { useAuthStore } from '../auth/useAuthStore';
import { ADMIN_ROLE_LABEL, adminAccessMessage, type AdminAccess } from './access';
import { useAdminAccess } from './useAdminAccess';
import { ADMIN_LOGIN_ROUTE, ADMIN_MENU } from './navigation';

export { ADMIN_LOGIN_ROUTE, ADMIN_MENU };

type Props = {
  title: string;
  subtitle?: string;
  /** 권한이 확인된 뒤에만 그린다. */
  children: (access: Extract<AdminAccess, { status: 'ALLOWED' }>) => ReactNode;
};

type ChromeProps = {
  title?: string;
  subtitle?: string;
  /** 본문이 스스로 스크롤을 갖는 화면(검수 콘솔 등)은 false 로 둔다. */
  scroll?: boolean;
  children: ReactNode;
};

/**
 * Admin 화면 공통 껍데기.
 *
 * 라우터를 갈아엎지 않는다. 각 화면이 이 컴포넌트를 쓰면 권한 처리·내비게이션·로그아웃이
 * 한 곳에서 같은 방식으로 동작한다. 기존 화면(rule-review, listing-bindings)은 자기 권한 화면을
 * 이미 갖고 있으므로 건드리지 않고, 새 화면부터 이걸 쓴다.
 *
 * 권한이 없을 때 일반 서비스 로그인 화면으로 돌려보내지 않는다. 운영자는 관리자 입구에 머물러야 한다.
 */
export function AdminShell({ title, subtitle, children }: Props) {
  const router = useRouter();
  const access = useAdminAccess();
  const signOut = useAuthStore(state => state.signOut);

  const leave = async () => {
    await signOut();
    router.replace(ADMIN_LOGIN_ROUTE as Href);
  };

  const body = () => {
    if (access.status === 'LOADING') {
      return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>권한을 확인하는 중이에요</Text></View>;
    }
    if (access.status === 'SIGNED_OUT') {
      return <Panel title="관리자 로그인이 필요해요" body="운영 화면은 관리자 계정으로만 열 수 있어요.">
        <Action label="관리자 로그인으로 가기" onPress={() => router.replace(ADMIN_LOGIN_ROUTE as Href)} />
      </Panel>;
    }
    if (access.status === 'FORBIDDEN') {
      return <Panel title="관리자 권한이 없는 계정입니다." body={`${access.email ?? '이 계정'}은(는) 운영 권한이 없어요. 권한이 필요하면 운영 담당자에게 요청해 주세요.`}>
        <Action label="다른 계정으로 로그인" onPress={() => void leave()} />
      </Panel>;
    }
    if (access.status === 'ERROR') {
      return <Panel title="권한을 확인하지 못했어요" body={adminAccessMessage(access.code)}>
        <Action label="다시 확인하기" onPress={access.refresh} />
      </Panel>;
    }
    return children(access);
  };

  return <AdminChrome title={title} subtitle={subtitle}>{body()}</AdminChrome>;
}

/**
 * 껍데기만 씌우는 형태.
 *
 * 이미 자기 권한 처리와 데이터 로직을 갖고 있는 화면(검수 콘솔, listing 연결, 학습 현황)에 쓴다.
 * 여기서는 권한을 판정하지 않는다. 상단 브랜드·내비게이션·로그아웃만 같은 자리에 둔다.
 * 그래야 기존 화면의 AUTH_REQUIRED/FORBIDDEN 안내와 mutation 흐름이 그대로 유지된다.
 */
export function AdminChrome({ title, subtitle, scroll = true, children }: ChromeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const access = useAdminAccess();
  const signOut = useAuthStore(state => state.signOut);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const signedIn = access.status === 'ALLOWED' || access.status === 'FORBIDDEN';

  const leave = async () => {
    await signOut();
    router.replace(ADMIN_LOGIN_ROUTE as Href);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.header, wide && styles.headerWide]}>
        <View style={styles.brandRow}>
          <Text accessibilityRole="header" style={styles.brand}>완판e Admin</Text>
          {access.status === 'ALLOWED' ? (
            <Text style={styles.who}>{ADMIN_ROLE_LABEL[access.role]} · {access.email ?? '계정 확인 중'}</Text>
          ) : null}
        </View>
        {/* 로그아웃은 로그인한 동안 항상 닿을 수 있어야 한다. 권한이 없어도 마찬가지다. */}
        {signedIn ? (
          <MotionPressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={() => void leave()} style={styles.logout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </MotionPressable>
        ) : (
          <MotionPressable accessibilityRole="button" accessibilityLabel="관리자 로그인" onPress={() => router.replace(ADMIN_LOGIN_ROUTE as Href)} style={styles.logout}>
            <Text style={styles.logoutText}>관리자 로그인</Text>
          </MotionPressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
        {ADMIN_MENU.map(item => {
          const active = pathname === item.href;
          return (
            <MotionPressable key={item.href} accessibilityRole="button" accessibilityState={{ selected: active }}
              onPress={() => router.push(item.href as Href)} style={[styles.navItem, active && styles.navItemActive]}>
              <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
            </MotionPressable>
          );
        })}
      </ScrollView>

      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>
          {title ? (
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          ) : null}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flexBody}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const Panel = ({ title, body, children }: { title: string; body: string; children?: ReactNode }) => (
  <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
    {children}
  </View>
);

export const Action = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <MotionPressable accessibilityRole="button" onPress={onPress} style={styles.action}>
    <Text style={styles.actionText}>{label}</Text>
  </MotionPressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceHigh, backgroundColor: colors.surface },
  headerWide: { paddingHorizontal: spacing.xl },
  brandRow: { gap: 2, flexShrink: 1 },
  brand: { ...type.bodyStrong, color: colors.text },
  who: { ...type.micro, color: colors.textSubtle },
  logout: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: spacing.sm },
  logoutText: { ...type.bodySmStrong, color: colors.primary },
  nav: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  navItem: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceContainer },
  navItemActive: { backgroundColor: colors.primary },
  navText: { ...type.bodySm, color: colors.textMuted },
  navTextActive: { color: colors.onPrimary },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  contentWide: { paddingHorizontal: spacing.xl, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  titleRow: { gap: 2 },
  title: { ...type.section, color: colors.text },
  subtitle: { ...type.bodySm, color: colors.textMuted },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  flexBody: { flex: 1 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.sm },
  panelTitle: { ...type.cardTitle, color: colors.text },
  body: { ...type.body, color: colors.textMuted },
  action: { minHeight: size.touch, justifyContent: 'center', alignItems: 'center', borderRadius: radius.button, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  actionText: { ...type.bodySmStrong, color: colors.onPrimary },
});
