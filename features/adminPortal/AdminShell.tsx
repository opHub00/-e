import { useState, type ReactNode } from 'react';
import { useRouter, usePathname, type Href } from 'expo-router';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { useAuthStore } from '../auth/useAuthStore';
import { ADMIN_ROLE_LABEL, adminAccessMessage, type AdminAccess } from './access';
import { useAdminAccess } from './useAdminAccess';
import { useIsWide } from './useIsWide';
import { ADMIN_LOGIN_ROUTE, ADMIN_MENU, ADMIN_MENU_GROUPS, activeMenuHref, type AdminMenuItem } from './navigation';

export { ADMIN_LOGIN_ROUTE, ADMIN_MENU };

/** 사이드바를 펼쳐 둘 수 있는 너비. 이보다 좁으면 서랍으로 접는다. */
const WIDE = 1024;

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
 * 한 곳에서 같은 방식으로 동작한다.
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
 * 이미 자기 권한 처리와 데이터 로직을 갖고 있는 화면(검수 콘솔, listing 연결)에 쓴다.
 * 여기서는 권한을 판정하지 않는다. 사이드바·상단 바·로그아웃만 같은 자리에 둔다.
 * 그래야 기존 화면의 AUTH_REQUIRED/FORBIDDEN 안내와 mutation 흐름이 그대로 유지된다.
 */
export function AdminChrome({ title, subtitle, scroll = true, children }: ChromeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const access = useAdminAccess();
  const signOut = useAuthStore(state => state.signOut);
  const wide = useIsWide(WIDE);
  const [drawer, setDrawer] = useState(false);
  const signedIn = access.status === 'ALLOWED' || access.status === 'FORBIDDEN';
  const active = activeMenuHref(pathname);

  const leave = async () => {
    await signOut();
    router.replace(ADMIN_LOGIN_ROUTE as Href);
  };

  const go = (item: AdminMenuItem) => {
    setDrawer(false);
    router.push(item.href as Href);
  };

  const menu = (
    <ScrollView contentContainerStyle={styles.sidebarScroll} showsVerticalScrollIndicator={false}>
      {ADMIN_MENU_GROUPS.map(group => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {group.items.map(item => {
            const selected = item.href === active;
            return (
              <MotionPressable
                key={item.href}
                accessibilityRole="link"
                accessibilityLabel={`${item.label} · ${item.hint}`}
                accessibilityState={{ selected }}
                onPress={() => go(item)}
                style={[styles.menuItem, selected && styles.menuItemActive]}
              >
                <MaterialIcons name={item.icon} size={20} color={selected ? colors.primary : colors.textSubtle} />
                <View style={styles.menuCopy}>
                  <Text style={[styles.menuLabel, selected && styles.menuLabelActive]}>{item.label}</Text>
                  <Text style={styles.menuHint} numberOfLines={1}>{item.hint}</Text>
                </View>
              </MotionPressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );

  /** 사이드바 아래 계정 칸. 지금 누구로 들어와 있는지와 나가는 길을 늘 같은 자리에 둔다. */
  const account = (
    <View style={styles.account}>
      <View style={styles.accountWho}>
        <View style={styles.avatar}>
          <MaterialIcons name="person" size={18} color={colors.primary} />
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountName} numberOfLines={1}>
            {access.status === 'ALLOWED' ? ADMIN_ROLE_LABEL[access.role] : '로그인 필요'}
          </Text>
          <Text style={styles.accountMail} numberOfLines={1}>
            {access.status === 'ALLOWED' || access.status === 'FORBIDDEN' ? access.email ?? '계정 확인 중' : '관리자 계정으로 들어와 주세요'}
          </Text>
        </View>
      </View>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={signedIn ? '로그아웃' : '관리자 로그인'}
        onPress={() => (signedIn ? void leave() : router.replace(ADMIN_LOGIN_ROUTE as Href))}
        style={styles.accountAction}
      >
        <MaterialIcons name={signedIn ? 'logout' : 'login'} size={18} color={colors.textMuted} />
      </MotionPressable>
    </View>
  );

  const content = (
    <>
      {title ? (
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.layout}>
        {wide ? (
          <View style={styles.sidebar}>
            <View style={styles.brandBox}>
              <Text accessibilityRole="header" style={styles.brand}>완판e</Text>
              <Text style={styles.brandSub}>운영 콘솔</Text>
            </View>
            {menu}
            {account}
          </View>
        ) : null}

        <View style={styles.main}>
          <View style={styles.topbar}>
            {!wide ? (
              <MotionPressable accessibilityRole="button" accessibilityLabel="메뉴 열기" onPress={() => setDrawer(true)} style={styles.iconButton}>
                <MaterialIcons name="menu" size={22} color={colors.text} />
              </MotionPressable>
            ) : null}
            {/* 제목은 본문 위에 한 번만 쓴다. 상단 바는 지금 누구로 들어와 있는지를 맡는다. */}
            <Text style={styles.topbarTitle} numberOfLines={1}>완판e 운영 콘솔</Text>
            <View style={styles.topbarRight}>
              {access.status === 'ALLOWED' ? (
                <Text style={styles.topbarWho} numberOfLines={1}>
                  {ADMIN_ROLE_LABEL[access.role]} · {access.email ?? '계정 확인 중'}
                </Text>
              ) : null}
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel={signedIn ? '로그아웃' : '관리자 로그인'}
                onPress={() => (signedIn ? void leave() : router.replace(ADMIN_LOGIN_ROUTE as Href))}
                style={styles.iconButton}
              >
                <MaterialIcons name={signedIn ? 'logout' : 'login'} size={20} color={colors.textMuted} />
              </MotionPressable>
            </View>
          </View>

          {scroll ? (
            <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>{content}</ScrollView>
          ) : (
            <View style={styles.flexBody}>{content}</View>
          )}
        </View>
      </View>

      <Modal visible={drawer && !wide} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
        <View style={styles.drawerBackdrop}>
          <View style={styles.drawer}>
            <View style={styles.drawerHead}>
              <Text accessibilityRole="header" style={styles.brand}>완판e 운영 콘솔</Text>
              <MotionPressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={() => setDrawer(false)} style={styles.iconButton}>
                <MaterialIcons name="close" size={22} color={colors.text} />
              </MotionPressable>
            </View>
            {menu}
            {account}
          </View>
          <MotionPressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={() => setDrawer(false)} style={styles.drawerRest} />
        </View>
      </Modal>
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
  layout: { flex: 1, flexDirection: 'row' },

  sidebar: { width: 268, borderRightWidth: 1, borderRightColor: colors.surfaceHigh, backgroundColor: colors.surface },
  sidebarScroll: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.md },
  brandBox: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 1 },
  brand: { ...type.bodyStrong, color: colors.text },
  brandSub: { ...type.micro, color: colors.textSubtle },
  group: { gap: 2 },
  groupTitle: { ...type.micro, color: colors.textSubtle, paddingHorizontal: spacing.sm, paddingBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.sm, borderRadius: radius.cardSm },
  menuItemActive: { backgroundColor: colors.lavender },
  menuCopy: { flex: 1, minWidth: 0, gap: 1 },
  menuLabel: { ...type.bodySmStrong, color: colors.textMuted },
  menuLabelActive: { color: colors.primary },
  menuHint: { ...type.micro, color: colors.textSubtle },

  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceHigh, padding: spacing.md },
  accountWho: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { ...type.bodySmStrong, color: colors.text },
  accountMail: { ...type.micro, color: colors.textSubtle },
  accountAction: { width: size.iconButton, height: size.iconButton, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },

  main: { flex: 1, minWidth: 0 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceHigh, backgroundColor: colors.surface },
  topbarTitle: { ...type.bodyStrong, color: colors.text, flex: 1, minWidth: 0 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  topbarWho: { ...type.micro, color: colors.textSubtle, flexShrink: 1 },
  iconButton: { width: size.iconButton, height: size.iconButton, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },

  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  contentWide: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  titleRow: { gap: 2 },
  title: { ...type.section, color: colors.text },
  subtitle: { ...type.bodySm, color: colors.textMuted },
  flexBody: { flex: 1 },

  drawerBackdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(28,27,34,0.4)' },
  drawer: { width: 288, maxWidth: '86%', backgroundColor: colors.surface },
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  drawerRest: { flex: 1 },

  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  panel: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.sm },
  panelTitle: { ...type.cardTitle, color: colors.text },
  body: { ...type.body, color: colors.textMuted },
  action: { minHeight: size.touch, justifyContent: 'center', alignItems: 'center', borderRadius: radius.button, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  actionText: { ...type.bodySmStrong, color: colors.onPrimary },
});
