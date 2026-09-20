import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { RuleReviewConsole } from '../../features/assessmentRuleReview/ui/RuleReviewConsole';
import { createBrowserRuleReviewRepository, type RuleReviewRepository } from '../../features/assessmentRuleReview/repository/RuleReviewRepository';
import { colors, spacing, type } from '../../design/tokens';

/**
 * Admin-only rule review console.
 *
 * There is no admin authentication yet, so this route is deliberately unreachable
 * from user navigation: nothing links to it and it is not a tab. It runs the real
 * repository over an explicitly injected dev/test seed — no Supabase client,
 * database read/write, generated fixture import or activation.
 *
 * The root layout registers this route with `headerShown: false`.
 */
export default function AdminRuleReviewRoute() {
  const router = useRouter();
  const [repository, setRepository] = useState<RuleReviewRepository | null>(null);
  useEffect(() => setRepository(createBrowserRuleReviewRepository()), []);
  if (!repository) return <View style={styles.empty}><Text style={styles.title}>Rule 검수 데이터가 연결되지 않았어요</Text><Text style={styles.body}>관리자 backend 연결 전에는 명시적으로 주입한 개발·테스트 seed에서만 콘솔을 열 수 있어요.</Text></View>;
  return <RuleReviewConsole repository={repository} onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />;
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  title: { ...type.title, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 520 },
});
