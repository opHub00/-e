import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, spacing, type } from '../../design/tokens';
import { useAuthStore } from '../auth/useAuthStore';
import { AdminButton, Notice, SectionCard } from '../adminPortal/ui/AdminKit';
import { connectedJejuV2Candidate } from './source';
import type { JejuV2CandidateView } from './reviewCandidateContract.ts';

const classification: Record<string, string> = {
  REQUIRES_ADMIN_DECISION: '관리자 결정 필요', RULE_SEMANTIC_RISK: '규칙 의미 위험',
  EVIDENCE_RISK: '근거 위험', SAFE_WARNING: '안전 경고', BLOCKER: '차단',
};
const supplyName: Record<string, string> = {
  student: '대학생', youth: '청년', newlywed: '신혼부부', senior: '고령자', housingBenefit: '주거급여수급자',
};
const text = (value: unknown) => value === null || value === undefined ? '원문에 수치 없음 · NOT_IN_SOURCE'
  : typeof value === 'object' ? JSON.stringify(value) : String(value);
const locator = (value: Record<string, unknown>) => `PDF ${Array.isArray(value.pages) ? value.pages.join(', ') : '위치 확인 필요'}쪽 · ${JSON.stringify(value)}`;

/** Repository candidate is read through the existing server-authorized Admin API, never a browser fixture. */
export function JejuV2ReviewPanel({ enabled }: { enabled: boolean }) {
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const [candidate, setCandidate] = useState<JejuV2CandidateView | null>(null);
  const [loadedForToken, setLoadedForToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changedOnly, setChangedOnly] = useState(true);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!enabled || !token) return;
    let active = true;
    connectedJejuV2Candidate(token).then(value => { if (active) { setCandidate(value); setLoadedForToken(token); setError(null); } })
      .catch(() => { if (active) { setCandidate(null); setLoadedForToken(null); setError('검수 후보를 불러오지 못했습니다. 연결과 권한을 확인해 주세요.'); } });
    return () => { active = false; };
  }, [enabled, token]);
  if (!enabled) return null;
  if (error && loadedForToken === null) return <Notice tone="amber" icon="error-outline">{error}</Notice>;
  if (!candidate || loadedForToken !== token) return <Text style={styles.muted}>검수 후보를 불러오는 중…</Text>;
  const rules = changedOnly ? candidate.rules.filter(rule => rule.changed) : candidate.rules;
  return <View testID="jeju-v2-review-candidate" style={styles.stack}>
    <SectionCard title={`${candidate.title} · 검수 후보`} description="저장소의 미승인 후보입니다. Staging에는 아직 등록되지 않았으며 공개 판정에 사용되지 않습니다.">
      <View style={styles.stack}>
        <Text style={styles.strong}>REVIEW_CANDIDATE · {candidate.publicationStatus} · 승인/활성화 불가</Text>
        <Text style={styles.muted}>공고군 {candidate.noticeFamily} · {candidate.version} · 이전 {candidate.previousVersion}</Text>
        <Text style={styles.muted}>원문 SHA-256 {candidate.source.sha256}</Text>
        <Text style={styles.muted}>원문 검증 {candidate.sourceVerification} · 공급유형 {candidate.supplyTypes.map(value => supplyName[value] ?? value).join(' / ')}</Text>
        <Text style={styles.strong}>규칙 {candidate.ruleCount} · 변경 {candidate.changedRuleCount} · 경고 {candidate.warningCount} · 미해결 차단 {candidate.blockerCount}</Text>
        <AdminButton label="공식 공고 열기" tone="quiet" icon="open-in-new" onPress={() => void Linking.openURL(candidate.source.url)} />
        <AdminButton label="공식 PDF 열기" tone="quiet" icon="open-in-new" onPress={() => void Linking.openURL(candidate.source.pdfUrl)} />
        <Notice tone="amber" icon="lock-outline">{candidate.reviewActions.reason} 검수 결정은 저장하지 않았습니다.</Notice>
      </View>
    </SectionCard>
    <SectionCard title="미해결 차단 항목" description="승인 전 원문·입력 범위 대조가 필요합니다.">
      <View style={styles.stack} testID="jeju-v2-unresolved-blocker">
        <Text style={styles.strong}>{candidate.blocker.description}</Text>
        <Text style={styles.muted}>영향 공급유형: {candidate.blocker.affectedSupplyTypes.map(value => supplyName[value] ?? value).join(' / ')}</Text>
        <Text style={styles.muted}>영향 규칙: {candidate.blocker.ruleKeys.join(', ')}</Text>
        <Text style={styles.muted}>모호성: {candidate.blocker.causes.join(' / ')}</Text>
        <Text style={styles.muted}>현재 판정: {candidate.blocker.assessmentImpact}</Text>
        <Text style={styles.muted}>검수 제안: {candidate.blocker.nextAction}</Text>
        {candidate.blocker.locators.map((item, index) => <Text key={`${item.ruleId}-${index}`} style={styles.muted}>근거 {item.ruleId}: {item.section} · {locator(item.locator)}</Text>)}
        <Text style={styles.strong}>결정 선택지 (Staging 등록 후 저장 가능)</Text>
        <Text style={styles.muted}>{candidate.blocker.resolutionOptions.join(' / ')}</Text>
      </View>
    </SectionCard>
    <SectionCard title="원문에 수치 없는 5개 셀" description="0이나 기본값으로 해석하지 않습니다.">
      <View style={styles.stack} testID="jeju-v2-not-in-source">
        {candidate.notInSource.map(item => <View key={item.parameterId} style={styles.row}>
          <Text style={styles.strong}>{supplyName[item.supplyType] ?? item.supplyType} · {item.source.section}</Text>
          <Text style={styles.muted}>v1 {text(item.v1Value)} → v2 {item.displayValue}</Text>
          <Text style={styles.muted}>근거 {item.source.locator} · {item.source.sourceWording}</Text>
        </View>)}
      </View>
    </SectionCard>
    <SectionCard title="파라미터 변경" description="표의 빈 셀과 평가 범위 변경을 나눠 검수합니다.">
      <View style={styles.stack} testID="jeju-v2-parameter-diff">
        {candidate.parameterChanges.map(item => <View key={item.key} style={styles.row}>
          <Text style={styles.strong}>{item.key}</Text>
          <Text style={styles.muted}>v1 {text(item.oldValue)} → v2 {text(item.newValue)}</Text>
        </View>)}
      </View>
    </SectionCard>
    <SectionCard title="v1 ↔ v2 규칙 비교" description="조건·적용 대상·원문 위치와 판정 영향은 각각 따로 확인합니다.">
      <View style={styles.stack} testID="jeju-v2-rule-diff">
        <MotionPressable accessibilityRole="button" accessibilityState={{ selected: changedOnly }} onPress={() => setChangedOnly(value => !value)} style={styles.toggle}>
          <Text style={styles.strong}>{changedOnly ? '✓ 변경된 규칙만' : '전체 규칙'} · {rules.length}건 (전환)</Text>
        </MotionPressable>
        {rules.map(rule => {
          const change = candidate.changes.find(item => item.ruleId === rule.id);
          return <View key={rule.id} style={styles.row}>
            <Text style={styles.strong}>{supplyName[rule.supplyType] ?? rule.supplyType} · {rule.label} {rule.changed ? '· 변경' : ''}</Text>
            <Text style={styles.muted}>평가 대상: {rule.scopeLabel} · 검수 대기</Text>
            {change ? <>
              <Text style={styles.muted}>조건: {text(change.v1Condition)} → {text(change.v2Condition)}</Text>
              <Text style={styles.muted}>범위: {change.v1Scope} → {change.v2Scope}</Text>
              <Text style={styles.muted}>위치: {locator(change.v1Locator)} → {locator(change.v2Locator)}</Text>
              <Text style={styles.muted}>판정 영향: {change.userImpact}</Text>
              <Text style={styles.muted}>검수 지점: {change.adminReviewPoint}</Text>
            </> : <Text style={styles.muted}>직전 버전 대비 변경 항목 아님 · 근거 {rule.evidence.map(item => item.section).join(' / ')}</Text>}
          </View>;
        })}
      </View>
    </SectionCard>
    <SectionCard title="경고 22건" description={Object.entries(candidate.warningCounts).map(([key, count]) => `${classification[key] ?? key} ${count}`).join(' · ')}>
      <View style={styles.stack} testID="jeju-v2-warnings">
        <AdminButton label={expanded ? '경고 접기' : '경고 모두 보기'} tone="quiet" icon="rule" onPress={() => setExpanded(value => !value)} />
        {expanded ? candidate.warnings.map(item => <View key={item.id} style={styles.row}>
          <Text style={styles.strong}>{item.id} · {classification[item.classification] ?? item.classification} · 심각도 {item.severity} · {supplyName[item.supplyType] ?? item.supplyType}</Text>
          <Text style={styles.muted}>규칙 {item.ruleId} · {item.message}</Text>
          <Text style={styles.muted}>원문 근거: {item.evidence.length ? item.evidence.map(source => `${source.section} · ${locator(source.locator)}`).join(' / ') : '근거 검수 필요'}</Text>
          <Text style={styles.muted}>근거/판정 영향 {item.evidenceImpactPossible ? '있음' : '없음'} / {item.assessmentImpactPossible ? '있음' : '없음'}</Text>
          <Text style={styles.muted}>검수 메모 제안: {item.recommendedAction} · 관리자 결정 {item.adminDecisionRequired ? '필요' : '선택'} · 실제 메모 미등록</Text>
        </View>) : null}
      </View>
    </SectionCard>
    <SectionCard title="경계 사례 v1/v2" description="같은 입력을 두 버전에서 비교한 검수 자료입니다. 공개 판정에 사용하지 않습니다.">
      <View style={styles.stack} testID="jeju-v2-boundary-comparison">
        {candidate.boundaryComparisons.map(item => <View key={item.id} style={styles.row}>
          <Text style={styles.strong}>{item.persona}: v1 {item.v1Result} → v2 {item.v2Result}</Text>
          <Text style={styles.muted}>{item.reason} · 근거 {item.sourceLocator}</Text>
        </View>)}
      </View>
    </SectionCard>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md }, row: { gap: 4, padding: spacing.sm, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.cardSm },
  strong: { ...type.bodySmStrong, color: colors.text }, muted: { ...type.caption, color: colors.textMuted },
  toggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.button,
    borderWidth: 1, borderColor: colors.outline },
});
