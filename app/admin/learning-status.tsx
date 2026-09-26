import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminChrome } from '../../features/adminPortal/AdminShell';
import { StatusPill } from '../../components/StatusPill';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { Appear } from '../../components/motion/Appear';
import { colors, radius, size, spacing, tint, type } from '../../design/tokens';
import { getSupabaseClient } from '../../features/auth/supabaseClient';
import { readPublicRuleReviewTarget } from '../../features/assessmentRuleReview/repository/stagingTarget';
import { bindingErrorMessage } from '../../features/assessmentRuleReview/repository/ListingBindingRepository';
import { LearningStatusRepository, type LearningStatusClient } from '../../features/adminLearningStatus/repository';
import {
  buildLearningRows, lifecycleLabel, summarizeLearningRows, type LearningRow, type ObservedState, type Stage,
} from '../../features/adminLearningStatus/domain';

type Load =
  | { phase: 'LOADING' }
  | { phase: 'READY'; role: 'reviewer' | 'admin'; rows: LearningRow[] }
  | { phase: 'FAILED'; code: string };

function useRepository(): LearningStatusRepository | { code: string } {
  return useMemo(() => {
    try {
      readPublicRuleReviewTarget();
      const client = getSupabaseClient();
      if (!client) return { code: 'REVIEW_CONNECTION_REQUIRED' };
      return new LearningStatusRepository(client as unknown as LearningStatusClient);
    } catch (error) {
      return { code: error instanceof Error ? error.message : 'REVIEW_CONNECTION_REQUIRED' };
    }
  }, []);
}

/** 단계 색은 뜻이 다르다. 관측됨=초록, 관측했으나 없음=중립, 관측 불가=호박. 색만으로 구분하지 않고 아이콘·문구를 함께 쓴다. */
const STAGE_VIEW: Record<ObservedState, { tone: keyof typeof tint; icon: 'check-circle' | 'remove-circle-outline' | 'help-outline' }> = {
  OBSERVED: { tone: 'green', icon: 'check-circle' },
  NOT_OBSERVED: { tone: 'neutral', icon: 'remove-circle-outline' },
  NOT_OBSERVABLE: { tone: 'amber', icon: 'help-outline' },
};

/**
 * 공고 학습 현황 (읽기 전용).
 *
 * 이 화면은 아무것도 바꾸지 않는다. 버튼은 새로 불러오기와 기존 화면으로 가는 이동뿐이다.
 * 표시하는 값은 전부 지금 클라이언트가 실제로 관측한 것이고, 관측할 수 없는 것은
 * 비어 있는 대신 "확인 불가"라고 적는다. 추출·수집 진행 상태는 근거가 없어 표시하지 않는다.
 */
export default function LearningStatusRoute() {
  const router = useRouter();
  const repository = useRepository();
  const [load, setLoad] = useState<Load>({ phase: 'LOADING' });
  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/home')), [router]);

  const refresh = useCallback(async () => {
    if (!(repository instanceof LearningStatusRepository)) { setLoad({ phase: 'FAILED', code: repository.code }); return; }
    setLoad({ phase: 'LOADING' });
    const result = await repository.load();
    setLoad(result.status === 'READY'
      ? { phase: 'READY', role: result.role, rows: buildLearningRows(result.input) }
      : { phase: 'FAILED', code: result.code });
  }, [repository]);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <AdminChrome title="분석 현황" subtitle="공고마다 수집 → 규칙 생성 → 검수 → 활성화 → 공고 연결 중 어디까지 왔는지 보여드려요.">
      <>
        {load.phase === 'LOADING' ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>학습 현황을 불러오는 중이에요</Text>
            <View style={styles.skeletonGroup}>{[0, 1, 2].map(n => <View key={n} style={styles.skeleton} />)}</View>
          </View>
        ) : null}

        {load.phase === 'FAILED' ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              {load.code === 'AUTH_REQUIRED' ? '관리자 로그인이 필요해요' : load.code === 'FORBIDDEN' ? '이 계정에는 권한이 없어요' : '학습 현황을 불러오지 못했어요'}
            </Text>
            <Text style={styles.body}>
              {load.code === 'AUTH_REQUIRED' || load.code === 'FORBIDDEN' ? bindingErrorMessage(load.code) : '서버에서 확인하지 못했어요. 이 화면은 읽기만 하므로 바뀐 것은 없어요.'}
            </Text>
            <LinkButton label={load.code === 'AUTH_REQUIRED' ? '로그인하러 가기' : '다시 불러오기'}
              onPress={() => (load.code === 'AUTH_REQUIRED' ? router.push('/auth') : void refresh())} />
          </View>
        ) : null}

        {load.phase === 'READY' ? <Ready role={load.role} rows={load.rows} onRefresh={() => void refresh()} router={router} /> : null}
      </>
    </AdminChrome>
  );
}

function Ready({ role, rows, onRefresh, router }: { role: 'reviewer' | 'admin'; rows: LearningRow[]; onRefresh: () => void; router: ReturnType<typeof useRouter> }) {
  const summary = summarizeLearningRows(rows);
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.badge}>{role === 'admin' ? '관리자 · 읽기 전용 화면' : '검수자 · 읽기 전용 화면'}</Text>
        <Text style={styles.body}>
          공고 {summary.announcements}건 · 활성 규칙 {summary.withActiveRules}건 · 검수 상태 확인 가능 {summary.reviewObservable}건 · listing 연결 {summary.bound}건
        </Text>
        <Text style={styles.note}>
          이 화면은 아무것도 바꾸지 않아요. 검수 중이거나 비활성인 규칙 버전은 권한 정책상 여기서 볼 수 없어요.
        </Text>
        <LinkButton label="새로 불러오기" onPress={onRefresh} />
      </View>

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>표시할 공고가 없어요</Text>
          <Text style={styles.body}>등록된 공고가 없거나, 이 계정이 볼 수 있는 공고가 없어요.</Text>
        </View>
      ) : null}

      {rows.map(row => (
        <Appear key={row.announcementId} replayKey={row.announcementId} distance={6} style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{row.title}</Text>
          <View style={styles.pills}>
            <StatusPill label={row.officialLabel} tone={row.officialLabel === '공식 공고 기준' ? 'green' : 'neutral'} icon="verified" />
            <StatusPill label={row.ruleSetId ? '활성화된 규칙 있음' : '활성화된 규칙 없음'} tone={row.ruleSetId ? 'green' : 'amber'} icon={row.ruleSetId ? 'gavel' : 'help-outline'} />
            <StatusPill label={row.reviewObservable ? '검수 상태 확인 가능' : '검수 상태 확인 불가'} tone={row.reviewObservable ? 'green' : 'amber'} icon={row.reviewObservable ? 'fact-check' : 'help-outline'} />
            <StatusPill label={row.listingIds.length ? `listing 연결 ${row.listingIds.length}건` : 'listing 연결 없음'} tone={row.listingIds.length ? 'green' : 'neutral'} icon="link" />
          </View>

          <StageTrack stages={row.stages} />

          <View style={styles.facts}>
            <Fact label="공고 ID" value={row.announcementId} />
            <Fact label="출처 · 공급기관" value={[row.source, row.publisher].filter(Boolean).join(' · ') || '확인 불가'} />
            <Fact label="지역 · 공고일" value={[row.regionName, row.announcementDate].filter(Boolean).join(' · ') || '확인 불가'} />
            <Fact label="활성 규칙 버전" value={row.version ?? '확인 불가'} />
            <Fact label="규칙 수" value={row.ruleCount === null ? '확인 불가' : `${row.ruleCount}개`} />
            <Fact label="승인된 규칙" value={row.approvedCount === null ? '확인 불가' : `${row.approvedCount}개`} />
            <Fact label="검수 상태" value={row.reviewObservable ? lifecycleLabel(row.lifecycleStatus) : '확인 불가'} />
            <Fact label="연결된 listing" value={row.listingIds.length ? row.listingIds.join(', ') : '없음'} />
            <Fact label="마지막 업데이트" value={row.updatedAt ? row.updatedAt.slice(0, 19).replace('T', ' ') : '확인 불가'} />
          </View>

          {row.notes.length ? (
            <View style={styles.notes}>
              {row.notes.map(note => (
                <Text key={note} style={styles.noteItem}>· {note}</Text>
              ))}
            </View>
          ) : null}

          <View style={styles.links}>
            {row.ruleSetId ? <LinkButton label="검수 콘솔 열기" onPress={() => router.push(`/admin/rule-review?ruleSetId=${row.ruleSetId}` as Href)} /> : null}
            <LinkButton label="listing 연결 관리 열기" onPress={() => router.push('/admin/listing-bindings' as Href)} />
          </View>
        </Appear>
      ))}
    </>
  );
}

/** 수집 → 규칙 → 검수 → 활성화 → 연결. 색·아이콘·문구를 함께 써서 색만으로 구분하지 않는다. */
function StageTrack({ stages }: { stages: Stage[] }) {
  return (
    <View style={styles.track}>
      {stages.map((stage, index) => {
        const view = STAGE_VIEW[stage.state];
        return (
          <View key={stage.key} style={styles.stage}>
            {index > 0 ? <View style={styles.connector} /> : null}
            <View style={[styles.stageBody, { backgroundColor: tint[view.tone].bg }]}>
              <StatusPill label={stage.label} tone={view.tone} icon={view.icon} />
              <Text style={[styles.stageDetail, { color: tint[view.tone].fg }]}>{stage.detail}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.factRow}>
    <Text style={styles.factLabel}>{label}</Text>
    <Text style={styles.factValue}>{value}</Text>
  </View>
);

const LinkButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <MotionPressable accessibilityRole="button" onPress={onPress} style={styles.link}>
    <Text style={styles.linkText}>{label}</Text>
  </MotionPressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.sm },
  title: { ...type.section, color: colors.text },
  badge: { ...type.bodySmStrong, color: colors.primary },
  body: { ...type.body, color: colors.textMuted },
  note: { ...type.bodySm, color: colors.textSubtle },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  track: { gap: 4 },
  stage: { gap: 4 },
  connector: { width: 2, height: 10, marginLeft: 14, backgroundColor: colors.surfaceHigh },
  stageBody: { borderRadius: radius.button, padding: spacing.sm, gap: 4, alignItems: 'flex-start' },
  stageDetail: { ...type.bodySm },
  facts: { gap: 2 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  factLabel: { ...type.bodySm, color: colors.textSubtle, flexShrink: 0 },
  factValue: { ...type.bodySm, color: colors.text, flexShrink: 1, textAlign: 'right' },
  notes: { gap: 2, backgroundColor: colors.surfaceContainer, borderRadius: radius.button, padding: spacing.sm },
  noteItem: { ...type.bodySm, color: colors.textMuted },
  links: { gap: spacing.xs },
  link: { minHeight: size.touch, justifyContent: 'center' },
  linkText: { ...type.bodySmStrong, color: colors.primary },
  skeletonGroup: { gap: spacing.xs },
  skeleton: { height: 14, borderRadius: radius.button, backgroundColor: colors.surfaceHigh },
});
