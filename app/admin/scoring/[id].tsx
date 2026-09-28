import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, spacing, tracking, type } from '../../../design/tokens';
import { AdminChrome } from '../../../features/adminPortal/AdminShell';
import { dateLabel } from '../../../features/adminPortal/status';
import {
  AdminButton, CellText, ConfirmDialog, DataList, Disclosure, FormSection, KpiGrid, LabeledValue, Notice,
  NumberField, PageIntro, SectionCard, StatusBadge,
} from '../../../features/adminPortal/ui/AdminKit';
import {
  activationBlock, activationChecks, activateAndPublishFormula, actorLabel, changeFormulaStatus,
  createFormulaTestCase, createNextFormulaVersion, deleteFormulaBand,
  deleteFormulaTestCase, editabilityOf, loadScoringFormulaDetail, runScoring, saveBand,
  scoringPermission, scoringSource, statusTransitionAllowed, type ScoringFormulaView,
} from '../../../features/scoringFormula/adapter';
import { createConfiguredScoringRepository } from '../../../features/scoringFormula/configuredRepository';
import {
  actorName, auditRows, operatorError, testInputMismatchMessage, transitionReason, type OperatorError,
} from '../../../features/scoringFormula/operatorCopy';
import type { ScoringAccess, ScoringFormulaRepository } from '../../../features/scoringFormula/repository';
import {
  SCORING_STATUS_LABEL, SCORING_TARGET_LABEL, calculateScore, componentMax, formulaMax, isServiceReady,
  runTestCases, validateFormula, type ScoringBand, type ScoringComponent, type ScoringFormula, type ScoringStatus,
  type ScoringTestCase,
} from '../../../features/scoringFormula/domain';

type Tab = 'overview' | 'bands' | 'wording' | 'tests' | 'simulator' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '기본 정보' },
  { key: 'bands', label: '배점표' },
  { key: 'wording', label: '점수 설명' },
  { key: 'tests', label: '예시로 확인' },
  { key: 'simulator', label: '점수 계산해 보기' },
  { key: 'history', label: '변경 이력' },
];

/**
 * 운영자가 가장 자주 섞는 두 가지를 먼저 갈라 준다.
 * 자격 판정은 규칙 검수 화면의 일이고, 이 화면은 가점 계산만 다룬다.
 */
function ScopeNote() {
  return (
    <SectionCard title="이 화면이 다루는 것" description="두 가지는 다른 일이에요. 섞이면 운영 실수가 나요.">
      <View style={styles.scopeRow}>
        <View style={styles.scopeCard}>
          <Text style={styles.scopeTitle}>자격 판정</Text>
          <Text style={styles.scopeQuestion}>이 공고에 신청할 수 있는가?</Text>
          <Text style={styles.scopeBody}>공고마다 다른 조건이에요. 규칙 검수 화면에서 다뤄요.</Text>
        </View>
        <View style={[styles.scopeCard, styles.scopeCardActive]}>
          <Text style={styles.scopeTitle}>가점 계산 · 지금 이 화면</Text>
          <Text style={styles.scopeQuestion}>신청할 수 있다면 몇 점인가?</Text>
          <Text style={styles.scopeBody}>법으로 정해진 배점표예요. 공고가 달라도 계산 방식은 같아요.</Text>
        </View>
      </View>
    </SectionCard>
  );
}

/**
 * 가점 계산식 상세.
 *
 * JSON 을 보여주지 않는다. 운영자가 읽는 것은 항목 카드와 구간 표, 그리고 해석 문구다.
 * 고치는 일은 아직 파일로만 가능해서, 이 화면은 "무엇을 고쳐야 하는지"까지 알려주고 멈춘다.
 * 있지도 않은 저장 버튼을 두는 것보다 정확하다.
 */
export default function ScoringDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AdminChrome title={id === 'new' ? '새 산식 추가' : '가점 계산식'} subtitle={id === 'new' ? '새 배점표를 만드는 방법이에요.' : '배점 항목과 구간, 해석 문구를 확인해요.'}>
      {id === 'new' ? <CreateGuide /> : typeof id === 'string' ? <Detail formulaId={id} /> : <NotFound id={String(id)} />}
    </AdminChrome>
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
      <SectionCard title="새 산식 준비" description="새 산식은 운영 저장소에 초안으로 만들고 검토를 거쳐야 해요.">
        <Notice icon="info">
          현재 화면에서는 기존 산식의 버전 복제와 검토를 지원해요. 새 산식 생성 폼은 아직 연결되지 않았습니다.
          저장소에서 만든 초안은 검토와 검증 예시를 통과한 뒤에만 활성화할 수 있어요.
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

function Detail({ formulaId }: { formulaId: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = TABS.some(item => item.key === params.tab) ? (params.tab as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(initial);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);
  const [errorDetail, setErrorDetail] = useState(false);
  const repository = useMemo<ScoringFormulaRepository | null>(() => {
    try { return createConfiguredScoringRepository(); } catch { return null; }
  }, []);
  const [current, setCurrent] = useState<ScoringFormulaView | null>(null);
  const [access, setAccess] = useState<ScoringAccess | null>(null);

  useEffect(() => {
    let alive = true;
    if (!repository) { setError(operatorError('SCORING_REPOSITORY_UNAVAILABLE')); return () => { alive = false; }; }
    void runScoring(() => loadScoringFormulaDetail(formulaId, repository)).then(outcome => {
      if (!alive) return;
      if (outcome.ok) { setCurrent(outcome.value.formula); setAccess(outcome.value.access); setError(null); }
      else setError(operatorError(outcome.code));
    });
    return () => { alive = false; };
  }, [formulaId, repository]);

  if (!current || !repository) {
    return error
      ? <SectionCard title="산식을 불러오지 못했어요" description={error.message}><AdminButton label="목록" onPress={() => router.push('/admin/scoring' as Href)} /></SectionCard>
      : <SectionCard title="불러오는 중이에요" description="서버에서 산식과 변경 이력을 확인하고 있어요.">{null}</SectionCard>;
  }
  const formula = current;

  const permission = scoringPermission(access);
  const editability = editabilityOf(formula, permission);

  const adopt = (task: () => Promise<ScoringFormulaView>) => {
    void runScoring(task).then(outcome => {
      if (outcome.ok) { setCurrent(outcome.value); setError(null); }
      else setError(operatorError(outcome.code));
    });
  };
  const changeStatus = (next: ScoringStatus) => {
    adopt(() => changeFormulaStatus(repository, formula, next));
  };
  const openExistingDraft = () => {
    if (formula.draftVersion) router.replace(`/admin/scoring/${formula.draftVersion.id}` as Href);
  };
  const createNewVersion = () => {
    // 이미 초안이 있으면 새로 뜨지 않는다. 버전만 하나씩 늘어나고 어느 것을 고쳐야 할지 헷갈린다.
    if (formula.hasDraft) { setError(operatorError('SCORING_DUPLICATE_DRAFT')); return; }
    adopt(async () => {
      const next = await createNextFormulaVersion(repository, formula);
      router.replace(`/admin/scoring/${next.id}` as Href);
      return next;
    });
  };

  const problems = useMemo(() => validateFormula(formula), [formula]);
  const runs = useMemo(() => runTestCases(formula), [formula]);
  const checks = useMemo(() => activationChecks(formula), [formula]);
  const ready = problems.length === 0 && runs.length > 0 && runs.every(run => run.passed);
  const activationReason = activationBlock(formula, permission);
  const activatable = activationReason === null;
  // 비활성 버튼만 두면 고장으로 읽힌다. 왜 못 누르는지와 대신 할 일을 함께 적는다.
  const blockedTransitions = (['DRAFT', 'REVIEW', 'ACTIVE', 'SUSPENDED'] as const)
    .filter(next => next !== formula.status && !statusTransitionAllowed(formula.status, next))
    .map(next => ({ status: next, reason: transitionReason(formula.status, next, permission.canEdit) }))
    .filter((item): item is { status: ScoringStatus; reason: string } => Boolean(item.reason));

  return (
    <>
      <PageIntro
        title={formula.name}
        description={formula.description}
        actions={
          <>
            <AdminButton label="목록" tone="quiet" icon="arrow-back" onPress={() => router.push('/admin/scoring' as Href)} />
            {editability.mustCreateNewVersion && formula.hasDraft
              ? <AdminButton label="초안 열기" icon="edit-note" onPress={openExistingDraft} />
              : null}
            {editability.mustCreateNewVersion && !formula.hasDraft
              ? <AdminButton label="새 버전 만들기" icon="content-copy" onPress={createNewVersion} />
              : null}
            <AdminButton
              label="활성화하고 사용자에게 공개"
              icon="visibility"
              onPress={() => setConfirmPublish(true)}
              disabled={!ready || activationReason !== null}
            />
          </>
        }
      />

      {error ? (
        <SectionCard title="처리하지 못했어요" description={error.message}>
          {error.detail ? (
            <Disclosure label="고급 정보" open={errorDetail} onToggle={() => setErrorDetail(value => !value)}>
              <Text style={styles.hint}>{error.detail}</Text>
              <Text style={styles.hint}>개발자에게 전달할 때 이 내용을 함께 알려 주세요.</Text>
            </Disclosure>
          ) : null}
        </SectionCard>
      ) : null}

      {scoringSource() === 'fixture-repository' ? (
        <Notice icon="info">로컬 테스트용 메모리 저장소입니다. 모든 변경은 repository contract를 거치며 새로고침하면 초기화돼요.</Notice>
      ) : null}

      {editability.mustCreateNewVersion && formula.hasDraft ? (
        <SectionCard
          title={`이미 ${formula.draftVersion?.version ?? ''} 초안이 있습니다`.replace('  ', ' ')}
          description="새로 만들지 말고 그 초안을 이어서 고쳐 주세요. 버전이 여러 개로 갈라지면 어느 것을 활성화할지 알기 어려워요."
        >
          <AdminButton label="초안 열기" icon="edit-note" onPress={openExistingDraft} />
        </SectionCard>
      ) : editability.notice ? (
        <Notice tone={editability.mustCreateNewVersion ? 'amber' : 'neutral'} icon={editability.mustCreateNewVersion ? 'history' : 'lock'}>
          {editability.notice}
        </Notice>
      ) : null}

      <KpiGrid items={[
        { label: '만점', value: `${formulaMax(formula)}점`, hint: `${formula.components.length}개 항목 합계`, tone: 'purple', icon: 'calculate' },
        { label: '상태', value: SCORING_STATUS_LABEL[formula.status], hint: `버전 ${formula.version}`, tone: formula.status === 'ACTIVE' ? 'green' : 'amber', icon: 'flag' },
        { label: '표 점검', value: problems.length ? `${problems.length}건 확인 필요` : '이상 없음', tone: problems.length ? 'amber' : 'green', icon: 'rule' },
        { label: '저장된 예시', value: `${runs.filter(run => run.passed).length} / ${runs.length} 통과`, tone: runs.every(run => run.passed) ? 'green' : 'amber', icon: 'science' },
      ]} />

      {!isServiceReady(formula) ? (
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

      <SectionCard
        title="상태 바꾸기"
        description="초안 → 검토 중 → 활성 순서로 옮겨요. 활성으로 가려면 아래 검사를 모두 통과해야 해요."
      >
        <View style={styles.statusRow}>
          {(['DRAFT', 'REVIEW', 'ACTIVE', 'SUSPENDED'] as const).map(next => {
            const allowed = statusTransitionAllowed(formula.status, next);
            const blocked = !allowed || (next === 'ACTIVE' && !activatable) || !permission.canEdit;
            return (
              <AdminButton
                key={next}
                label={SCORING_STATUS_LABEL[next]}
                tone={formula.status === next ? 'primary' : 'quiet'}
                disabled={blocked || formula.status === next}
                onPress={() => changeStatus(next)}
              />
            );
          })}
          <AdminButton
            label={formula.publishedToUsers ? '사용자 공개 중' : '활성화 시 공개'}
            tone="quiet"
            icon={formula.publishedToUsers ? 'visibility' : 'visibility-off'}
            disabled
            onPress={() => undefined}
          />
        </View>
        <DataList
          rows={checks}
          keyOf={check => check.key}
          empty={{ title: '검사 항목이 없어요', body: '' }}
          columns={[
            { key: 'label', header: '검사', flex: 1.4, render: check => <CellText strong>{check.label}</CellText> },
            { key: 'detail', header: '내용', flex: 4, render: check => <CellText>{check.detail}</CellText> },
            {
              key: 'state', header: '결과', flex: 1,
              render: check => <StatusBadge status={check.passed ? 'APPROVED' : 'NEEDS_CHECK'} />,
            },
          ]}
        />
        {blockedTransitions.length ? (
          <View style={styles.reasonList}>
            {blockedTransitions.map(item => (
              <Text key={item.status} style={styles.reasonLine}>
                · {SCORING_STATUS_LABEL[item.status]}으로 바꿀 수 없어요 — {item.reason}
              </Text>
            ))}
          </View>
        ) : null}
        {activationReason ? <Notice tone="amber" icon="block">{activationReason}</Notice> : null}
      </SectionCard>

      {tab === 'overview' ? <><ScopeNote /><Overview formula={formula} problems={problems} /></> : null}
      {tab === 'bands' ? <Bands
        formula={formula}
        editable={editability.canEditBands}
        onSave={(componentId, index, band) => adopt(() => saveBand(repository, formula, componentId, index, band))}
        onDelete={(componentId, index) => adopt(() => deleteFormulaBand(repository, formula, componentId, index))}
      /> : null}
      {tab === 'wording' ? <Wording formula={formula} /> : null}
      {tab === 'tests' ? <Tests
        formula={formula}
        editable={permission.canEdit}
        onCreate={testCase => {
          // 예시 입력이 배점 항목과 어긋나면, 코드 대신 어떤 항목이 빠졌는지 이름으로 알려 준다.
          void runScoring(() => createFormulaTestCase(repository, formula, testCase)).then(outcome => {
            if (outcome.ok) { setCurrent(outcome.value); setError(null); return; }
            setError(/KEYS_MISMATCH|VALIDATION_FAILED/.test(outcome.code)
              ? { message: testInputMismatchMessage(formula.components, testCase.inputs), detail: outcome.code }
              : operatorError(outcome.code));
          });
        }}
        onDelete={testCaseId => adopt(() => deleteFormulaTestCase(repository, formula, testCaseId))}
      /> : null}
      {tab === 'simulator' ? <Simulator formula={formula} /> : null}
      {tab === 'history' ? <History formula={formula} /> : null}

      <ConfirmDialog
        open={confirmPublish}
        title="사용자에게 공개할까요?"
        body="서버가 산식 검증과 저장된 예시를 다시 확인한 뒤 활성화합니다. 성공 응답으로 받은 snapshot만 화면에 반영해요."
        confirmLabel="활성화하고 공개"
        onConfirm={() => { setConfirmPublish(false); adopt(() => activateAndPublishFormula(repository, formula)); }}
        onCancel={() => setConfirmPublish(false)}
      />
    </>
  );
}

function Overview({ formula, problems }: { formula: ScoringFormulaView; problems: ReturnType<typeof validateFormula> }) {
  return (
    <>
      <SectionCard title="기본 정보">
        <View style={styles.valueRow}>
          <LabeledValue label="적용 대상" value={formula.targets.map(target => SCORING_TARGET_LABEL[target]).join(', ')} />
          <LabeledValue label="버전" value={formula.version} />
          <LabeledValue label="상태" value={SCORING_STATUS_LABEL[formula.status]} />
          <LabeledValue label="사용자 노출" value={formula.publishedToUsers ? '공개' : '내부용'} hint={formula.publishedToUsers ? undefined : '서비스 화면에는 나오지 않아요'} />
          <LabeledValue label="최근 수정" value={dateLabel(formula.updatedAt) ?? '—'} />
          <LabeledValue label="최근 수정자" value={actorName(formula.actors.updated)} />
          <LabeledValue label="후속 초안" value={formula.hasDraft ? formula.draftVersion?.version ?? '있음' : '없음'} />
        </View>
        <FormSection title="기준이 된 근거" description="근거가 없는 배점표는 서비스에 쓰지 않아요.">
          <Text style={styles.body}>{formula.legalBasis}</Text>
        </FormSection>
      </SectionCard>

      <SectionCard title="표 점검" description="구간에 빈틈이나 겹침이 있으면 어떤 사용자는 점수가 나오지 않아요.">
        {problems.length === 0 ? (
          <Notice tone="green" icon="check-circle">항목과 구간이 빈틈 없이 이어져 있어요. 어떤 값을 넣어도 점수가 하나로 정해져요.</Notice>
        ) : (
          problems.map(problem => (
            <Notice key={problem.message} tone="amber" icon="warning">{problem.message}</Notice>
          ))
        )}
      </SectionCard>
    </>
  );
}

function Bands({ formula, onSave, onDelete, editable }: {
  formula: ScoringFormula;
  onSave: (componentId: string, index: number, band: ScoringBand) => void;
  onDelete: (componentId: string, index: number) => void;
  editable: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const components = [...formula.components].sort((left, right) => left.order - right.order);
  return (
    <>
      {components.map(component => (
        <ComponentCard
          key={component.id}
          component={component}
          advanced={advanced}
          editable={editable}
          onToggleAdvanced={() => setAdvanced(value => !value)}
          onSaveBand={(index, band) => onSave(component.id, index, band)}
          onAddBand={() => onSave(component.id, component.bands.length, {
            min: Math.max(0, ...component.bands.map(band => (band.max ?? band.min ?? 0) + 1)),
            points: 0,
            label: '새 구간',
          })}
          onRemoveBand={index => onDelete(component.id, index)}
        />
      ))}
    </>
  );
}

function ComponentCard({ component, advanced, editable, onToggleAdvanced, onSaveBand, onAddBand, onRemoveBand }: {
  component: ScoringComponent;
  advanced: boolean;
  editable: boolean;
  onToggleAdvanced: () => void;
  onSaveBand: (index: number, band: ScoringBand) => void;
  onAddBand: () => void;
  onRemoveBand: (index: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draftBand, setDraftBand] = useState<ScoringBand | null>(null);
  const startEditing = (index: number) => { setEditing(index); setDraftBand({ ...component.bands[index] }); };
  const finishEditing = (index: number) => {
    if (draftBand) onSaveBand(index, draftBand);
    setEditing(null); setDraftBand(null);
  };
  return (
    <SectionCard
      title={`${component.label} · 최대 ${componentMax(component)}점`}
      description={component.description}
      action={<AdminButton label="구간 추가" tone="quiet" icon="add" onPress={onAddBand} disabled={!editable} />}
    >
      <DataList
        rows={component.bands.map((band, index) => ({ band, index }))}
        keyOf={row => `${row.index}`}
        empty={{ title: '구간이 없어요', body: '이 항목은 아직 점수를 낼 수 없어요.' }}
        columns={[
          {
            key: 'range', header: '구간', flex: 2.2,
            render: row => editing === row.index
              ? <TextInput
                  accessibilityLabel={`${component.label} ${row.index + 1}번째 구간 이름`}
                  value={draftBand?.label ?? row.band.label}
                  onChangeText={text => setDraftBand(current => ({ ...(current ?? row.band), label: text }))}
                  style={styles.inlineInput}
                />
              : <CellText strong>{row.band.label}</CellText>,
          },
          {
            key: 'bounds', header: `범위(${component.unit})`, flex: 1.6,
            render: row => (
              <CellText muted>
                {row.band.min ?? '처음'} ~ {row.band.max ?? '끝'}
              </CellText>
            ),
          },
          {
            key: 'points', header: '점수', flex: 1,
            render: row => editing === row.index
              ? <TextInput
                  accessibilityLabel={`${component.label} ${row.index + 1}번째 구간 점수`}
                  value={String(draftBand?.points ?? row.band.points)}
                  inputMode="numeric"
                  onChangeText={text => setDraftBand(current => ({ ...(current ?? row.band), points: Number(text.replace(/[^0-9]/g, '')) || 0 }))}
                  style={styles.inlineInput}
                />
              : <CellText strong>{row.band.points}점</CellText>,
          },
          { key: 'note', header: '비고', flex: 2.2, hideOnNarrow: true, render: row => <CellText muted>{row.band.note ?? '—'}</CellText> },
        ]}
        actions={row => (
          <>
            <AdminButton
              label={editing === row.index ? '완료' : '수정'}
              tone="quiet"
              disabled={!editable}
              onPress={() => editing === row.index ? finishEditing(row.index) : startEditing(row.index)}
            />
            <AdminButton
              label="삭제"
              tone="danger"
              disabled={!editable}
              onPress={() => { setEditing(null); setDraftBand(null); onRemoveBand(row.index); }}
            />
          </>
        )}
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

function Tests({ formula, onCreate, onDelete, editable }: {
  formula: ScoringFormula;
  onCreate: (testCase: ScoringTestCase) => void;
  onDelete: (testCaseId: string) => void;
  editable: boolean;
}) {
  const runs = runTestCases(formula);
  const components = [...formula.components].sort((left, right) => left.order - right.order);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');

  /** 입력한 값으로 지금 점수를 내 보고, 그 값을 기대 점수로 삼는다. */
  const preview = calculateScore(formula, Object.fromEntries(components.map(component => {
    const text = draft[component.id];
    const value = text === undefined || text.trim() === '' ? null : Number(text);
    return [component.id, value !== null && Number.isFinite(value) ? value : null];
  })));

  const add = () => {
    if (preview.total === null) return;
    const inputs = Object.fromEntries(components.map(component => [component.id, Number(draft[component.id] ?? 0)]));
    const testCase: ScoringTestCase = {
      id: `case-${Date.now()}`,
      label: label.trim() || components.map(component => `${component.label} ${inputs[component.id]}${component.unit}`).join(' / '),
      inputs,
      expectedTotal: preview.total,
    };
    onCreate(testCase);
    setDraft({});
    setLabel('');
  };

  return (
    <>
      <SectionCard
        title={`저장된 예시 ${runs.length}개`}
        description="배점표를 고친 뒤 무엇이 달라졌는지 바로 확인하려고 남겨 둔 예시예요. 활성화하려면 모두 통과해야 해요."
      >
        <DataList
          rows={runs}
          keyOf={run => run.testCase.id}
          empty={{ title: '저장된 예시가 없어요', body: '예시가 하나도 없으면 활성화할 수 없어요. 아래에서 만들어 주세요.' }}
          columns={[
            { key: 'label', header: '예시', flex: 2.6, render: run => <CellText strong>{run.testCase.label}</CellText> },
            {
              key: 'input', header: '입력', flex: 2.4, hideOnNarrow: true,
              render: run => (
                <CellText muted>
                  {components.map(component => `${component.label} ${run.testCase.inputs[component.id] ?? '—'}${component.unit}`).join(' · ')}
                </CellText>
              ),
            },
            { key: 'expected', header: '기대', flex: 0.8, render: run => <CellText>{run.testCase.expectedTotal}점</CellText> },
            {
              key: 'actual', header: '실제', flex: 0.8,
              render: run => <CellText strong>{run.actualTotal === null ? '계산 불가' : `${run.actualTotal}점`}</CellText>,
            },
            {
              key: 'result', header: '결과', flex: 0.9,
              render: run => <StatusBadge status={run.passed ? 'APPROVED' : 'NEEDS_CHECK'} />,
            },
          ]}
          actions={run => (
            <AdminButton label="삭제" tone="danger" disabled={!editable} onPress={() => onDelete(run.testCase.id)} />
          )}
        />
      </SectionCard>

      <SectionCard
        title="예시 만들기"
        description="값을 넣으면 지금 배점표로 계산한 점수가 기대 점수가 돼요. 나중에 표를 고쳤을 때 이 값이 달라지면 바로 알 수 있어요."
      >
        <View style={styles.fieldRow}>
          {components.map(component => (
            <NumberField
              key={component.id}
              label={component.label}
              unit={component.unit}
              value={draft[component.id] ?? ''}
              onChange={next => setDraft(current => ({ ...current, [component.id]: next.replace(/[^0-9]/g, '') }))}
            />
          ))}
        </View>
        <FormSection title="예시 이름" description="비워 두면 입력값으로 이름을 만들어 드려요.">
          <TextInput
            accessibilityLabel="예시 이름"
            value={label}
            onChangeText={setLabel}
            placeholder="예: 무주택 10년 / 부양가족 3명 / 통장 10년"
            placeholderTextColor={colors.textSubtle}
            style={styles.inlineInput}
          />
        </FormSection>
        {preview.total === null ? (
          <Notice tone="amber" icon="help-outline">
            아직 기대 점수를 낼 수 없어요. {preview.problems.join(' ')}
          </Notice>
        ) : (
          <Notice tone="green" icon="check-circle">지금 배점표로 계산하면 {preview.total}점이에요. 이 값을 기대 점수로 저장해요.</Notice>
        )}
        <AdminButton label="예시 저장" icon="add" onPress={add} disabled={preview.total === null || !editable} />
      </SectionCard>
    </>
  );
}

/** 관리자가 직접 값을 넣어 점수를 확인하는 도구. */
function Simulator({ formula }: { formula: ScoringFormula }) {
  const components = [...formula.components].sort((left, right) => left.order - right.order);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [why, setWhy] = useState(false);

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

        <View style={styles.breakdownRow}>
          {result.breakdown.map(item => (
            <View key={item.componentId} style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={styles.breakdownValue}>{item.points === null ? '—' : `${item.points}점`}</Text>
              <Text style={styles.breakdownMax}>최대 {item.max}점</Text>
            </View>
          ))}
        </View>

        <Disclosure label="왜 이 점수가 나왔나요?" open={why} onToggle={() => setWhy(value => !value)}>
          <DataList
            rows={result.breakdown}
            keyOf={item => item.componentId}
            empty={{ title: '항목이 없어요', body: '배점 항목을 먼저 등록해 주세요.' }}
            columns={[
              { key: 'label', header: '항목', flex: 1.6, render: item => <CellText strong>{item.label}</CellText> },
              { key: 'input', header: '넣은 값', flex: 1, render: item => <CellText>{item.input === null ? '—' : item.input}</CellText> },
              {
                key: 'band', header: '적용된 구간', flex: 2.4,
                render: item => <CellText>{item.bandLabel ?? item.problem ?? '—'}</CellText>,
              },
              {
                key: 'points', header: '점수', flex: 1,
                render: item => <CellText strong>{item.points === null ? '—' : `${item.points} / ${item.max}점`}</CellText>,
              },
            ]}
          />
          <Text style={styles.hint}>
            각 항목은 넣은 값이 어느 구간에 드는지 찾아 그 구간의 점수를 받아요. 구간 경계는 양끝을 포함해요.
          </Text>
        </Disclosure>
      </SectionCard>
    </>
  );
}

function History({ formula }: { formula: ScoringFormulaView }) {
  const [advanced, setAdvanced] = useState(false);
  const rows = auditRows(formula.audit, formula.actors);
  return (
    <SectionCard title="변경 이력" description="누가 언제 무엇을 바꿨는지 남겨요. 최근 변경이 위에 있어요.">
      <DataList
        rows={rows}
        keyOf={row => row.key}
        empty={{ title: '기록된 변경이 없어요', body: '산식을 고치면 여기에 남아요.' }}
        columns={[
          { key: 'at', header: '시각', flex: 1.2, render: row => <CellText>{dateLabel(row.at) ?? row.at}</CellText> },
          { key: 'actor', header: '변경자', flex: 1.6, render: row => <CellText strong>{row.actor}</CellText> },
          { key: 'action', header: '한 일', flex: 1.4, render: row => <CellText strong>{row.action}</CellText> },
          { key: 'reason', header: '사유', flex: 3, render: row => <CellText>{row.reason || '—'}</CellText> },
        ]}
      />
      <Disclosure label="고급 정보" open={advanced} onToggle={() => setAdvanced(value => !value)}>
        <DataList
          rows={rows}
          keyOf={row => `raw-${row.key}`}
          empty={{ title: '기록이 없어요', body: '' }}
          columns={[
            { key: 'revision', header: 'revision', flex: 0.8, render: row => <CellText>{row.raw.revision}</CellText> },
            { key: 'action', header: 'action', flex: 1.6, render: row => <CellText>{row.raw.action}</CellText> },
            { key: 'actor', header: 'actorUserId', flex: 3, render: row => <CellText muted>{row.raw.actorUserId ?? '—'}</CellText> },
          ]}
        />
      </Disclosure>
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
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonList: { gap: 4 },
  reasonLine: { ...type.bodySm, color: colors.textMuted, lineHeight: 20 },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  scopeCard: { flex: 1, minWidth: 220, gap: 3, padding: spacing.md, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surfaceLow },
  scopeCardActive: { borderColor: colors.primaryFixed, backgroundColor: colors.lavender },
  scopeTitle: { ...type.micro, color: colors.textSubtle },
  scopeQuestion: { ...type.bodyStrong, color: colors.text },
  scopeBody: { ...type.bodySm, color: colors.textMuted, lineHeight: 20 },
  breakdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  breakdownItem: { minWidth: 120, gap: 2 },
  breakdownLabel: { ...type.bodySm, color: colors.textMuted },
  breakdownValue: { ...type.page, color: colors.text },
  breakdownMax: { ...type.micro, color: colors.textSubtle },
  inlineInput: { ...type.bodySm, color: colors.text, minHeight: 34, paddingHorizontal: 8, borderRadius: radius.button, backgroundColor: colors.surfaceLow, borderWidth: 1, borderColor: colors.surfaceHigh, outlineStyle: 'none' as never },
  totalMax: { ...type.bodySm, color: colors.textSubtle, letterSpacing: tracking.normal },
});
