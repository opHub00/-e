import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import { KioskButton } from '../ui/controls';
import { bucketTone, k } from '../ui/theme';
import {
  WHAT_IF_FACTS,
  type CopilotProgress,
  type CopilotQuestion,
  type CopilotRecommendationGroup,
  type CopilotSummary,
  type CopilotTone,
  type CopilotWhatIf,
  type CopilotWhatIfFact,
} from './copilotModel';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const TONE: Record<CopilotTone, { bg: string; fg: string }> = {
  eligible: { bg: bucketTone.eligible.bg, fg: bucketTone.eligible.fg },
  review: { bg: bucketTone.review.bg, fg: bucketTone.review.fg },
  difficult: { bg: bucketTone.difficult.bg, fg: bucketTone.difficult.fg },
};
const DISTRICT_COLOR = { 'samdo-1': k.colors.primary, 'samdo-2': k.colors.success } as const;

function Card({ children, testID, accent }: { children: ReactNode; testID: string; accent?: boolean }) {
  const { d } = useDensity();
  return <View testID={testID} style={[styles.card, accent && styles.cardAccent, { padding: d.cardPadding, gap: d.cardGap - 2 }]}>{children}</View>;
}

function Eyebrow({ icon, text }: { icon: IconName; text: string }) {
  const { d } = useDensity();
  return (
    <View style={styles.row}>
      <MaterialIcons name={icon} size={16} color={k.colors.primary} />
      <Text style={[d.type.label, styles.primary]}>{text}</Text>
    </View>
  );
}

/** 현재 분석: 두 지구 합산 개수 + 지구별 한 줄. 확률·점수 표현 없음. */
export function CopilotSummaryCard({ summary }: { summary: CopilotSummary }) {
  const { d } = useDensity();
  const chips: Array<{ label: string; value: number; tone: CopilotTone | 'pending' }> = [
    { label: '신청 가능', value: summary.eligible, tone: 'eligible' },
    { label: '확인 필요', value: summary.review, tone: 'review' },
    { label: '신청 어려움', value: summary.difficult, tone: 'difficult' },
    { label: '추가 확인', value: summary.pending, tone: 'pending' },
  ];
  return (
    <Card testID="copilot-summary">
      <Eyebrow icon="insights" text="현재 분석 · 1·2지구 공급유형 합계" />
      <View style={styles.chips}>
        {chips.map(chip => {
          const palette = chip.tone === 'pending' ? { bg: k.colors.primaryFixed, fg: k.colors.primary } : TONE[chip.tone];
          return (
            <View key={chip.label} testID={`copilot-count-${chip.tone}`} style={[styles.count, { backgroundColor: palette.bg }]}>
              <Text style={[d.type.caption, { color: palette.fg }]}>{chip.label}</Text>
              <Text style={[d.type.section, { color: palette.fg }]}>{chip.value}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.districts}>
        {summary.districts.map(item => (
          <View key={item.id} style={styles.districtLine}>
            <View style={[styles.pill, { backgroundColor: DISTRICT_COLOR[item.id] }]}><Text style={[d.type.caption, styles.onPrimary]}>{item.label}</Text></View>
            <Text style={[d.type.bodyStrong, { color: TONE[item.tone].fg }, styles.flex]} numberOfLines={2}>{item.headline}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * 지금 가장 먼저 확인할 것: 엔진이 고른 다음 질문 하나.
 * 예/아니요(또는 값) · 모름(사실별 표현) · 나중에. '왜 확인하나요?'를 열면 이유와 확인 방법.
 */
export function CopilotQuestionCard({
  question, ack, whyOpen, onToggleWhy, onAnswer, onUnknown, onLater, highlight, open, onResumeDeferred,
}: {
  question: CopilotQuestion | null;
  /** 모름·나중에로 남긴 질문. 남은 질문이 없을 때 '모두 확인했어요'라고 잘못 말하지 않도록. */
  open: { unknown: string[]; deferred: string[] };
  onResumeDeferred: () => void;
  ack: string | null;
  whyOpen: boolean;
  onToggleWhy: () => void;
  onAnswer: (value: string | number | boolean) => void;
  onUnknown: () => void;
  onLater: () => void;
  highlight: boolean;
}) {
  const { d } = useDensity();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  if (!question) {
    return (
      <Card testID="copilot-question" accent={highlight}>
        <Eyebrow icon="task-alt" text="지금 가장 먼저 확인할 것" />
        {ack ? <Text testID="copilot-ack" style={[d.type.body, styles.ack]}>{ack}</Text> : null}
        {open.deferred.length ? (
          <>
            <Text style={[d.type.bodyStrong, styles.text]}>나중에 답하기로 한 질문이 {open.deferred.length}개 있어요.</Text>
            <KioskButton testID="copilot-resume-deferred" label="미뤄 둔 질문 다시 보기" variant="soft" onPress={onResumeDeferred} />
          </>
        ) : open.unknown.length ? (
          <>
            <Text style={[d.type.bodyStrong, styles.text]}>모름으로 남긴 {open.unknown.length}개는 확인 필요로 판정했어요.</Text>
            <Text style={[d.type.caption, styles.muted]}>확인되면 결과 화면의 '추가로 확인하면' 목록에서 다시 입력해 주세요. 그다음 준비 서류와 신청 일정을 확인해 주세요.</Text>
          </>
        ) : (
          <>
            <Text style={[d.type.bodyStrong, styles.text]}>판정에 필요한 정보는 지금 입력으로 모두 확인했어요.</Text>
            <Text style={[d.type.caption, styles.muted]}>남은 것은 서류 확인이에요. 결과 화면의 준비 서류와 신청 일정을 확인해 주세요.</Text>
          </>
        )}
      </Card>
    );
  }
  const submitValue = () => {
    const raw = draft.trim();
    if (question.inputKind === 'DATE') {
      const digits = raw.replace(/\D/g, '');
      const iso = /^\d{8}$/.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}` : raw;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) { setError('날짜를 YYYY-MM-DD 또는 8자리로 입력해 주세요.'); return; }
      setDraft(''); onAnswer(iso); return;
    }
    const value = Number(raw.replaceAll(',', ''));
    if (!raw || !Number.isFinite(value) || value < 0) { setError('0 이상의 숫자를 입력해 주세요.'); return; }
    setDraft(''); onAnswer(value);
  };
  return (
    <Card testID="copilot-question" accent={highlight}>
      <Eyebrow icon="task-alt" text="지금 가장 먼저 확인할 것" />
      {ack ? <Text testID="copilot-ack" style={[d.type.body, styles.ack]}>{ack}</Text> : null}
      <Text style={[d.type.caption, styles.muted]}>두 지구 판정을 위해 이 정보를 먼저 확인하는 게 좋아요.</Text>
      <Text testID="copilot-question-title" accessibilityRole="header" style={[d.type.cardTitle, styles.text]}>{question.title}</Text>
      <View style={styles.affects}>
        {question.affects.supplyLabels.slice(0, 4).map(label => <View key={label} style={styles.affect}><Text style={[d.type.caption, styles.muted]}>{label}</Text></View>)}
      </View>
      {question.inputKind === 'BOOLEAN' ? (
        <View style={styles.options}>
          <View style={styles.optionCell}><KioskButton testID="copilot-answer-yes" label="예" variant="soft" onPress={() => onAnswer(true)} grow /></View>
          <View style={styles.optionCell}><KioskButton testID="copilot-answer-no" label="아니요" variant="soft" onPress={() => onAnswer(false)} grow /></View>
        </View>
      ) : (
        <View style={styles.valueRow}>
          <TextInput
            testID="copilot-answer-input"
            accessibilityLabel={question.title}
            value={draft}
            onChangeText={value => { setDraft(value); setError(''); }}
            placeholder={question.inputKind === 'DATE' ? 'YYYY-MM-DD' : '숫자'}
            placeholderTextColor={k.colors.textSubtle}
            keyboardType={question.inputKind === 'NUMBER' ? 'numeric' : 'numbers-and-punctuation'}
            onSubmitEditing={submitValue}
            style={[d.type.body, styles.input]}
          />
          {question.unit ? <Text style={[d.type.body, styles.muted]}>{question.unit}</Text> : null}
          <KioskButton testID="copilot-answer-submit" label="확인" onPress={submitValue} />
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={[d.type.caption, styles.error]}>{error}</Text> : null}
      <View style={styles.options}>
        <View style={styles.optionCell}><KioskButton testID="copilot-answer-unknown" label={question.unknownLabel} variant="ghost" onPress={onUnknown} grow /></View>
        <View style={styles.optionCell}><KioskButton testID="copilot-answer-later" label="나중에 답할게요" variant="ghost" onPress={onLater} grow /></View>
      </View>
      <MotionPressable testID="copilot-why-toggle" accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} accessibilityLabel="왜 확인하나요?" onPress={onToggleWhy} style={styles.whyToggle}>
        <MaterialIcons name="help-outline" size={18} color={k.colors.primary} />
        <Text style={[d.type.label, styles.primary]}>왜 확인하나요?</Text>
        <MaterialIcons name={whyOpen ? 'expand-less' : 'expand-more'} size={18} color={k.colors.primary} />
      </MotionPressable>
      {whyOpen ? (
        <View testID="copilot-why" style={styles.why}>
          <Text style={[d.type.body, styles.text]}>{question.why}</Text>
          <Text style={[d.type.caption, styles.muted]}>확인 방법: {question.help}</Text>
        </View>
      ) : null}
    </Card>
  );
}

/** 확인 상태(질문 개수 고정 진행률 대신). */
export function CopilotProgressRow({ progress }: { progress: CopilotProgress }) {
  const { d } = useDensity();
  const items = [
    { label: '답한 정보', value: progress.answered, color: k.colors.success },
    { label: '확인 필요', value: progress.pending, color: k.colors.warning },
    { label: '모름으로 남김', value: progress.unknown, color: k.colors.textMuted },
  ];
  return (
    <View testID="copilot-progress" style={styles.progress} accessibilityLabel={items.map(item => `${item.label} ${item.value}`).join(', ')}>
      <Text style={[d.type.label, styles.muted]}>확정 판정까지 확인 상태</Text>
      <View style={styles.progressItems}>
        {items.map(item => (
          <View key={item.label} style={styles.progressItem}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={[d.type.caption, styles.text]}>{item.label} <Text style={styles.strong}>{item.value}</Text></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 추천 · 확인 필요 · 신청 어려움을 지구별로 구분. */
export function CopilotRecommendations({ groups }: { groups: CopilotRecommendationGroup[] }) {
  const { density, d } = useDensity();
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? density !== 'touch';
  const columns: Array<{ key: 'recommended' | 'review' | 'difficult'; label: string; tone: CopilotTone }> = [
    { key: 'recommended', label: '추천', tone: 'eligible' },
    { key: 'review', label: '확인 필요', tone: 'review' },
    { key: 'difficult', label: '신청 어려움', tone: 'difficult' },
  ];
  return (
    <Card testID="copilot-recommendations">
      <MotionPressable accessibilityRole="button" accessibilityState={{ expanded: shown }} accessibilityLabel="지구별 판정 펼치기" onPress={() => setOpen(!shown)} style={styles.foldHead}>
        <Eyebrow icon="fact-check" text="지구별 판정" />
        <MaterialIcons name={shown ? 'expand-less' : 'expand-more'} size={20} color={k.colors.primary} />
      </MotionPressable>
      {shown ? groups.map(group => (
        <View key={group.districtId} style={styles.group}>
          <View style={[styles.pill, { backgroundColor: DISTRICT_COLOR[group.districtId] }]}><Text style={[d.type.caption, styles.onPrimary]}>{group.label}</Text></View>
          {columns.map(column => (group[column.key].length ? (
            <View key={column.key} style={styles.groupRow}>
              <View style={[styles.tag, { backgroundColor: TONE[column.tone].bg }]}><Text style={[d.type.caption, { color: TONE[column.tone].fg }]}>{column.label}</Text></View>
              <Text style={[d.type.body, styles.text, styles.flex]}>{group[column.key].join(' · ')}</Text>
            </View>
          ) : null))}
        </View>
      )) : null}
      {shown ? <Text style={[d.type.caption, styles.muted]}>당첨 가능성이 아니라 공고 조건으로 본 신청 자격이에요.</Text> : null}
    </Card>
  );
}

/**
 * 가정해 보기: 현재 프로필과 분리. '가정 중' 표시, 현재 → 가정 결과 비교, '내 정보에 적용' 없음.
 */
export function CopilotWhatIfCard({
  open, onOpen, onClose, fact, onFact, result, onRun,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  fact: CopilotWhatIfFact;
  onFact: (fact: CopilotWhatIfFact) => void;
  result: CopilotWhatIf | null;
  onRun: (value: string | number | boolean) => void;
}) {
  const { d } = useDensity();
  const [draft, setDraft] = useState('');
  if (!open) {
    return (
      <View testID="copilot-whatif" style={styles.whatIfClosed}>
        <KioskButton testID="copilot-whatif-open" label="조건이 바뀌면? 가정해 보기" icon="science" variant="soft" onPress={onOpen} />
      </View>
    );
  }
  const run = () => {
    const value = Number(draft.replaceAll(',', ''));
    if (Number.isFinite(value) && value >= 0 && draft.trim()) onRun(value);
  };
  return (
    <Card testID="copilot-whatif">
      <View style={styles.foldHead}>
        <View style={styles.assumeBadge}><MaterialIcons name="science" size={14} color={k.colors.onPrimary} /><Text style={[d.type.caption, styles.onPrimary]}>가정 중 · 내 정보는 그대로예요</Text></View>
        <KioskButton testID="copilot-whatif-close" label="닫기" variant="ghost" onPress={onClose} />
      </View>
      <View style={styles.factChips}>
        {WHAT_IF_FACTS.map(item => (
          <MotionPressable key={item.id} testID={`copilot-whatif-fact-${item.id}`} accessibilityRole="radio" accessibilityState={{ selected: item.id === fact.id }} accessibilityLabel={item.label} onPress={() => { onFact(item); setDraft(''); }} style={[styles.factChip, item.id === fact.id && styles.factChipOn]}>
            <Text style={[d.type.label, item.id === fact.id ? styles.onPrimary : styles.primary]}>{item.label}</Text>
          </MotionPressable>
        ))}
      </View>
      {fact.inputKind === 'BOOLEAN' ? (
        <View style={styles.options}>
          <View style={styles.optionCell}><KioskButton label="예라고 가정" variant="soft" onPress={() => onRun(true)} grow /></View>
          <View style={styles.optionCell}><KioskButton label="아니요라고 가정" variant="soft" onPress={() => onRun(false)} grow /></View>
        </View>
      ) : (
        <View style={styles.valueRow}>
          <TextInput testID="copilot-whatif-input" accessibilityLabel={`${fact.label} 가정 값`} value={draft} onChangeText={setDraft} onSubmitEditing={run} placeholder="가정 값" placeholderTextColor={k.colors.textSubtle} keyboardType="numeric" style={[d.type.body, styles.input]} />
          {fact.unit ? <Text style={[d.type.body, styles.muted]}>{fact.unit}</Text> : null}
          <KioskButton testID="copilot-whatif-run" label="가정 결과 보기" onPress={run} />
        </View>
      )}
      {result ? (
        <View testID="copilot-whatif-result" style={styles.whatIfResult}>
          <View style={styles.assumption}><Text style={[d.type.caption, styles.primary]}>[가정]</Text><Text style={[d.type.bodyStrong, styles.text, styles.flex]}>{result.assumption}</Text></View>
          {result.rows.map(row => (
            <View key={row.districtId} style={styles.compareRow}>
              <View style={[styles.pill, { backgroundColor: DISTRICT_COLOR[row.districtId] }]}><Text style={[d.type.caption, styles.onPrimary]}>{row.label}</Text></View>
              <View style={styles.compareCells}>
                <View style={styles.compareCell}><Text style={[d.type.caption, styles.muted]}>현재 결과</Text><Text style={[d.type.body, { color: TONE[row.before.tone].fg }]}>{row.before.headline}</Text></View>
                <MaterialIcons name="arrow-forward" size={18} color={k.colors.textSubtle} />
                <View style={styles.compareCell}><Text style={[d.type.caption, styles.muted]}>가정 결과</Text><Text style={[d.type.bodyStrong, { color: TONE[row.after.tone].fg }]}>{row.after.headline}</Text></View>
              </View>
              <Text style={[d.type.caption, styles.muted]}>
                {row.changed || row.newlyEligible.length || row.noLongerEligible.length
                  ? [row.newlyEligible.length ? `새로 신청 가능: ${row.newlyEligible.join(', ')}` : '', row.noLongerEligible.length ? `신청 어려워짐: ${row.noLongerEligible.join(', ')}` : ''].filter(Boolean).join(' · ') || '판정 결과가 달라져요'
                  : '이 가정으로는 결과가 달라지지 않아요'}
              </Text>
            </View>
          ))}
          <Text style={[d.type.caption, styles.muted]}>가정 결과는 저장하지 않아요. 실제 값이 바뀌면 질문에 다시 답해 주세요.</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { color: k.colors.text },
  muted: { color: k.colors.textMuted },
  primary: { color: k.colors.primary },
  onPrimary: { color: k.colors.onPrimary },
  strong: { fontFamily: k.type.label.fontFamily },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { backgroundColor: k.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  cardAccent: { borderColor: k.colors.primary, borderWidth: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  count: { flexGrow: 1, flexBasis: 72, minWidth: 0, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  districts: { gap: 6 },
  districtLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  ack: { color: k.colors.success },
  affects: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  affect: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: k.colors.surfaceLow },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionCell: { flexDirection: 'row', flexGrow: 1, flexBasis: 140 },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  input: { flexGrow: 1, flexBasis: 140, minWidth: 0, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, paddingHorizontal: 12, color: k.colors.text, backgroundColor: k.colors.surface },
  error: { color: k.colors.error },
  whyToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, paddingRight: 8 },
  why: { gap: 4, padding: 10, borderRadius: 12, backgroundColor: k.colors.primaryFixed },
  progress: { gap: 4, paddingHorizontal: 4 },
  progressItems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  progressItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, flexWrap: 'wrap' },
  group: { gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  groupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, minWidth: 64, alignItems: 'center' },
  whatIfClosed: { flexDirection: 'row' },
  assumeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: k.colors.warning },
  factChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  factChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: k.colors.primaryFixed },
  factChipOn: { backgroundColor: k.colors.primary },
  whatIfResult: { gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: k.colors.warning },
  assumption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compareRow: { gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  compareCells: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  compareCell: { flexGrow: 1, flexBasis: 120, minWidth: 0 },
});
