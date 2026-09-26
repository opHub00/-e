import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, spacing, tracking, type } from '../../../design/tokens';
import { AdminShell } from '../../../features/adminPortal/AdminShell';
import { useAttached } from '../../../features/adminPortal/useIsWide';
import { dateLabel } from '../../../features/adminPortal/status';
import {
  AdminButton, CellText, ConfirmDialog, DataList, Disclosure, FormSection, KpiGrid, LabeledValue, Notice,
  NumberField, PageIntro, SectionCard, StatusBadge,
} from '../../../features/adminPortal/ui/AdminKit';
import { scoringFormula } from '../../../features/scoringFormula/registry';
import {
  SCORING_STATUS_LABEL, SCORING_TARGET_LABEL, calculateScore, componentMax, formulaMax, isServiceReady,
  runTestCases, validateFormula, type ScoringComponent, type ScoringFormula,
} from '../../../features/scoringFormula/domain';

type Tab = 'overview' | 'bands' | 'wording' | 'tests' | 'simulator' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '기본 정보' },
  { key: 'bands', label: '배점 항목' },
  { key: 'wording', label: '해석 문구' },
  { key: 'tests', label: '테스트' },
  { key: 'simulator', label: '시뮬레이터' },
  { key: 'history', label: '변경 이력' },
];

/**
 * 가점 계산식 상세.
 *
 * JSON 을 보여주지 않는다. 운영자가 읽는 것은 항목 카드와 구간 표, 그리고 해석 문구다.
 * 고치는 일은 아직 파일로만 가능해서, 이 화면은 "무엇을 고쳐야 하는지"까지 알려주고 멈춘다.
 * 있지도 않은 저장 버튼을 두는 것보다 정확하다.
 */
export default function ScoringDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // 어떤 산식인지는 주소에 있다. 미리 그린 화면에는 그 값이 없어, 이어받은 뒤에 내용을 정한다.
  const attached = useAttached();
  const formula = attached && typeof id === 'string' ? scoringFormula(id) : undefined;
  const title = !attached ? '가점 계산식' : id === 'new' ? '새 산식 추가' : formula?.name ?? '가점 계산식';
  return (
    <AdminShell title={title} subtitle={id === 'new' ? '새 배점표를 만드는 방법이에요.' : '배점 항목과 구간, 해석 문구를 확인해요.'}>
      {() => {
        if (!attached) return <SectionCard title="불러오는 중이에요" description="산식을 여는 중이에요." >{null}</SectionCard>;
        if (id === 'new') return <CreateGuide />;
        return formula ? <Detail formula={formula} /> : <NotFound id={String(id)} />;
      }}
    </AdminShell>
  );
}

function NotFound({ id }: { id: string }) {
  const router = useRouter();
  return (
    <SectionCard title="이 산식을 찾지 못했어요" description={`'${id}' 라는 산식이 등록되어 있지 않아요.`}>
      <AdminButton label="가점 계산식 목록으로" icon="arrow-back" onPress={() => router.push('/admin/scoring' as Href)} />
    </SectionCard>
  );
}

function CreateGuide() {
  const router = useRouter();
  return (
    <>
      <PageIntro
        title="새 산식 추가"
        description="새 배점표는 아직 화면에서 바로 만들 수 없어요. 무엇이 필요한지와, 지금 할 수 있는 일을 안내해요."
      />
      <SectionCard title="지금은 이렇게 만들어요" description="산식은 운영 DB 가 아니라 배포 파일로 관리하고 있어요.">
        <Notice icon="info">
          새 배점표를 추가하려면 개발자가 `data/scoring-formulas/formulas.json` 에 항목과 구간을 넣고 배포해야 해요.
          화면에서 바로 저장하게 만들면, 화면에서 본 것과 서비스가 쓰는 것이 어긋날 수 있어요.
        </Notice>
        <FormSection title="개발자에게 전달할 내용" description="아래를 정리해 주시면 그대로 등록할 수 있어요.">
          <Text style={styles.listItem}>· 산식 이름과 적용 대상(민영 일반공급, 생애최초 특별공급처럼)</Text>
          <Text style={styles.listItem}>· 배점 항목과 항목별 만점</Text>
          <Text style={styles.listItem}>· 항목별 구간과 점수(예: 1년 이상 2년 미만 → 4점)</Text>
          <Text style={styles.listItem}>· 기준이 된 근거(법령·공고 조항)</Text>
          <Text style={styles.listItem}>· 점수대별 해석 문구</Text>
        </FormSection>
        <AdminButton label="등록된 산식 보기" tone="quiet" icon="arrow-back" onPress={() => router.push('/admin/scoring' as Href)} />
      </SectionCard>
    </>
  );
}

function Detail({ formula }: { formula: ScoringFormula }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = TABS.some(item => item.key === params.tab) ? (params.tab as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(initial);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const problems = useMemo(() => validateFormula(formula), [formula]);
  const runs = useMemo(() => runTestCases(formula), [formula]);
  const ready = isServiceReady(formula);

  return (
    <>
      <PageIntro
        title={formula.name}
        description={formula.description}
        actions={
          <>
            <AdminButton label="목록" tone="quiet" icon="arrow-back" onPress={() => router.push('/admin/scoring' as Href)} />
            <AdminButton label="사용자에게 공개" icon="visibility" onPress={() => setConfirmPublish(true)} disabled={!ready} />
          </>
        }
      />

      <KpiGrid items={[
        { label: '만점', value: `${formulaMax(formula)}점`, hint: `${formula.components.length}개 항목 합계`, tone: 'purple', icon: 'calculate' },
        { label: '상태', value: SCORING_STATUS_LABEL[formula.status], hint: `버전 ${formula.version}`, tone: formula.status === 'ACTIVE' ? 'green' : 'amber', icon: 'flag' },
        { label: '표 점검', value: problems.length ? `${problems.length}건 확인 필요` : '이상 없음', tone: problems.length ? 'amber' : 'green', icon: 'rule' },
        { label: '저장된 예시', value: `${runs.filter(run => run.passed).length} / ${runs.length} 통과`, tone: runs.every(run => run.passed) ? 'green' : 'amber', icon: 'science' },
      ]} />

      {!ready ? (
        <Notice tone="amber" icon="warning">
          지금은 사용자 화면에 쓸 수 없는 상태예요. 상태가 활성이고, 표에 문제가 없고, 저장된 예시가 모두 맞아야 공개할 수 있어요.
        </Notice>
      ) : null}

      <View style={styles.tabs}>
        {TABS.map(item => {
          const active = item.key === tab;
          return (
            <MotionPressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </MotionPressable>
          );
        })}
      </View>

      {tab === 'overview' ? <Overview formula={formula} problems={problems} /> : null}
      {tab === 'bands' ? <Bands formula={formula} /> : null}
      {tab === 'wording' ? <Wording formula={formula} /> : null}
      {tab === 'tests' ? <Tests formula={formula} /> : null}
      {tab === 'simulator' ? <Simulator formula={formula} /> : null}
      {tab === 'history' ? <History formula={formula} /> : null}

      <ConfirmDialog
        open={confirmPublish}
        title="사용자에게 공개할까요?"
        body="공개하면 사용자 화면에 이 산식의 점수 해석이 나와요. 지금은 화면에서 바로 켤 수 없어, 개발자가 파일을 고치고 배포해야 반영돼요."
        confirmLabel="알겠어요"
        onConfirm={() => setConfirmPublish(false)}
        onCancel={() => setConfirmPublish(false)}
      />
    </>
  );
}

function Overview({ formula, problems }: { formula: ScoringFormula; problems: ReturnType<typeof validateFormula> }) {
  return (
    <>
      <SectionCard title="기본 정보">
        <View style={styles.valueRow}>
          <LabeledValue label="적용 대상" value={formula.targets.map(target => SCORING_TARGET_LABEL[target]).join(', ')} />
          <LabeledValue label="버전" value={formula.version} />
          <LabeledValue label="상태" value={SCORING_STATUS_LABEL[formula.status]} />
          <LabeledValue label="사용자 노출" value={formula.publishedToUsers ? '공개' : '내부용'} hint={formula.publishedToUsers ? undefined : '서비스 화면에는 나오지 않아요'} />
          <LabeledValue label="최근 수정" value={dateLabel(formula.updatedAt) ?? '—'} />
        </View>
        <FormSection title="기준이 된 근거" description="근거가 없는 배점표는 서비스에 쓰지 않아요.">
          <Text style={styles.body}>{formula.legalBasis}</Text>
        </FormSection>
      </SectionCard>

      <SectionCard title="표 점검" description="구간에 빈틈이나 겹침이 있으면 어떤 사용자는 점수가 나오지 않아요.">
        {problems.length === 0 ? (
          <Notice tone="green" icon="check-circle">항목과 구간이 빈틈 없이 이어져 있어요.</Notice>
        ) : (
          problems.map(problem => (
            <Notice key={problem.message} tone="amber" icon="warning">{problem.message}</Notice>
          ))
        )}
      </SectionCard>
    </>
  );
}

function Bands({ formula }: { formula: ScoringFormula }) {
  const [advanced, setAdvanced] = useState(false);
  const components = [...formula.components].sort((left, right) => left.order - right.order);
  return (
    <>
      {components.map(component => (
        <ComponentCard key={component.id} component={component} advanced={advanced} onToggleAdvanced={() => setAdvanced(value => !value)} />
      ))}
    </>
  );
}

function ComponentCard({ component, advanced, onToggleAdvanced }: {
  component: ScoringComponent; advanced: boolean; onToggleAdvanced: () => void;
}) {
  return (
    <SectionCard
      title={`${component.label} · 최대 ${componentMax(component)}점`}
      description={component.description}
    >
      <DataList
        rows={component.bands}
        keyOf={band => band.label}
        empty={{ title: '구간이 없어요', body: '이 항목은 아직 점수를 낼 수 없어요.' }}
        columns={[
          { key: 'range', header: '구간', flex: 2.2, render: band => <CellText strong>{band.label}</CellText> },
          { key: 'points', header: '점수', flex: 0.8, render: band => <CellText strong>{band.points}점</CellText> },
          {
            key: 'note', header: '비고', flex: 2.6,
            render: band => <CellText muted>{band.note ?? '—'}</CellText>,
          },
        ]}
      />
      <Disclosure label="고급 설정" open={advanced} onToggle={onToggleAdvanced}>
        <View style={styles.valueRow}>
          <LabeledValue label="입력 단위" value={component.unit} />
          <LabeledValue label="연결된 입력 이름" value={component.fact} hint="판정 엔진이 쓰는 값 이름이에요" />
          <LabeledValue label="표시 순서" value={String(component.order)} />
        </View>
        <Text style={styles.hint}>
          구간의 경계는 양끝을 포함해요. 예를 들어 12 이상 23 이하 구간이면, 12와 23 모두 이 구간에 들어가요.
        </Text>
      </Disclosure>
    </SectionCard>
  );
}

function Wording({ formula }: { formula: ScoringFormula }) {
  const sorted = [...formula.interpretations].sort((left, right) => right.minTotal - left.minTotal);
  return (
    <SectionCard title="점수 해석 문구" description="사용자가 점수를 봤을 때 함께 읽는 설명이에요. 총점이 기준 점수 이상이면 그 문구를 써요.">
      <DataList
        rows={sorted}
        keyOf={item => String(item.minTotal)}
        empty={{ title: '해석 문구가 없어요', body: '문구가 없으면 사용자 화면에 점수만 나오고 설명은 나오지 않아요.' }}
        columns={[
          { key: 'min', header: '기준 점수', flex: 0.9, render: item => <CellText strong>{item.minTotal}점 이상</CellText> },
          { key: 'headline', header: '한 줄 요약', flex: 1.6, render: item => <CellText strong>{item.headline}</CellText> },
          { key: 'detail', header: '설명', flex: 3.4, render: item => <CellText>{item.detail}</CellText> },
        ]}
      />
    </SectionCard>
  );
}

function Tests({ formula }: { formula: ScoringFormula }) {
  const runs = runTestCases(formula);
  return (
    <SectionCard
      title={`저장된 예시 ${runs.length}개`}
      description="배점표를 고친 뒤 무엇이 달라졌는지 바로 확인하려고 남겨 둔 예시예요."
    >
      <DataList
        rows={runs}
        keyOf={run => run.testCase.id}
        empty={{ title: '저장된 예시가 없어요', body: '예시가 있으면 배점표를 고칠 때 실수를 빨리 찾을 수 있어요.' }}
        columns={[
          { key: 'label', header: '예시', flex: 2.4, render: run => <CellText strong>{run.testCase.label}</CellText> },
          {
            key: 'input', header: '입력', flex: 2.4,
            render: run => (
              <CellText muted>
                {formula.components
                  .map(component => `${component.label} ${run.testCase.inputs[component.id] ?? '—'}${component.unit}`)
                  .join(' · ')}
              </CellText>
            ),
          },
          { key: 'expected', header: '기대 점수', flex: 0.9, render: run => <CellText>{run.testCase.expectedTotal}점</CellText> },
          {
            key: 'actual', header: '실제 점수', flex: 0.9,
            render: run => <CellText strong>{run.actualTotal === null ? '계산 불가' : `${run.actualTotal}점`}</CellText>,
          },
          {
            key: 'result', header: '결과', flex: 0.9,
            render: run => <StatusBadge status={run.passed ? 'APPROVED' : 'NEEDS_CHECK'} />,
          },
        ]}
      />
    </SectionCard>
  );
}

/** 관리자가 직접 값을 넣어 점수를 확인하는 도구. */
function Simulator({ formula }: { formula: ScoringFormula }) {
  const components = [...formula.components].sort((left, right) => left.order - right.order);
  const [raw, setRaw] = useState<Record<string, string>>({});

  const inputs = Object.fromEntries(components.map(component => {
    const text = raw[component.id];
    const value = text === undefined || text.trim() === '' ? null : Number(text);
    return [component.id, value !== null && Number.isFinite(value) ? value : null];
  }));
  const result = calculateScore(formula, inputs);

  return (
    <>
      <SectionCard title="값을 넣어 점수 확인하기" description="사용자가 입력할 값을 그대로 넣어 보세요. 모르는 값은 비워 두면 총점을 내지 않아요.">
        <View style={styles.fieldRow}>
          {components.map(component => (
            <NumberField
              key={component.id}
              label={component.label}
              unit={component.unit}
              value={raw[component.id] ?? ''}
              onChange={next => setRaw(current => ({ ...current, [component.id]: next.replace(/[^0-9]/g, '') }))}
              hint={`최대 ${componentMax(component)}점`}
            />
          ))}
        </View>
        <AdminButton label="입력 지우기" tone="quiet" icon="refresh" onPress={() => setRaw({})} />
      </SectionCard>

      <SectionCard title="결과">
        <View style={styles.totalRow}>
          <Text style={styles.totalValue}>{result.total === null ? '—' : `${result.total}점`}</Text>
          <Text style={styles.totalMax}>/ {result.max}점 만점</Text>
        </View>
        {result.total === null ? (
          <Notice tone="amber" icon="help-outline">
            아직 총점을 낼 수 없어요. {result.problems.join(' ')} 모르는 값을 0점으로 세지 않기 때문이에요.
          </Notice>
        ) : result.interpretation ? (
          <Notice tone="green" icon="insights">
            {result.interpretation.headline} — {result.interpretation.detail}
          </Notice>
        ) : (
          <Notice icon="info">이 점수에 맞는 해석 문구가 아직 없어요.</Notice>
        )}

        <DataList
          rows={result.breakdown}
          keyOf={item => item.componentId}
          empty={{ title: '항목이 없어요', body: '배점 항목을 먼저 등록해 주세요.' }}
          columns={[
            { key: 'label', header: '항목', flex: 1.8, render: item => <CellText strong>{item.label}</CellText> },
            { key: 'input', header: '입력값', flex: 1, render: item => <CellText>{item.input === null ? '—' : item.input}</CellText> },
            { key: 'band', header: '해당 구간', flex: 2, render: item => <CellText>{item.bandLabel ?? item.problem ?? '—'}</CellText> },
            {
              key: 'points', header: '점수', flex: 1,
              render: item => <CellText strong>{item.points === null ? '—' : `${item.points} / ${item.max}점`}</CellText>,
            },
          ]}
        />
      </SectionCard>
    </>
  );
}

function History({ formula }: { formula: ScoringFormula }) {
  return (
    <SectionCard title="변경 이력" description="누가 언제 무엇을 바꿨는지 남겨요.">
      <DataList
        rows={[...formula.history].reverse()}
        keyOf={item => `${item.at}-${item.summary}`}
        empty={{ title: '기록된 변경이 없어요', body: '산식을 고치면 여기에 남아요.' }}
        columns={[
          { key: 'at', header: '시각', flex: 1, render: item => <CellText>{dateLabel(item.at) ?? item.at}</CellText> },
          { key: 'actor', header: '변경자', flex: 1.2, render: item => <CellText strong>{item.actor}</CellText> },
          { key: 'summary', header: '내용', flex: 4, render: item => <CellText>{item.summary}</CellText> },
        ]}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceContainer },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...type.bodySm, color: colors.textMuted },
  tabTextActive: { color: colors.onPrimary },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  body: { ...type.bodySm, color: colors.textMuted, lineHeight: 20 },
  hint: { ...type.micro, color: colors.textSubtle, lineHeight: 18 },
  listItem: { ...type.bodySm, color: colors.textMuted, lineHeight: 22 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  totalValue: { ...type.display, color: colors.primary },
  totalMax: { ...type.bodySm, color: colors.textSubtle, letterSpacing: tracking.normal },
});
