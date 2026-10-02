import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../design/tokens';
import { useAuthStore } from '../auth/useAuthStore';
import { authRouteFor } from './authPolicy';

type Props = {
  children: React.ReactNode;
  enabled: boolean;
  returnTo: string;
};

export function AuthGate({ children, enabled, returnTo }: Props) {
  const router = useRouter();
  const hydrated = useAuthStore(state => state.authHydrated);
  const session = useAuthStore(state => state.session);

  useEffect(() => {
    if (enabled && hydrated && !session) router.replace(authRouteFor(returnTo) as Href);
  }, [enabled, hydrated, returnTo, router, session]);

  if (!enabled || session) return children;
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.copy}>{hydrated ? '로그인 화면으로 이동할게요.' : '계정 상태를 확인하고 있어요.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.background },
  copy: { ...type.bodySm, color: colors.textMuted },
});
