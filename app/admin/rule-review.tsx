import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { RuleReviewConsole } from '../../features/assessmentRuleReview/ui/RuleReviewConsole';
import { createBrowserRuleReviewRepository, type RuleReviewRepositoryLike } from '../../features/assessmentRuleReview/repository/RuleReviewRepository';
import { SupabaseRuleReviewRepository } from '../../features/assessmentRuleReview/repository/SupabaseRuleReviewRepository';
import { readPublicRuleReviewTarget } from '../../features/assessmentRuleReview/repository/stagingTarget';
import { getSupabaseClient } from '../../features/auth/supabaseClient';
import { colors, spacing, type } from '../../design/tokens';

type RouteState =
  | { status: 'LOADING' }
  | { status: 'READY'; repository: RuleReviewRepositoryLike; persistence: 'local' | 'staging' }
  | { status: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'LOAD_FAILED'; message: string };

/** Hidden route with a data-before-render authorization gate. */
export default function AdminRuleReviewRoute() {
  const router = useRouter();
  const [state, setState] = useState<RouteState>({ status: 'LOADING' });
  useEffect(() => {
    let active = true;
    void (async () => {
      const demoAllowed = process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_WANPANE_ENV !== 'staging';
      const demo = demoAllowed ? createBrowserRuleReviewRepository() : null;
      if (demo) { if (active) setState({ status: 'READY', repository: demo, persistence: 'local' }); return; }
      try {
        readPublicRuleReviewTarget();
        const client = getSupabaseClient();
        const ruleSetId = process.env.EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID?.trim();
        if (!client || !ruleSetId) throw new Error('STAGING_CONNECTION_REQUIRED');
        const repository = new SupabaseRuleReviewRepository(client, ruleSetId);
        const access = await repository.access();
        if (!active) return;
        if (!access.authenticated) setState({ status: 'AUTH_REQUIRED', message: '관리자 로그인이 필요합니다.' });
        else if (!access.role) setState({ status: 'FORBIDDEN', message: 'Rule 검수 권한이 없습니다.' });
        else setState({ status: 'READY', repository, persistence: 'staging' });
      } catch (error) {
        if (!active) return;
        const code = error instanceof Error ? error.message : 'RULE_REVIEW_LOAD_FAILED';
        setState({ status: code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : code === 'FORBIDDEN' ? 'FORBIDDEN' : code === 'STAGING_CONNECTION_REQUIRED' || code.startsWith('STAGING_') ? 'NOT_CONFIGURED' : 'LOAD_FAILED', message: code });
      }
    })();
    return () => { active = false; };
  }, []);

  if (state.status !== 'READY') return (
    <View style={styles.empty}>
      <Text accessibilityRole="header" style={styles.title}>{state.status === 'LOADING' ? '관리자 권한을 확인하는 중이에요' : state.message}</Text>
      {state.status !== 'LOADING' ? <Text style={styles.body}>권한이 확인되기 전에는 검수 데이터가 표시되지 않습니다.</Text> : null}
    </View>
  );
  return <RuleReviewConsole repository={state.repository} persistence={state.persistence} onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />;
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  title: { ...type.title, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 520 },
});
