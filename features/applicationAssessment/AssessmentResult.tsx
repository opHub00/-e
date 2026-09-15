import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WanpanCard } from '../../components/WanpanCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, size, spacing, type } from '../../design/tokens';
import { FACT_LABELS, groupMissingInformation } from './form';
import { STAGE_LABELS, SUPPLY_LABELS } from './referenceRules';
import type { ApplicationAssessmentResult, ConditionResult } from './types';

const STATUS_LABELS = { ELIGIBLE: '신청 가능', INELIGIBLE: '신청 어려움', NEEDS_MORE_INFORMATION: '확인 필요' };
const OUTCOME_LABELS = { PASS: '충족', FAIL: '미충족', UNKNOWN: '확인 필요' };
const valueLabel = (value: string | number | boolean | null) => value === null ? '확인 전' : typeof value === 'boolean' ? (value ? '예' : '아니요') : String(value);

type Props = {
  result: ApplicationAssessmentResult;
  /** 누락 항목을 고칠 수 있는 곳으로 바로 보낸다. 결과 화면에서 막히지 않게 한다. */
  onEditProfile: () => void;
  onEditAnswers: () => void;
};

export function AssessmentResult({ result, onEditProfile, onEditAnswers }: Props) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupMissingInformation(result.missingInformation);
  const needsInformation = result.status === 'NEEDS_MORE_INFORMATION';
  const waitingOnAnnouncement = groups.announcement.length > 0;
  const compared = [...result.failedConditions, ...result.satisfiedConditions];
  return <View style={styles.stack}>
    <WanpanCard tone="lavender" style={styles.stack}>
      <Text accessibilityRole="header" style={[styles.heading, { color: result.status === 'INELIGIBLE' ? colors.error : needsInformation ? colors.warning : colors.primary }]}>{STATUS_LABELS[result.status]}</Text>
      {/* 확인 필요를 탈락이나 오류로 읽지 않도록 상태 바로 아래에서 이유를 먼저 말한다. */}
      {needsInformation ? <Text style={styles.strong}>{waitingOnAnnouncement
        ? '탈락이나 오류가 아니에요. 공고 기준을 확인하는 중이라 결과를 아직 확정하지 않았어요.'
        : '탈락이나 오류가 아니에요. 아래 정보를 채우면 다시 판정할 수 있어요.'}</Text> : null}
      <Text style={styles.title}>{SUPPLY_LABELS[result.supplyType]}</Text>
      <Text style={styles.body}>{result.stage ? STAGE_LABELS[result.stage] : '공급단계 확인 전'}</Text>
      <Text style={styles.body}>{result.stageExplanation}</Text>
      {result.score ? <Text style={styles.heading}>예상 {result.score.total} / {result.score.max}점</Text> : <Text style={styles.body}>{result.scoring === 'NOT_APPLICABLE' ? result.supplyType === 'firstHome' ? '이 유형은 가점 대신 공급단계와 추첨으로 선정돼요. 점수가 없는 것이 정상이에요.' : '이 공급단계는 가점 없이 추첨으로 선정돼요.' : '필요한 정보와 배점표가 확인되면 점수를 보여드려요.'}</Text>}
    </WanpanCard>
    {groups.answers.length + groups.profile.length > 0 ? <WanpanCard style={styles.stack}>
      <Text style={styles.title}>내가 채우면 되는 정보</Text>
      {groups.answers.length ? <View style={styles.stack}>
        <Text style={styles.strong}>추가 질문에서 입력</Text>
        {groups.answers.map(label => <Text key={label} style={styles.body}>• {label}</Text>)}
        <PrimaryButton label="추가 질문 수정하기" variant="soft" onPress={onEditAnswers} />
      </View> : null}
      {groups.profile.length ? <View style={styles.stack}>
        <Text style={styles.strong}>프로필에서 입력</Text>
        {groups.profile.map(label => <Text key={label} style={styles.body}>• {label}</Text>)}
        <PrimaryButton label="프로필에서 입력하기" variant="soft" onPress={onEditProfile} />
      </View> : null}
    </WanpanCard> : null}
    {waitingOnAnnouncement ? <WanpanCard style={styles.stack}>
      <Text style={styles.title}>공고 쪽에서 확인 중인 기준</Text>
      <Text style={styles.body}>입력으로 채울 수 있는 항목이 아니에요. 공고 원문이 확인되면 판정에 반영돼요.</Text>
      {groups.announcement.map(label => <Text key={label} style={styles.body}>• {label}</Text>)}
    </WanpanCard> : null}
    {result.score ? <WanpanCard style={styles.stack}><Text style={styles.title}>항목별 예상 가점</Text>{result.score.breakdown.map(item => <View key={item.ruleId}><Text style={styles.strong}>{item.label} · {item.points} / {item.max}점</Text><Text style={styles.body}>계산에 사용한 값: {item.input}</Text><Text style={styles.body}>적용 구간: {item.appliedBand.min === undefined ? '' : `${item.appliedBand.min} 이상 `}{item.appliedBand.max === undefined ? '' : `${item.appliedBand.max} 이하`}{item.appliedBand.min === undefined && item.appliedBand.max === undefined ? '전체' : ''}</Text></View>)}</WanpanCard> : null}
    <WanpanCard style={styles.stack}>
      <Text style={styles.title}>입력값으로 비교한 조건</Text>
      <Text style={styles.body}>확인된 입력값을 기준으로 비교한 항목이에요. 공고 원문 확인 전에는 실제 자격 충족을 뜻하지 않아요.</Text>
      {compared.map(c => <Text key={c.ruleId} style={styles.body}>{OUTCOME_LABELS[c.outcome]} · {c.label}</Text>)}
      {compared.length === 0 ? <Text style={styles.body}>아직 비교할 수 있는 조건이 없어요.</Text> : null}
    </WanpanCard>
    {result.warnings.length ? <WanpanCard style={styles.stack}><Text style={styles.title}>주의할 점</Text>{result.warnings.map(w => <Text key={w} style={styles.body}>• {w}</Text>)}</WanpanCard> : null}
    <WanpanCard style={styles.stack}><Text style={styles.title}>준비할 증빙서류</Text><Text style={styles.body}>해당 조건의 확인에 필요한 서류예요. 발급 범위와 최종 제출 목록은 공고를 확인해 주세요.</Text>{result.requiredDocuments.map(d => <Text key={d} style={styles.body}>• {d}</Text>)}</WanpanCard>
    <WanpanCard style={styles.stack}>
      <MotionPressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(v => !v)} style={styles.toggle}><Text style={styles.strong}>판정근거와 사용한 입력값 {expanded ? '접기' : '보기'}</Text></MotionPressable>
      {expanded ? <>
        {Object.entries(result.inputDates).map(([key, value]) => <Text key={key} style={styles.body}>{FACT_LABELS[key] ?? key}: {value}</Text>)}
        {[...result.satisfiedConditions, ...result.failedConditions, ...result.unknownConditions, ...result.stageConditions].map(c => <ConditionEvidence key={c.ruleId} condition={c} />)}
        {result.evidence.map(e => <View key={e.id}><Text style={styles.strong}>{e.label}</Text><Text style={styles.body}>{e.source} · {e.section}{e.tableLabel ? ` · ${e.tableLabel}` : ''}{e.page ? ` · ${e.page}쪽` : ''}</Text><Text selectable style={styles.caption}>{e.id}</Text></View>)}
        <Text selectable style={styles.caption}>규칙 버전: {result.rulesVersion}</Text>
      </> : null}
    </WanpanCard>
  </View>;
}
function ConditionEvidence({ condition }: { condition: ConditionResult }) {
  return <View style={styles.stack}>
    <Text style={styles.strong}>{condition.label} · {OUTCOME_LABELS[condition.outcome]}</Text>
    {Object.entries(condition.inputs).map(([key, value]) => <Text key={key} style={styles.body}>{key.startsWith('rule:') ? '공고 기준값' : FACT_LABELS[key] ?? key}: {valueLabel(value)}</Text>)}
    <Text selectable style={styles.caption}>{condition.ruleId} → {condition.evidenceId}</Text>
  </View>;
}
const styles = StyleSheet.create({
  stack: { gap: spacing.sm }, heading: { ...type.headline, color: colors.primary }, title: { ...type.section, color: colors.text },
  strong: { ...type.bodyStrong, color: colors.text }, body: { ...type.body, color: colors.textMuted }, caption: { ...type.caption, color: colors.textSubtle },
  toggle: { minHeight: size.touch, justifyContent: 'center' },
});
