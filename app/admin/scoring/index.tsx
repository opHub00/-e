import { useEffect, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AdminChrome } from '../../../features/adminPortal/AdminShell';
import { countLabel, dateLabel } from '../../../features/adminPortal/status';
import {
  AdminButton, CellText, DataList, KpiGrid, Notice, PageIntro, SearchFilterBar, SectionCard, StatusBadge,
} from '../../../features/adminPortal/ui/AdminKit';
import {
  loadScoringFormulaList, runScoring, scoringPermission, scoringSource,
  type ScoringFormulaView,
} from '../../../features/scoringFormula/adapter';
import type { ScoringFormula } from '../../../features/scoringFormula/domain';
import { actorName, operatorError } from '../../../features/scoringFormula/operatorCopy';
import type { ScoringAccess } from '../../../features/scoringFormula/repository';
import { createConfiguredScoringRepository } from '../../../features/scoringFormula/configuredRepository';
import {
  SCORING_STATUS_LABEL, isServiceReady, summarizeFormula, type ScoringStatus,
} from '../../../features/scoringFormula/domain';

const STATUS_BADGE: Record<ScoringStatus, 'ACTIVE' | 'REVIEWING' | 'DRAFT' | 'SUSPENDED'> = {
  ACTIVE: 'ACTIVE', REVIEW: 'REVIEWING', DRAFT: 'DRAFT', SUSPENDED: 'SUSPENDED',
};

const FILTERS: { key: 'ALL' | ScoringStatus; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'ACTIVE', label: SCORING_STATUS_LABEL.ACTIVE },
  { key: 'REVIEW', label: SCORING_STATUS_LABEL.REVIEW },
  { key: 'DRAFT', label: SCORING_STATUS_LABEL.DRAFT },
  { key: 'SUSPENDED', label: SCORING_STATUS_LABEL.SUSPENDED },
];

/**
 * 가점 계산식 목록.
 *
 * 운영자가 코드를 보지 않고도 "어떤 배점표가 있고, 지금 서비스에 쓰이는 게 무엇인지"를 읽는 화면이다.
 * 활성이라는 말과 실제로 쓸 수 있다는 말은 다르다. 표에 빈틈이 있거나 저장된 예시가 틀리면
 * 활성이어도 쓰지 않는다. 그 차이를 목록에서 바로 보이게 했다.
 */
export default function ScoringListRoute() {
  return (
    <AdminChrome title="가점 계산식" subtitle="청약가점 배점표를 확인하고 시뮬레이터로 점검해요.">
      <ScoringList />
    </AdminChrome>
  );
}

function ScoringList() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | ScoringStatus>('ALL');
  // 목록도 어댑터를 거친다. 서버 구현이 끼워지면 이 화면은 그대로 둔 채 출처만 바뀐다.
  const [formulas, setFormulas] = useState<ScoringFormulaView[]>([]);
  const [access, setAccess] = useState<ScoringAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const permission = scoringPermission(access);

  useEffect(() => {
    let alive = true;
    const outcome = runScoring(() => loadScoringFormulaList(createConfiguredScoringRepository()));
    void outcome.then(result => {
      if (!alive) return;
      if (result.ok) { setFormulas(result.value.formulas); setAccess(result.value.access); setError(null); }
      // 저장소 원문이 아니라 운영자 문구만 화면에 싣는다.
      else setError(operatorError(result.code).message);
    });
    return () => { alive = false; };
  }, []);

  const summaries = useMemo(() => formulas.map(formula => ({
    ...summarizeFormula(formula), hasDraft: formula.hasDraft, draftVersion: formula.draftVersion,
    updatedBy: actorName(formula.actors.updated),
  })), [formulas]);
  const serviceReady = formulas.filter(isServiceReady).length;
  const published = formulas.filter(formula => formula.publishedToUsers && isServiceReady(formula)).length;

  const rows = summaries.filter(row => {
    const needle = query.replace(/\s+/g, '').toLowerCase();
    const matches = !needle || `${row.name}${row.targets}${row.version}`.replace(/\s+/g, '').toLowerCase().includes(needle);
    return matches && (status === 'ALL' || row.status === status);
  });

  return (
    <>
      <PageIntro
        title="가점 계산식"
        description="무주택 기간·부양가족 수·통장 가입기간처럼 점수를 매기는 항목과 구간을 관리해요. 숫자를 직접 넣어보는 시뮬레이터도 함께 있어요."
        actions={
          <AdminButton
            label="새 산식 추가"
            icon="add"
            disabled={!permission.canEdit}
            onPress={() => router.push('/admin/scoring/new' as Href)}
          />
        }
      />

      {error ? <Notice tone="pink" icon="error-outline">{error}</Notice> : null}

      <KpiGrid items={[
        { label: '등록된 산식', value: countLabel(summaries.length, '개'), tone: 'neutral', icon: 'calculate' },
        { label: '서비스에 쓸 수 있는 산식', value: countLabel(serviceReady, '개'), hint: '활성이면서 표와 예시가 모두 맞는 것', tone: serviceReady ? 'green' : 'amber', icon: 'verified' },
        { label: '사용자에게 공개 중', value: countLabel(published, '개'), hint: '공개된 산식만 사용자 화면에 해석이 나와요', tone: published ? 'green' : 'neutral', icon: 'visibility' },
        { label: '손봐야 할 산식', value: countLabel(summaries.filter(row => row.problemCount > 0 || row.testsPassed < row.testsTotal).length, '개'), tone: 'amber', icon: 'build' },
      ]} />

      <SectionCard title={`산식 목록 ${rows.length}개`}>
        <SearchFilterBar
          placeholder="산식 이름이나 적용 대상으로 찾기"
          query={query}
          onQuery={setQuery}
          filters={[{ label: '상태', value: status, choices: FILTERS.map(item => ({ key: item.key, label: item.label })), onChange: key => setStatus(key as 'ALL' | ScoringStatus) }]}
        />

        <DataList
          rows={rows}
          keyOf={row => row.id}
          empty={{
            title: '조건에 맞는 산식이 없어요',
            body: '검색어나 상태 필터를 바꿔 보세요.',
            action: <AdminButton label="필터 초기화" tone="quiet" onPress={() => { setQuery(''); setStatus('ALL'); }} />,
          }}
          columns={[
            {
              key: 'name', header: '산식', flex: 2.4,
              render: row => (
                <View style={styles.cell}>
                  <CellText strong>{row.name}</CellText>
                  <CellText muted>{row.targets}</CellText>
                </View>
              ),
            },
            { key: 'version', header: '버전', flex: 0.8, render: row => <CellText>{row.version}</CellText> },
            {
              key: 'draft', header: '후속 초안', flex: 1,
              render: row => <CellText muted>{row.hasDraft ? row.draftVersion?.version ?? '있음' : '없음'}</CellText>,
            },
            { key: 'status', header: '상태', flex: 1, render: row => <StatusBadge status={STATUS_BADGE[row.status]} /> },
            { key: 'published', header: '사용자 노출', flex: 1, render: row => <StatusBadge status={row.publishedToUsers ? 'PUBLISHED' : 'INTERNAL'} /> },
            {
              key: 'health', header: '점검', flex: 1.4,
              render: row => (
                <View style={styles.cell}>
                  <CellText>{row.componentCount}개 항목 · {row.maxScore}점 만점</CellText>
                  <CellText muted>
                    {row.problemCount ? `표 문제 ${row.problemCount}건` : '표 이상 없음'} · 예시 {row.testsPassed}/{row.testsTotal} 통과
                  </CellText>
                </View>
              ),
            },
            {
              key: 'updated', header: '최근 수정', flex: 1.2, hideOnNarrow: true,
              render: row => <View style={styles.cell}><CellText muted>{dateLabel(row.updatedAt) ?? '—'}</CellText><CellText muted>{row.updatedBy}</CellText></View>,
            },
          ]}
          actions={row => (
            <>
              <AdminButton label="열기" tone="quiet" onPress={() => router.push(`/admin/scoring/${row.id}` as Href)} />
              <AdminButton label="시뮬레이터" onPress={() => router.push(`/admin/scoring/${row.id}?tab=simulator` as Href)} />
            </>
          )}
        />
      </SectionCard>

      {scoringSource() === 'fixture-repository' ? (
        <Notice icon="info">
          로컬 테스트용 메모리 저장소를 사용하고 있어요. 새로고침하면 변경 내용이 초기화되며 운영 데이터에는 반영되지 않아요.
        </Notice>
      ) : null}

      {permission.reason ? <Notice icon="lock">{permission.reason}</Notice> : null}
    </>
  );
}

const styles = StyleSheet.create({
  cell: { gap: 2 },
});
