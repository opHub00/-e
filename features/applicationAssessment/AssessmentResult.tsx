import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WanpanCard } from '../../components/WanpanCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { FACT_LABELS, groupMissingInformation } from './form';
import { STAGE_LABELS, SUPPLY_LABELS } from './referenceRules';
import { SOURCE_LABELS } from './data/useAssessmentRules';
import type { ApplicationAssessmentResult, ConditionResult, Evidence, RuleSourceStatus } from './types';

/** 법적 확정처럼 읽히지 않도록 상태를 문장으로 말한다. 내부 enum은 노출하지 않는다. */
const STATUS_LABELS = { ELIGIBLE: '신청 가능한 조건이에요', INELIGIBLE: '현재 조건으로는 신청하기 어려워요', NEEDS_MORE_INFORMATION: '확인할 정보가 더 있어요' };
const OUTCOME_LABELS = { PASS: '충족', FAIL: '미충족', UNKNOWN: '확인 필요' };
/** 사용자에게는 AI confidence 수치 대신 근거 문서의 상태만 보여준다. */
const SOURCE_NOTES: Record<RuleSourceStatus, string> = {
  REFERENCE: '아직 공고 원문을 확인하기 전이에요. 조건과 서류를 미리 살펴보는 용도로만 사용해 주세요.',
  DRAFT_SOURCE_VERIFIED: '공고 검토본을 기준으로 계산했어요. 최종 공고가 게시되면 기준이 달라질 수 있어요.',
  OFFICIAL_VERIFIED: '공식 공고문에서 확인한 기준으로 계산했어요.',
};
const valueLabel = (value: string | number | boolean | null) => value === null ? '확인 전' : typeof value === 'boolean' ? (value ? '예' : '아니요') : String(value);

type Props = {
  result: ApplicationAssessmentResult;
  /** 누락 항목을 고칠 수 있는 곳으로 바로 보낸다. 결과 화면에서 막히지 않게 한다. */
  onEditProfile: () => void;
  onEditAnswers: () => void;
};

export function AssessmentResult({ result, onEditProfile, onEditAnswers }: Props) {
  const [showSatisfied, setShowSatisfied] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const groups = groupMissingInformation(result.missingInformation);
  const needsInformation = result.status === 'NEEDS_MORE_INFORMATION';
  const waitingOnAnnouncement = groups.announcement.length > 0;
  const sourceStatus = result.sourceStatus ?? 'REFERENCE';
  const blocking = result.failedConditions;
  const pending = [...result.unknownConditions, ...result.stageConditions.filter(c => c.outcome === 'UNKNOWN')];
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
      {/* 신뢰도를 %로 말하지 않는다. 어떤 문서를 근거로 계산했는지만 밝힌다. */}
      <View style={styles.badge}><Text style={styles.badgeText}>{SOURCE_LABELS[sourceStatus]}</Text></View>
      <Text style={styles.body}>{SOURCE_NOTES[sourceStatus]}</Text>
    </WanpanCard>
    {groups.answers.length + groups.profile.length > 0 ? <WanpanCard style={styles.stack}>
      <Text accessibilityRole="header" style={styles.title}>내가 채우면 되는 정보</Text>
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
      <Text accessibilityRole="header" style={styles.title}>공고 쪽에서 확인 중인 기준</Text>
      <Text style={styles.body}>입력으로 채울 수 있는 항목이 아니에요. 공고 원문이 확인되면 판정에 반영돼요.</Text>
      {groups.announcement.map(label => <Text key={label} style={styles.body}>• {label}</Text>)}
    </WanpanCard> : null}
    {result.score ? <WanpanCard style={styles.stack}><Text accessibilityRole="header" style={styles.title}>항목별 예상 가점</Text>{result.score.breakdown.map(item => <View key={item.ruleId}><Text style={styles.strong}>{item.label} · {item.points} / {item.max}점</Text><Text style={styles.body}>계산에 사용한 값: {item.input}</Text><Text style={styles.body}>적용 구간: {item.appliedBand.min === undefined ? '' : `${item.appliedBand.min} 이상 `}{item.appliedBand.max === undefined ? '' : `${item.appliedBand.max} 이하`}{item.appliedBand.min === undefined && item.appliedBand.max === undefined ? '전체' : ''}</Text></View>)}</WanpanCard> : null}
    {/* 왜 이런 결과인지부터 답한다. 막고 있는 조건과 확인 중인 조건이 먼저, 통과한 조건은 접어 둔다. */}
    <WanpanCard style={styles.stack}>
      <Text accessibilityRole="header" style={styles.title}>이 결과가 나온 이유</Text>
      <Text style={styles.body}>확인된 입력값을 기준으로 비교한 항목이에요. 공고 원문 확인 전에는 실제 자격 충족을 뜻하지 않아요.</Text>
      {blocking.length ? <View style={styles.stack}>
        <Text style={styles.strong}>충족하지 못한 조건 {blocking.length}개</Text>
        {blocking.map(c => <Text key={c.ruleId} style={styles.body}>• {c.label}</Text>)}
      </View> : null}
      {pending.length ? <View style={styles.stack}>
        <Text style={styles.strong}>아직 확인하지 못한 조건 {pending.length}개</Text>
        {pending.map(c => <Text key={c.ruleId} style={styles.body}>• {c.label}</Text>)}
      </View> : null}
      {result.satisfiedConditions.length ? <>
        <Disclosure expanded={showSatisfied} onPress={() => setShowSatisfied(v => !v)} label={`충족한 조건 ${result.satisfiedConditions.length}개`} />
        {showSatisfied ? result.satisfiedConditions.map(c => <Text key={c.ruleId} style={styles.body}>• {c.label}</Text>) : null}
      </> : null}
      {blocking.length + pending.length + result.satisfiedConditions.length === 0 ? <Text style={styles.body}>아직 비교할 수 있는 조건이 없어요.</Text> : null}
    </WanpanCard>
    {result.warnings.length ? <WanpanCard style={styles.stack}><Text accessibilityRole="header" style={styles.title}>주의할 점</Text>{result.warnings.map(w => <Text key={w} style={styles.body}>• {w}</Text>)}</WanpanCard> : null}
    {/* 서류 10여 개가 늘 펼쳐져 있으면 결과와 근거 사이가 멀어진다. 개수를 먼저 보여주고 필요할 때 연다. */}
    <WanpanCard style={styles.stack}>
      <Text accessibilityRole="header" style={styles.title}>준비할 증빙서류 {result.requiredDocuments.length}개</Text>
      <Text style={styles.body}>해당 조건의 확인에 필요한 서류예요. 발급 범위와 최종 제출 목록은 공고를 확인해 주세요.</Text>
      <Disclosure expanded={showDocuments} onPress={() => setShowDocuments(v => !v)} label={`서류 목록 ${showDocuments ? '접기' : '보기'}`} />
      {showDocuments ? result.requiredDocuments.map(d => <Text key={d} style={styles.body}>• {d}</Text>) : null}
    </WanpanCard>
    <WanpanCard style={styles.stack}>
      <Disclosure expanded={showEvidence} onPress={() => setShowEvidence(v => !v)} label={`판정근거와 사용한 입력값 ${showEvidence ? '접기' : '보기'}`} />
      {showEvidence ? <>
        {Object.entries(result.inputDates).map(([key, value]) => <Text key={key} style={styles.body}>{FACT_LABELS[key] ?? key}: {value}</Text>)}
        {[...result.satisfiedConditions, ...result.failedConditions, ...result.unknownConditions, ...result.stageConditions].map(c => <ConditionEvidence key={c.ruleId} condition={c} />)}
        {result.evidence.map(e => <EvidenceItem key={e.id} evidence={e} />)}
        <Text style={styles.caption}>규칙 버전: {result.rulesVersion}</Text>
      </> : null}
    </WanpanCard>
  </View>;
}

function Disclosure({ expanded, onPress, label }: { expanded: boolean; onPress: () => void; label: string }) {
  return <MotionPressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={styles.toggle}><Text style={styles.link}>{label}</Text></MotionPressable>;
}

/** 근거는 사람이 읽는 이름부터 보여준다. 원문 발췌와 내부 식별자는 한 단계 더 들어가야 나온다. */
function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const [open, setOpen] = useState(false);
  const place = [evidence.source, evidence.section, evidence.tableLabel, evidence.page ? `${evidence.page}쪽` : null].filter(Boolean).join(' · ');
  return <View style={styles.stack}>
    <Text style={styles.strong}>{evidence.label}</Text>
    <Text style={styles.body}>{place}</Text>
    {evidence.textExcerpt ? <>
      <Disclosure expanded={open} onPress={() => setOpen(v => !v)} label={`공고 원문 ${open ? '접기' : '보기'}`} />
      {open ? <><Text selectable style={styles.excerpt}>{evidence.textExcerpt}</Text><Text selectable style={styles.caption}>근거 ID: {evidence.id}</Text></> : null}
    </> : null}
  </View>;
}

function ConditionEvidence({ condition }: { condition: ConditionResult }) {
  return <View style={styles.stack}>
    <Text style={styles.strong}>{condition.label} · {OUTCOME_LABELS[condition.outcome]}</Text>
    {Object.entries(condition.inputs).map(([key, value]) => <Text key={key} style={styles.body}>{key.startsWith('rule:') ? '공고 기준값' : FACT_LABELS[key] ?? key}: {valueLabel(value)}</Text>)}
  </View>;
}
const styles = StyleSheet.create({
  stack: { gap: spacing.sm }, heading: { ...type.headline, color: colors.primary }, title: { ...type.section, color: colors.text },
  strong: { ...type.bodyStrong, color: colors.text }, body: { ...type.body, color: colors.textMuted }, caption: { ...type.caption, color: colors.textSubtle },
  link: { ...type.bodyStrong, color: colors.primary },
  excerpt: { ...type.bodySm, color: colors.textMuted, borderLeftWidth: 2, borderLeftColor: colors.outline, paddingLeft: spacing.sm },
  badge: { alignSelf: 'flex-start', borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { ...type.bodySm, color: colors.primary },
  toggle: { minHeight: size.touch, justifyContent: 'center' },
});
