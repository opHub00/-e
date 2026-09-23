import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { RuleReviewConsole } from '../../features/assessmentRuleReview/ui/RuleReviewConsole';
import type { ReviewFaultPlan, ReviewGateway, ReviewLoadOutcome } from '../../features/assessmentRuleReview/repository/ReviewGateway';
import { createConfiguredReviewGateway, type ReviewPersistence } from '../../features/assessmentRuleReview/repository/createReviewGateway';
import { isRuleReviewTestEnvironment } from '../../features/assessmentRuleReview/repository/stagingTarget';
import { useReviewSession } from '../../features/assessmentRuleReview/ui/useReviewSession';
import { readReviewDraft } from '../../features/assessmentRuleReview/ui/reviewDraftStore';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';

/**
 * Admin-only rule review console.
 *
 * In dev/test an explicit seed creates the local gateway. Staging and production use the same UI
 * contract through the Supabase repository after the project identity gate succeeds. The rule set
 * comes from `?ruleSetId=` (a staging build may also carry a default).
 */
const DEV_FAULT_PLAN = '__wanpaneReviewFaultPlan' as const;

/*
  One console session holds exactly one gateway. Building it inside a memo risked a
  second repository instance on a re-render, which silently split "what was mutated"
  from "what is displayed".
*/
function failedGateway(code: string): ReviewGateway {
  return {
    async load(): Promise<ReviewLoadOutcome> { return { status: 'FAILED', code }; },
    async commit() { return { status: 'FAILED', code }; },
  };
}
/** 생성되는 라우트 타입(.expo/types)은 커밋되지 않아 최신이 아닐 수 있다. 실제 경로는 app/admin/listing-bindings.tsx 다. */
const BINDINGS_ROUTE = '/admin/listing-bindings' as Href;
const RULE_SET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Which rule set the route asks for. Nothing is chosen for the operator: an active version is never auto-selected. */
type RequestedRuleSet = { status: 'MISSING' } | { status: 'INVALID'; value: string } | { status: 'OK'; id: string };
function requestedRuleSet(value: unknown): RequestedRuleSet {
  if (typeof value !== 'string' || !value.trim()) return { status: 'MISSING' };
  const id = value.trim();
  return RULE_SET_ID.test(id) ? { status: 'OK', id } : { status: 'INVALID', value: id };
}

function resolveGateway(ruleSetId: string | null): { gateway: ReviewGateway; persistence: ReviewPersistence } {
  const plan = isRuleReviewTestEnvironment(process.env.EXPO_PUBLIC_WANPANE_ENV)
    ? ((globalThis as Record<string, unknown>)[DEV_FAULT_PLAN] ?? {}) as ReviewFaultPlan
    : {};
  const resolution = createConfiguredReviewGateway(plan, ruleSetId);
  return resolution.status === 'READY'
    ? resolution
    : { gateway: failedGateway(resolution.code), persistence: process.env.EXPO_PUBLIC_WANPANE_ENV === 'production' ? 'production' : 'staging' };
}
function useGateway() {
  const { ruleSetId } = useLocalSearchParams<{ ruleSetId?: string }>();
  const requested = requestedRuleSet(ruleSetId);
  const id = requested.status === 'OK' ? requested.id : null;
  // Per-route instance: an account change cannot reuse another actor's repository cache.
  const resolved = useMemo(() => resolveGateway(id), [id]);
  return { ...resolved, requested };
}

export default function AdminRuleReviewRoute() {
  const router = useRouter();
  const { gateway, persistence, requested } = useGateway();
  const { state, retry, invalidate } = useReviewSession(gateway);
  const [expiredDuringReview, setExpiredDuringReview] = useState(false);
  const lastDraftScope = useRef<string | null>(null);
  useEffect(() => { if (state.phase === 'READY') lastDraftScope.current = state.sessionKey; }, [state]);
  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/home')), [router]);
  const onSessionEnded = useCallback(() => { setExpiredDuringReview(true); invalidate({ phase: 'AUTH_REQUIRED' }); }, [invalidate]);
  const retryLoad = useCallback(() => { setExpiredDuringReview(false); retry(); }, [retry]);

  /*
    Opening /admin/rule-review directly names no rule set. That is a normal starting point for an
    admin, not a failure, so the console says which announcement to pick instead of showing a load
    error. The dev/test local seed keeps its own entry point and needs no id.
  */
  if (requested.status !== 'OK' && persistence !== 'local') {
    return <Shell>
      <Text accessibilityRole="header" style={styles.title}>
        {requested.status === 'MISSING' ? '검수할 공고를 선택해 주세요' : '검수 주소의 rule set ID가 올바르지 않아요'}
      </Text>
      <Text style={styles.body}>
        {requested.status === 'MISSING'
          ? 'Rule 검수 콘솔은 공고의 rule set을 지정해야 열려요. 주소 끝에 ?ruleSetId=<rule set ID>를 붙이거나, 공고 listing 연결 관리에서 검수할 공고를 골라 주세요.'
          : `주소에 있는 값(${requested.value.slice(0, 12)}${requested.value.length > 12 ? '…' : ''})은 rule set ID 형식(UUID)이 아니에요. 공고 listing 연결 관리에서 다시 열어 주세요.`}
      </Text>
      <Retry label="공고 listing 연결 관리 열기" onPress={() => router.push(BINDINGS_ROUTE)} />
    </Shell>;
  }
  if (state.phase === 'LOADING') {
    /* 이전 공고의 rule을 남겨 두지 않는다. 남으면 지금 검수 중인 공고로 읽힌다. */
    return <Shell><ActivityIndicator color={colors.primary} />
      <Text accessibilityRole="header" style={styles.title}>검수 데이터를 불러오는 중이에요</Text>
      <Text style={styles.body}>서버에서 최신 rule version을 받아오는 동안에는 이전 공고 내용을 보여주지 않아요.</Text>
    </Shell>;
  }
  if (state.phase === 'AUTH_REQUIRED') {
    const draft = lastDraftScope.current ? readReviewDraft(lastDraftScope.current) : null;
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
      initialWorkspace={state.workspace}
      gateway={gateway}
      persistence={persistence}
      actorRole={state.role}
      draftScope={state.sessionKey}
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
