import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { RuleReviewConsole } from '../../features/assessmentRuleReview/ui/RuleReviewConsole';
import { createBrowserRuleReviewRepository } from '../../features/assessmentRuleReview/repository/RuleReviewRepository';
import { createLocalReviewGateway, type ReviewFaultPlan, type ReviewGateway, type ReviewLoadOutcome } from '../../features/assessmentRuleReview/repository/ReviewGateway';
import { useReviewSession } from '../../features/assessmentRuleReview/ui/useReviewSession';
import { readReviewDraft } from '../../features/assessmentRuleReview/ui/reviewDraftStore';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';

/**
 * Admin-only rule review console.
 *
 * There is no admin authentication yet, so this route is deliberately unreachable
 * from user navigation: nothing links to it and it is not a tab. Until the server
 * repository and admin auth land, the gateway is backed by an explicitly injected
 * dev/test seed — no Supabase client, database read/write or activation.
 *
 * The session states below are the ones a networked deployment will produce, so the
 * console is exercised against them now rather than after the transport is wired.
 */
const DEV_FAULT_PLAN = '__wanpaneReviewFaultPlan' as const;

/*
  One console session holds exactly one gateway. Building it inside a memo risked a
  second repository instance on a re-render, which silently split "what was mutated"
  from "what is displayed".
*/
let cachedGateway: ReviewGateway | null = null;
function resolveGateway(): ReviewGateway {
  /* A harness may force transport outcomes; the domain still decides what is legal. */
  const plan = ((globalThis as Record<string, unknown>)[DEV_FAULT_PLAN] ?? {}) as ReviewFaultPlan;
  const repository = createBrowserRuleReviewRepository();
  if (repository) return createLocalReviewGateway(repository, plan);
  // Fail closed: without an explicitly injected dev seed there is nothing to review.
  return {
    async load(): Promise<ReviewLoadOutcome> { return { status: 'FAILED', code: 'REVIEW_SEED_NOT_INJECTED' }; },
    async commit() { return { status: 'FAILED', code: 'REVIEW_SEED_NOT_INJECTED' }; },
  };
}
function useGateway(): ReviewGateway {
  return useMemo(() => (cachedGateway ??= resolveGateway()), []);
}

export default function AdminRuleReviewRoute() {
  const router = useRouter();
  const gateway = useGateway();
  const { state, retry, invalidate } = useReviewSession(gateway);
  const [expiredDuringReview, setExpiredDuringReview] = useState(false);
  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/home')), [router]);
  const onSessionEnded = useCallback(() => { setExpiredDuringReview(true); invalidate({ phase: 'AUTH_REQUIRED' }); }, [invalidate]);
  const retryLoad = useCallback(() => { setExpiredDuringReview(false); retry(); }, [retry]);

  if (state.phase === 'LOADING') {
    /* 이전 공고의 rule을 남겨 두지 않는다. 남으면 지금 검수 중인 공고로 읽힌다. */
    return <Shell><ActivityIndicator color={colors.primary} />
      <Text accessibilityRole="header" style={styles.title}>검수 데이터를 불러오는 중이에요</Text>
      <Text style={styles.body}>서버에서 최신 rule version을 받아오는 동안에는 이전 공고 내용을 보여주지 않아요.</Text>
    </Shell>;
  }
  if (state.phase === 'AUTH_REQUIRED') {
    const draft = readReviewDraft();
    return <Shell>
      <Text accessibilityRole="header" style={styles.title}>{expiredDuringReview ? '로그인이 만료됐어요' : '관리자 로그인이 필요해요'}</Text>
      <Text style={styles.body}>
        {expiredDuringReview
          ? '마지막 작업은 저장되지 않았어요. 다시 로그인하면 이어서 검수할 수 있어요.'
          : 'Rule 검수 콘솔은 관리자 계정으로만 열 수 있어요.'}
      </Text>
      {draft ? <Text style={styles.draft}>작성하던 수정 내용({draft.ruleId})은 이 브라우저에 남아 있어요. 다시 로그인하면 이어서 쓸 수 있어요.</Text> : null}
      <Retry label="다시 로그인하고 불러오기" onPress={retryLoad} />
    </Shell>;
  }
  if (state.phase === 'FORBIDDEN') {
    return <Shell>
      <Text accessibilityRole="header" style={styles.title}>이 계정에는 검수 권한이 없어요</Text>
      <Text style={styles.body}>{state.actor ? `${state.actor} 계정은 ` : ''}Rule 검수자로 등록되어 있지 않아요. 권한이 필요하면 운영 담당자에게 요청해 주세요.</Text>
      <Retry label="다른 계정으로 다시 시도" onPress={retryLoad} />
    </Shell>;
  }
  if (state.phase === 'OFFLINE') {
    return <Shell>
      <Text accessibilityRole="header" style={styles.title}>네트워크에 연결되어 있지 않아요</Text>
      <Text style={styles.body}>검수 데이터를 불러오지 못했어요. 검수 결정은 오프라인에서 자동으로 저장되지 않으니 연결을 확인한 뒤 다시 불러와 주세요.</Text>
      <Retry label="다시 불러오기" onPress={retryLoad} />
    </Shell>;
  }
  if (state.phase === 'FAILED') {
    return <Shell>
      <Text accessibilityRole="header" style={styles.title}>검수 데이터를 불러오지 못했어요</Text>
      <Text style={styles.body}>
        {state.code === 'REVIEW_SEED_NOT_INJECTED'
          ? '관리자 backend 연결 전에는 명시적으로 주입한 개발·테스트 seed에서만 콘솔을 열 수 있어요.'
          : `잠시 후 다시 시도해 주세요. (${state.code})`}
      </Text>
      <Retry label="다시 불러오기" onPress={retryLoad} />
    </Shell>;
  }
  return (
    <RuleReviewConsole
      repository={state.repository}
      gateway={gateway}
      onBack={back}
      onSessionEnded={onSessionEnded}
      onRetryLoad={retryLoad}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <View style={styles.empty}>{children}</View>;
}
function Retry({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <MotionPressable accessibilityRole="button" onPress={onPress} style={styles.retry}>
      <Text style={styles.retryText}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.background },
  title: { ...type.title, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', maxWidth: 520 },
  draft: { ...type.bodySm, color: colors.primary, textAlign: 'center', maxWidth: 520 },
  retry: { minHeight: size.touch, justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.md },
  retryText: { ...type.bodySmStrong, color: colors.primary },
});
