import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import type { KioskAnswers } from '../model';
import type { AnswerStateMap } from '../questionPolicy';
import { SAMDO_ELIGIBILITY_LABELS, type SamdoRecommendation } from '../samdo';
import { KioskButton } from '../ui/controls';
import { k } from '../ui/theme';
import {
  applySamdoResolvedFact,
  buildSamdoResolutionCenter,
  SAMDO_SIMULATION_FACTS,
  simulateSamdoRecommendation,
  type SamdoFactValue,
  type SamdoInputKind,
  type SamdoRefinementFactId,
  type SamdoResolvedAnswers,
  type SamdoSimulationFactId,
  type SamdoSimulationOverrides,
} from './samdoRefinement';

type Props = {
  answers: KioskAnswers;
  answerStates: AnswerStateMap;
  recommendation: SamdoRecommendation;
  onResolve: (resolved: SamdoResolvedAnswers) => void;
};

const STATUS_TONE = {
  DOES_NOT_KNOW: { bg: k.tint.amber.bg, fg: k.tint.amber.fg },
  UNKNOWN: { bg: k.tint.neutral.bg, fg: k.tint.neutral.fg },
  EVIDENCE_REQUIRED: { bg: k.tint.purple.bg, fg: k.tint.purple.fg },
  CONDITIONAL: { bg: k.tint.amber.bg, fg: k.tint.amber.fg },
} as const;

function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const { d } = useDensity();
  return <View testID={testID} style={[styles.card, { padding: d.cardPadding, gap: d.cardGap }]}>{children}</View>;
}

function Heading({ icon, title, hint, badge }: { icon: ComponentProps<typeof MaterialIcons>['name']; title: string; hint: string; badge?: string }) {
  const { d } = useDensity();
  return (
    <View style={styles.headingBlock}>
      <View style={styles.headingRow}>
        <MaterialIcons name={icon} size={d.type.section.fontSize} color={k.colors.primary} />
        <Text accessibilityRole="header" style={[d.type.section, styles.text, styles.flex]}>{title}</Text>
        {badge ? <View style={styles.activeBadge}><Text style={[d.type.caption, styles.activeBadgeText]}>{badge}</Text></View> : null}
      </View>
      <Text style={[d.type.caption, styles.muted]}>{hint}</Text>
    </View>
  );
}

function BooleanEditor({ onSubmit }: { onSubmit: (value: boolean) => void }) {
  return (
    <View style={styles.buttonRow}>
      <View style={styles.buttonCell}><KioskButton label="예" variant="soft" onPress={() => onSubmit(true)} grow /></View>
      <View style={styles.buttonCell}><KioskButton label="아니요" variant="soft" onPress={() => onSubmit(false)} grow /></View>
    </View>
  );
}

function ValueEditor({
  kind,
  unit,
  initialValue,
  onSubmit,
  onCancel,
}: {
  kind: SamdoInputKind;
  unit?: string;
  initialValue?: SamdoFactValue;
  onSubmit: (value: SamdoFactValue) => void;
  onCancel: () => void;
}) {
  const { d } = useDensity();
  const [draft, setDraft] = useState(initialValue === undefined ? '' : String(initialValue));
  const [error, setError] = useState('');
  if (kind === 'BOOLEAN') return <BooleanEditor onSubmit={onSubmit} />;
  const save = () => {
    const value = kind === 'NUMBER' ? Number(draft.replaceAll(',', '')) : draft.trim();
    const invalidDate = kind === 'DATE' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(String(value))));
    if (!draft.trim() || invalidDate || (kind === 'NUMBER' && (!Number.isFinite(value) || Number(value) < 0))) {
      setError(kind === 'DATE' ? '날짜를 YYYY-MM-DD로 입력해 주세요.' : '0 이상의 숫자를 입력해 주세요.');
      return;
    }
    onSubmit(value);
  };
  return (
    <View style={styles.editor}>
      <View style={styles.inputRow}>
        <TextInput
          testID="samdo-refinement-input"
          accessibilityLabel={kind === 'DATE' ? '가정 날짜' : '가정 값'}
          value={draft}
          onChangeText={value => { setDraft(value); setError(''); }}
          placeholder={kind === 'DATE' ? 'YYYY-MM-DD' : '숫자 입력'}
          placeholderTextColor={k.colors.textSubtle}
          keyboardType={kind === 'NUMBER' ? 'numeric' : 'numbers-and-punctuation'}
          style={[d.type.body, styles.input]}
        />
        {unit ? <Text style={[d.type.body, styles.muted]}>{unit}</Text> : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={[d.type.caption, styles.error]}>{error}</Text> : null}
      <View style={styles.buttonRow}>
        <View style={styles.buttonCell}><KioskButton label="취소" variant="ghost" onPress={onCancel} grow /></View>
        <View style={styles.buttonCell}><KioskButton label="적용" onPress={save} grow /></View>
      </View>
    </View>
  );
}

function ResolutionCenter({ answers, answerStates, recommendation, onResolve }: Props) {
  const { d } = useDensity();
  const items = useMemo(() => buildSamdoResolutionCenter(recommendation, answerStates), [recommendation, answerStates]);
  const [helpId, setHelpId] = useState<SamdoRefinementFactId | null>(null);
  const [editId, setEditId] = useState<SamdoRefinementFactId | null>(null);
  const [dismissed, setDismissed] = useState<Set<SamdoRefinementFactId>>(() => new Set());
  const visible = items.filter(item => !dismissed.has(item.id));
  if (!items.length) return null;
  return (
    <Card testID="samdo-resolution-center">
      <Heading icon="fact-check" title="추가로 확인하면 결과가 더 정확해져요" hint={`${items.length}개 항목이 신청유형이나 공급단계에 영향을 줄 수 있어요.`} />
      {visible.length ? visible.map(item => {
        const tone = STATUS_TONE[item.currentState];
        return (
          <View key={item.id} testID={`samdo-resolution-${item.id}`} style={[styles.resolutionItem, { gap: d.cardGap - 4 }]}>
            <View style={styles.itemHead}>
              <Text style={[d.type.bodyStrong, styles.text, styles.flex]}>{item.label}</Text>
              <View style={[styles.status, { backgroundColor: tone.bg }]}><Text style={[d.type.caption, { color: tone.fg }]}>{item.currentLabel}</Text></View>
            </View>
            <Text style={[d.type.caption, styles.muted]}>{item.reason}</Text>
            <Text style={[d.type.caption, styles.text]}><Text style={styles.muted}>영향 </Text>{item.affectedSupplyLabels.join(' · ')}</Text>
            {helpId === item.id ? <View style={styles.helpBox}><MaterialIcons name="search" size={17} color={k.colors.primary} /><Text style={[d.type.caption, styles.text, styles.flex]}>{item.help}</Text></View> : null}
            {editId === item.id ? (
              <ValueEditor
                kind={item.inputKind}
                unit={item.unit}
                onCancel={() => setEditId(null)}
                onSubmit={value => {
                  try {
                    onResolve(applySamdoResolvedFact(answers, item.id, value));
                    setEditId(null);
                  } catch {
                    // ValueEditor performs presentation validation. Domain validation remains authoritative.
                  }
                }}
              />
            ) : null}
            <View style={styles.actionRow}>
              <MotionPressable accessibilityRole="button" onPress={() => setHelpId(current => current === item.id ? null : item.id)} style={styles.textAction}>
                <Text style={[d.type.label, styles.primary]}>확인 방법 보기</Text>
              </MotionPressable>
              <MotionPressable accessibilityRole="button" onPress={() => setEditId(item.id)} style={styles.textAction}>
                <Text style={[d.type.label, styles.primary]}>값 입력하기</Text>
              </MotionPressable>
              <MotionPressable accessibilityRole="button" onPress={() => setDismissed(current => new Set([...current, item.id]))} style={styles.textAction}>
                <Text style={[d.type.label, styles.muted]}>나중에</Text>
              </MotionPressable>
            </View>
          </View>
        );
      }) : <Text style={[d.type.body, styles.muted]}>이번에는 나중에 확인할게요. 원래 판정 결과는 그대로 유지돼요.</Text>}
    </Card>
  );
}

const valueLabel = (id: SamdoSimulationFactId, value: SamdoFactValue): string => {
  if (typeof value === 'boolean') {
    if (id === 'householdNoWinningFiveYears') return value ? '최근 5년 무당첨' : '당첨 이력 있음';
    if (id === 'specialSupplyHistory') return value ? '이력 있음' : '이력 없음';
    if (id === 'reWinningRestriction') return value ? '제한 중' : '제한 없음';
    return value ? '예' : '아니요';
  }
  const definition = SAMDO_SIMULATION_FACTS.find(item => item.id === id);
  return typeof value === 'number' ? `${value.toLocaleString('ko-KR')}${definition?.unit ?? ''}` : value;
};

function Comparison({ answers, overrides }: { answers: KioskAnswers; overrides: SamdoSimulationOverrides }) {
  const { d } = useDensity();
  const result = useMemo(() => simulateSamdoRecommendation(answers, overrides), [answers, overrides]);
  const diff = result.diffs;
  const changed = diff.recommendedType.changed || diff.priorityStage.changed || diff.officialScore.changed || diff.eligibility.length > 0;
  return (
    <View testID="samdo-simulation-comparison" style={styles.comparison}>
      <View style={styles.compareGrid}>
        <View style={styles.compareCell}>
          <Text style={[d.type.caption, styles.muted]}>현재</Text>
          <Text style={[d.type.bodyStrong, styles.text]}>{diff.recommendedType.before}</Text>
          <Text style={[d.type.caption, styles.muted]}>{diff.priorityStage.before} · 공식 점수 {diff.officialScore.before}</Text>
        </View>
        <MaterialIcons name="arrow-forward" size={20} color={k.colors.primary} />
        <View style={[styles.compareCell, styles.assumptionCell]}>
          <Text style={[d.type.caption, styles.primary]}>가정</Text>
          <Text style={[d.type.bodyStrong, styles.text]}>{diff.recommendedType.after}</Text>
          <Text style={[d.type.caption, styles.muted]}>{diff.priorityStage.after} · 공식 점수 {diff.officialScore.after}</Text>
        </View>
      </View>
      <View style={styles.diffList}>
        <Text style={[d.type.label, styles.text]}>{changed ? '이 조건에서 달라지는 점' : '현재 공고 기준으로 추천 결과 변화 없음'}</Text>
        {diff.recommendedType.changed ? <Text style={[d.type.caption, styles.text]}>• 추천유형 변경: {diff.recommendedType.before} → {diff.recommendedType.after}</Text> : null}
        {diff.eligibility.map(item => <Text key={item.supplyType} style={[d.type.caption, styles.text]}>• {item.label}: {SAMDO_ELIGIBILITY_LABELS[item.before]} → {SAMDO_ELIGIBILITY_LABELS[item.after]}</Text>)}
        {diff.newlyEligibleTypes.length ? <Text style={[d.type.caption, styles.text]}>• 새로 검토 가능: {diff.newlyEligibleTypes.join(' · ')}</Text> : null}
        {diff.noLongerEligibleTypes.length ? <Text style={[d.type.caption, styles.text]}>• 더 이상 검토 어려움: {diff.noLongerEligibleTypes.join(' · ')}</Text> : null}
        <Text style={[d.type.caption, styles.muted]}>• 확인 필요 항목 {diff.unresolvedCount.before}개 → {diff.unresolvedCount.after}개</Text>
      </View>
    </View>
  );
}

function Simulator({ answers }: { answers: KioskAnswers }) {
  const { d } = useDensity();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SamdoSimulationFactId>('residenceMonths');
  const [overrides, setOverrides] = useState<SamdoSimulationOverrides>({});
  const selectedDefinition = SAMDO_SIMULATION_FACTS.find(item => item.id === selected)!;
  const active = Object.keys(overrides).length > 0;
  const apply = (value: SamdoFactValue) => setOverrides(current => ({ ...current, [selected]: value }));
  const reset = () => { setOverrides({}); setOpen(false); };
  return (
    <Card testID="samdo-simulator">
      <Heading
        icon="tune"
        title="조건을 바꿔보면?"
        hint="원본 정보는 바꾸지 않고, 선택한 조건만 임시로 적용해 같은 판정기를 다시 실행해요."
        badge={active ? '가정 중' : undefined}
      />
      {!open ? <View style={styles.openRow}><KioskButton testID="samdo-simulation-open" label="조건 변경 시뮬레이션" icon="tune" variant="soft" onPress={() => setOpen(true)} /></View> : (
        <View style={styles.simulatorBody}>
          <Text style={[d.type.caption, styles.muted]}>이 조건이라면 현재 공고 기준으로 판정 결과가 어떻게 달라지는지 보여 드려요. 당첨확률이나 경쟁률은 계산하지 않아요.</Text>
          <View style={styles.factChoices}>
            {SAMDO_SIMULATION_FACTS.map(item => (
              <MotionPressable
                key={item.id}
                testID={`samdo-simulation-fact-${item.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === item.id }}
                onPress={() => setSelected(item.id)}
                style={[styles.factChoice, selected === item.id && styles.factChoiceSelected]}
              >
                <Text style={[d.type.caption, selected === item.id ? styles.primary : styles.muted]}>{item.label}</Text>
              </MotionPressable>
            ))}
          </View>
          <View style={styles.selectedEditor}>
            <Text style={[d.type.bodyStrong, styles.text]}>{selectedDefinition.label}</Text>
            <Text style={[d.type.caption, styles.muted]}>{selectedDefinition.hint}</Text>
            <ValueEditor
              key={selected}
              kind={selectedDefinition.inputKind}
              unit={selectedDefinition.unit}
              initialValue={overrides[selected]}
              onCancel={() => setOpen(false)}
              onSubmit={apply}
            />
          </View>
          {active ? (
            <>
              <View style={styles.overrideList}>
                {Object.entries(overrides).map(([id, value]) => value === undefined ? null : (
                  <View key={id} style={styles.overrideChip}>
                    <Text style={[d.type.caption, styles.text]}>{SAMDO_SIMULATION_FACTS.find(item => item.id === id)?.label}: {valueLabel(id as SamdoSimulationFactId, value)}</Text>
                    <MotionPressable accessibilityRole="button" accessibilityLabel={`${SAMDO_SIMULATION_FACTS.find(item => item.id === id)?.label ?? '조건'} 가정 삭제`} onPress={() => setOverrides(current => {
                      const next = { ...current };
                      delete next[id as SamdoSimulationFactId];
                      return next;
                    })} style={styles.removeOverride}><MaterialIcons name="close" size={16} color={k.colors.textMuted} /></MotionPressable>
                  </View>
                ))}
              </View>
              <Comparison answers={answers} overrides={overrides} />
              <View style={styles.resetRow}><KioskButton testID="samdo-simulation-reset" label="원래 조건으로 돌아가기" icon="restart-alt" variant="ghost" onPress={reset} /></View>
            </>
          ) : null}
        </View>
      )}
    </Card>
  );
}

export function SamdoRefinementPanel(props: Props) {
  return (
    <View testID="samdo-refinement" style={styles.wrapper}>
      <ResolutionCenter {...props} />
      <Simulator answers={props.answers} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 16 },
  card: { backgroundColor: k.colors.surface, borderRadius: k.radius.lg, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  headingBlock: { gap: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: k.colors.text },
  muted: { color: k.colors.textMuted },
  primary: { color: k.colors.primary },
  error: { color: k.colors.error },
  flex: { flex: 1, minWidth: 0 },
  activeBadge: { backgroundColor: k.colors.primary, borderRadius: k.radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  activeBadgeText: { color: k.colors.onPrimary },
  resolutionItem: { borderTopWidth: 1, borderTopColor: k.colors.hairline, paddingTop: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { borderRadius: k.radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  helpBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: k.colors.surfaceLow, borderRadius: k.radius.md, padding: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  textAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  editor: { gap: 8, backgroundColor: k.colors.surfaceLow, borderRadius: k.radius.md, padding: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 48, color: k.colors.text, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHighest, borderRadius: k.radius.sm, paddingHorizontal: 12 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttonCell: { flex: 1, minWidth: 120 },
  openRow: { alignItems: 'flex-start' },
  simulatorBody: { gap: 12 },
  factChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  factChoice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: k.radius.pill, borderWidth: 1, borderColor: k.colors.surfaceHighest, backgroundColor: k.colors.surface },
  factChoiceSelected: { borderColor: k.colors.primary, backgroundColor: k.colors.primaryFixed },
  selectedEditor: { gap: 6, padding: 12, borderRadius: k.radius.md, backgroundColor: k.colors.surfaceLow },
  overrideList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overrideChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, borderRadius: k.radius.pill, backgroundColor: k.colors.primaryFixed },
  removeOverride: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  comparison: { gap: 12, padding: 12, borderWidth: 1, borderColor: k.colors.primary, borderRadius: k.radius.md, backgroundColor: k.colors.surface },
  compareGrid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compareCell: { flex: 1, minWidth: 0, gap: 3, padding: 10, borderRadius: k.radius.sm, backgroundColor: k.colors.surfaceLow },
  assumptionCell: { backgroundColor: k.colors.primaryFixed },
  diffList: { gap: 4 },
  resetRow: { alignItems: 'flex-start' },
});
