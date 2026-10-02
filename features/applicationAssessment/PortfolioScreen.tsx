import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, tint, type } from '../../design/tokens';
import { useAuthStore } from '../auth/useAuthStore';
import { getSupabaseClient } from '../auth/supabaseClient';
import { profileFieldForAssessmentFact, deriveApplicantProfileV3Lifecycle } from '../profile/v3Completeness';
import { useApplicantProfileV3Store } from '../profile/useApplicantProfileV3Store';
import { AuthGate } from '../userCentricAssessment/AuthGate';
import { userCentricFeatureFlags } from '../userCentricAssessment/featureFlags';
import type { AssessmentPortfolioItem } from './portfolioContract';
import { STAGE_LABELS, SUPPLY_LABELS } from './labels';
import { createSupabaseAssessmentPortfolioRepository } from './portfolioRepository';
import {
  markPortfolioIntroSeen,
  refreshPortfolioSession,
  startPortfolioSession,
  stopPortfolioSession,
  usePortfolioSessionStore,
} from './portfolioSession';

const flags = userCentricFeatureFlags();

const statusCopy: Record<AssessmentPortfolioItem['analysisStatus'], { label: string; tone: keyof typeof tint; icon: React.ComponentProps<typeof MaterialIcons>['name'] }> = {
  COMPLETE: { label: '계산 가능', tone: 'green', icon: 'check-circle' },
  NEEDS_USER_INPUT: { label: '추가 정보 필요', tone: 'amber', icon: 'edit-note' },
  INELIGIBLE: { label: '자격조건 미충족', tone: 'pink', icon: 'block' },
  UNAVAILABLE: { label: '분석 불가', tone: 'neutral', icon: 'info-outline' },
};

export function PortfolioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const authHydrated = useAuthStore(state => state.authHydrated);
  const session = useAuthStore(state => state.session);
  const profileState = useApplicantProfileV3Store();
  const portfolio = usePortfolioSessionStore();
  const lifecycle = deriveApplicantProfileV3Lifecycle({
    authHydrated,
    userId: session?.user.id ?? null,
    status: profileState.status,
    source: profileState.source,
    profile: profileState.profile,
    record: profileState.record,
  });

  useEffect(() => {
    if (!flags.userCentricPortfolio) router.replace('/assessment' as Href);
  }, [router]);

  useEffect(() => {
    if (!flags.userCentricPortfolio || !session || lifecycle === 'LOADING') return;
    if (lifecycle === 'NEW_USER' || lifecycle === 'PROFILE_INCOMPLETE') {
      router.replace({ pathname: '/profile-onboarding', params: { returnTo: '/assessment' } } as Href);
    }
  }, [lifecycle, router, session]);

  useEffect(() => {
    if (!flags.userCentricPortfolio || !session || lifecycle !== 'PROFILE_READY') return;
    const client = getSupabaseClient();
    if (!client) return;
    void startPortfolioSession({
      userId: session.user.id,
      repository: createSupabaseAssessmentPortfolioRepository(client),
    });
    return stopPortfolioSession;
  }, [lifecycle, profileState.record?.revision, session?.user.id]);

  const grouped = useMemo(() => portfolio.snapshot?.items ?? [], [portfolio.snapshot?.items]);
  const suggestedMissing = useMemo(() => {
    const facts = portfolio.snapshot?.missingProfileFacts ?? [];
    return facts.find(fact => profileFieldForAssessmentFact(fact.field)) ?? facts[0] ?? null;
  }, [portfolio.snapshot?.missingProfileFacts]);

  return (
    <AuthGate enabled={flags.userCentricPortfolio} returnTo="/assessment">
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <View>
            <Text style={styles.eyebrow}>내 정보로 자동 분석</Text>
            <Text style={styles.heading}>청약 Portfolio</Text>
          </View>
          <MotionPressable accessibilityRole="button" accessibilityLabel="Portfolio 새로고침" onPress={() => void refreshPortfolioSession()} style={styles.refresh}>
            <MaterialIcons name="refresh" size={21} color={colors.primary} />
          </MotionPressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {lifecycle === 'PROFILE_CONFLICT' ? (
            <StateCard icon="sync-problem" title="프로필 변경 내용을 확인해주세요" body="다른 기기의 변경과 현재 입력이 달라 자동으로 덮어쓰지 않았어요." action="정보 비교하기" onAction={() => router.push({ pathname: '/profile-onboarding', params: { returnTo: '/assessment' } } as Href)} />
          ) : lifecycle === 'PROFILE_ERROR' ? (
            <StateCard icon="cloud-off" title="프로필을 불러오지 못했어요" body="연결 상태를 확인한 뒤 다시 시도해주세요." />
          ) : portfolio.status === 'loading' || lifecycle === 'LOADING' ? (
            <StateCard icon="hourglass-top" title="여러 공고를 확인하고 있어요" body="저장된 결과는 재사용하고 필요한 공고만 다시 계산해요." loading />
          ) : portfolio.status === 'auth_required' ? (
            <StateCard icon="lock-outline" title="로그인이 다시 필요해요" body="내 정보 보호를 위해 계정 상태를 다시 확인해주세요." action="로그인" onAction={() => router.replace({ pathname: '/auth', params: { returnTo: '/assessment' } } as Href)} />
          ) : portfolio.status === 'offline' ? (
            <StateCard icon="wifi-off" title="서버에 연결되지 않았어요" body="저장 요청을 쌓아두지 않습니다. 연결 후 직접 다시 시도해주세요." action="다시 시도" onAction={() => void refreshPortfolioSession()} />
          ) : portfolio.status === 'error' ? (
            <StateCard icon="error-outline" title="Portfolio를 불러오지 못했어요" body="공고 분석 상태를 확인하지 못했습니다." action="다시 시도" onAction={() => void refreshPortfolioSession()} />
          ) : portfolio.introHydrated && !portfolio.hasSeenIntro ? (
            <View style={styles.introCard}>
              <MaterialIcons name="auto-graph" size={34} color={colors.primary} />
              <Text style={styles.title}>한 번 입력한 정보로 여러 공고를 확인해요</Text>
              <Text style={styles.body}>계산 가능한 공고, 조금 더 정보가 필요한 공고, 자격조건을 충족하지 못한 공고를 한곳에서 구분합니다.</Text>
              <MotionPressable accessibilityRole="button" onPress={() => void markPortfolioIntroSeen()} style={styles.primary}>
                <Text style={styles.primaryText}>내 공고 분석 보기</Text>
              </MotionPressable>
            </View>
          ) : (
            <>
              <PortfolioSummary items={grouped} refreshing={portfolio.status === 'refreshing'} />
              {suggestedMissing ? (
                <MissingFactCard fact={suggestedMissing} onPress={() => {
                  const field = profileFieldForAssessmentFact(suggestedMissing.field);
                  if (field) router.push({ pathname: '/profile-onboarding', params: { field: field.id, returnTo: '/assessment' } } as Href);
                  else router.push('/profile' as Href);
                }} />
              ) : null}
              {grouped.length === 0 ? (
                <StateCard icon="inbox" title="분석할 공고가 아직 없어요" body="공고를 저장하거나 관심지역을 입력하면 이곳에서 자동 분석할 수 있어요." action="공고 둘러보기" onAction={() => router.push('/discovery' as Href)} />
              ) : grouped.map(item => <PortfolioRow key={`${item.listingId}:${item.supplyType}`} item={item} onPress={() => router.push({ pathname: '/assessment', params: { listingId: item.listingId } } as Href)} />)}
              {portfolio.snapshot?.truncated ? <Text style={styles.footnote}>우선순위가 높은 {portfolio.snapshot.limit}개 공고를 먼저 보여드려요.</Text> : null}
            </>
          )}
        </ScrollView>
      </View>
    </AuthGate>
  );
}

function PortfolioSummary({ items, refreshing }: { items: AssessmentPortfolioItem[]; refreshing: boolean }) {
  const count = (status: AssessmentPortfolioItem['analysisStatus']) => items.filter(item => item.analysisStatus === status).length;
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHead}><Text style={styles.title}>현재 분석 상태</Text>{refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : null}</View>
      <View style={styles.summaryGrid}>
        <SummaryStat label="계산 가능" value={count('COMPLETE')} />
        <SummaryStat label="정보 필요" value={count('NEEDS_USER_INPUT')} />
        <SummaryStat label="미충족" value={count('INELIGIBLE')} />
        <SummaryStat label="분석 불가" value={count('UNAVAILABLE')} />
      </View>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function MissingFactCard({ fact, onPress }: { fact: NonNullable<ReturnType<typeof usePortfolioSessionStore.getState>['snapshot']>['missingProfileFacts'][number]; onPress: () => void }) {
  const field = profileFieldForAssessmentFact(fact.field);
  return (
    <View style={styles.missingCard}>
      <View style={styles.rowTop}><MaterialIcons name="add-task" size={21} color={colors.primary} /><Text style={styles.cardTitle}>정보 하나를 더 확인해볼까요?</Text></View>
      <Text style={styles.body}>{field?.label ?? fact.field}을 입력하면 최대 {fact.completionImpact.becomesCalculableCount || fact.affectedListingCount}개 공고의 분석을 더 진행할 수 있어요.</Text>
      <MotionPressable accessibilityRole="button" onPress={onPress} style={styles.inlineButton}><Text style={styles.inlineButtonText}>{field ? `${field.label} 입력하기` : '프로필 확인하기'}</Text></MotionPressable>
    </View>
  );
}

function PortfolioRow({ item, onPress }: { item: AssessmentPortfolioItem; onPress: () => void }) {
  const copy = statusCopy[item.analysisStatus];
  const tone = tint[copy.tone];
  const score = item.scoringStatus === 'NOT_APPLICABLE' ? '가점제 아님' : item.score === null ? '점수 확인 중' : `${item.score}${item.scoreMax === null ? '' : ` / ${item.scoreMax}`}점`;
  return (
    <MotionPressable accessibilityRole="button" onPress={onPress} style={styles.item}>
      <View style={styles.rowTop}>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}><MaterialIcons name={copy.icon} size={14} color={tone.fg} /><Text style={[styles.statusText, { color: tone.fg }]}>{copy.label}</Text></View>
        {item.freshness !== 'FRESH' ? <Text style={styles.stale}>업데이트 필요</Text> : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.listing.title}</Text>
      <Text style={styles.meta}>{SUPPLY_LABELS[item.supplyType]} · {item.listing.region ?? '지역 확인 중'}</Text>
      <View style={styles.resultLine}><Text style={styles.score}>{score}</Text>{item.stage ? <Text style={styles.stage}>{STAGE_LABELS[item.stage]}</Text> : null}</View>
      {item.missingUserFields.length ? <Text style={styles.missingText}>추가 정보 {item.missingUserFields.length}개</Text> : null}
    </MotionPressable>
  );
}

function StateCard({ icon, title, body, action, onAction, loading = false }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string; action?: string; onAction?: () => void; loading?: boolean }) {
  return (
    <View style={styles.stateCard}>
      {loading ? <ActivityIndicator color={colors.primary} /> : <MaterialIcons name={icon} size={28} color={colors.primary} />}
      <Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text>
      {action && onAction ? <MotionPressable accessibilityRole="button" onPress={onAction} style={styles.primary}><Text style={styles.primaryText}>{action}</Text></MotionPressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.screen, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.hairline },
  eyebrow: { ...type.caption, color: colors.primary }, heading: { ...type.page, color: colors.text }, refresh: { width: size.iconButton, height: size.iconButton, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.screen, paddingBottom: spacing.xl, gap: spacing.md },
  introCard: { padding: spacing.lg, gap: spacing.md, borderRadius: radius.card, backgroundColor: colors.lavender },
  stateCard: { padding: spacing.lg, gap: spacing.md, alignItems: 'flex-start', borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  summary: { padding: spacing.md, gap: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface }, summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryGrid: { flexDirection: 'row', gap: spacing.xs }, stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceContainer }, statValue: { ...type.section, color: colors.text }, statLabel: { ...type.micro, color: colors.textMuted },
  missingCard: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.card, backgroundColor: tint.purple.bg },
  item: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill }, statusText: { ...type.micro }, stale: { ...type.micro, color: colors.warning },
  title: { ...type.section, color: colors.text }, cardTitle: { ...type.bodyLgStrong, color: colors.text }, body: { ...type.body, color: colors.textMuted }, meta: { ...type.caption, color: colors.textMuted }, resultLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }, score: { ...type.bodyStrong, color: colors.text }, stage: { ...type.caption, color: colors.primary }, missingText: { ...type.caption, color: colors.warning }, footnote: { ...type.caption, textAlign: 'center', color: colors.textMuted },
  primary: { minHeight: size.control, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, backgroundColor: colors.primary }, primaryText: { ...type.bodyStrong, color: colors.onPrimary }, inlineButton: { alignSelf: 'flex-start', minHeight: size.touch, justifyContent: 'center' }, inlineButtonText: { ...type.bodySmStrong, color: colors.primary },
});
