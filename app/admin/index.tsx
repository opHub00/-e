import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../design/tokens';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { useLearningRows } from '../../features/adminPortal/useLearningRows';
import {
  AUTOMATION_DEBT_NOTE, AUTOMATION_STATUS_NOTE, RLS_LIMIT_NOTE, buildAdminDashboard,
} from '../../features/adminPortal/dashboard';
import { adminAccessMessage } from '../../features/adminPortal/access';
import { countLabel } from '../../features/adminPortal/status';
import {
  AdminButton, CellText, DataList, KpiGrid, Notice, PageIntro, SectionCard, StatusBadge, type Kpi,
} from '../../features/adminPortal/ui/AdminKit';
import { loadFormulas } from '../../features/scoringFormula/registry';
import { isServiceReady, summarizeFormula } from '../../features/scoringFormula/domain';
import { imageStateOf, operationTasks } from '../../features/adminPortal/operations';
import { listingVisualRecords } from '../../features/listingVisual/resolvedRegistry';
import type { ListingVisualRecord } from '../../features/listingVisual/resolver';

/**
 * 운영 대시보드.
 *
 * 숫자는 전부 관측된 행에서 센다. 수집된 공고와 실제 판정이 열리는 분석 가능 공고를 나눠 보여주고,
 * 확인할 수 없는 값은 빈칸 대신 "확인 불가"라고 적는다. 자동 학습 진행률은 만들지 않는다.
 */
export default function AdminHomeRoute() {
  return (
    <AdminShell title="대시보드" subtitle="지금 관측할 수 있는 운영 상태예요.">
      {() => <Dashboard />}
    </AdminShell>
  );
}

function Dashboard() {
  const router = useRouter();
  const state = useLearningRows(true);
  const formulas = loadFormulas().map(summarizeFormula);
  const activeFormulas = loadFormulas().filter(isServiceReady).length;

  if (state.phase === 'LOADING') {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>운영 현황을 불러오는 중이에요</Text></View>;
  }
  if (state.phase === 'FAILED') {
    return (
      <SectionCard title="운영 현황을 불러오지 못했어요" description={adminAccessMessage(state.code)}>
        <AdminButton label="다시 불러오기" icon="refresh" onPress={state.refresh} />
      </SectionCard>
    );
  }

  const summary = buildAdminDashboard(state.rows);

  // 공고 하나에 listing 이 여럿일 수 있다. 그중 하나라도 쓸 만한 이미지가 있으면 그 공고는 해결된 것이다.
  const byListing = new Map<string, ListingVisualRecord[]>();
  for (const record of listingVisualRecords()) {
    if (!byListing.has(record.listingId)) byListing.set(record.listingId, []);
    byListing.get(record.listingId)!.push(record);
  }
  const imageStates = new Map(state.rows.map(row => {
    const records = row.listingIds.flatMap(id => byListing.get(id) ?? []);
    return [row.announcementId, imageStateOf(records)] as const;
  }));
  const tasks = operationTasks({ rows: state.rows, imageStates });
  const openTasks = tasks.filter(task => task.count > 0);
  const imageAttention = [...imageStates.values()].filter(state => state !== 'AUTO_VERIFIED').length;
  const kpis: Kpi[] = [
    { label: '전체 공고', value: countLabel(summary.collectedAnnouncements), hint: '지금 조회되는 공고', tone: 'neutral', icon: 'campaign' },
    { label: '분석 가능 공고', value: countLabel(summary.analyzableAnnouncements), hint: '사용자 화면에서 판정이 열려요', tone: 'green', icon: 'verified' },
    {
      label: '검수 필요 공고',
      value: countLabel(tasks.find(task => task.key === 'pendingReview')?.count ?? 0),
      hint: '승인되지 않은 규칙이 남아 있어요',
      tone: (tasks.find(task => task.key === 'pendingReview')?.count ?? 0) ? 'amber' : 'neutral',
      icon: 'fact-check',
    },
    { label: '서비스 적용 중인 분석 규칙', value: countLabel(summary.activeRuleSets, '건'), hint: '공고에 연결돼 실제로 쓰이는 규칙', tone: 'purple', icon: 'rule' },
    { label: '이미지 확인 필요', value: countLabel(imageAttention), hint: '대표 사진이 없거나 사람이 봐야 해요', tone: imageAttention ? 'amber' : 'neutral', icon: 'image' },
    // 가입자 수를 읽는 경로가 아직 없다. 0 으로 적으면 사용자가 없다는 뜻이 된다.
    { label: '전체 사용자', value: '연결 필요', hint: '가입자를 읽는 경로가 아직 없어요', tone: 'neutral', icon: 'group' },
  ];

  return (
    <>
      <PageIntro
        title="오늘의 운영 상태"
        description="수집된 공고부터 사용자가 분석을 받을 수 있는 상태까지, 지금 확인되는 사실만 보여드려요."
        actions={<AdminButton label="공고 관리 열기" icon="arrow-forward" onPress={() => router.push('/admin/announcements' as Href)} />}
      />

      <KpiGrid items={kpis} />

      <SectionCard
        title={`사용자가 분석받을 수 있는 공고 ${summary.analyzableAnnouncements}건`}
        description="규칙이 활성이고 공고까지 연결돼, 지금 사용자 화면에서 판정이 열리는 공고예요."
        action={<AdminButton label="분석 현황" tone="quiet" icon="insights" onPress={() => router.push('/admin/learning-status' as Href)} />}
      >
        <DataList
          rows={summary.analyzable}
          keyOf={row => row.announcementId}
          empty={{
            title: '지금 분석이 열린 공고가 없어요',
            body: '규칙이 활성이고 공고 연결까지 끝나야 사용자 화면에서 판정이 열려요.',
            action: <AdminButton label="분석 현황 보기" tone="quiet" onPress={() => router.push('/admin/learning-status' as Href)} />,
          }}
          columns={[
            { key: 'title', header: '공고', flex: 3, render: row => <CellText strong>{row.title}</CellText> },
            {
              key: 'basis', header: '기준', flex: 1.4,
              render: row => <StatusBadge status={row.officialLabel === '공식 공고 기준' ? 'APPROVED' : 'NEEDS_CHECK'} icon="verified" />,
            },
            {
              key: 'rules', header: '승인 규칙', flex: 1.2,
              render: row => (
                <CellText>
                  {row.approvedCount === null || row.ruleCount === null ? '확인 불가' : `${row.approvedCount} / ${row.ruleCount}개`}
                </CellText>
              ),
            },
            { key: 'bindings', header: '연결', flex: 1, render: row => <CellText>{countLabel(row.listingIds.length)}</CellText> },
          ]}
          actions={row => (
            <>
              {row.ruleSetId ? (
                <AdminButton label="규칙 검수" tone="quiet" onPress={() => router.push(`/admin/rule-review?ruleSetId=${row.ruleSetId}` as Href)} />
              ) : null}
              <AdminButton label="연결 확인" tone="quiet" onPress={() => router.push('/admin/listing-bindings' as Href)} />
            </>
          )}
        />
      </SectionCard>

      <SectionCard
        title={openTasks.length ? `지금 확인이 필요한 일 ${openTasks.length}가지` : '지금 확인이 필요한 일이 없어요'}
        description="항목을 누르면 바로 처리하는 화면으로 가요. 확인할 수 없는 값은 숫자 대신 이유를 적어요."
      >
        <DataList
          rows={tasks}
          keyOf={task => task.key}
          empty={{ title: '확인할 일이 없어요', body: '지금 관측되는 문제가 없어요.' }}
          columns={[
            {
              key: 'label', header: '할 일', flex: 3,
              render: task => (
                <View style={styles.taskCell}>
                  <CellText strong>{task.label}</CellText>
                  <CellText muted>{task.detail}</CellText>
                </View>
              ),
            },
            {
              key: 'count', header: '건수', flex: 0.8,
              render: task => <CellText strong>{task.count ? countLabel(task.count) : '없음'}</CellText>,
            },
            {
              key: 'state', header: '상태', flex: 1,
              render: task => <StatusBadge status={task.count ? 'NEEDS_CHECK' : 'APPROVED'} />,
            },
          ]}
          actions={task => (
            <AdminButton
              label={task.count ? '처리하러 가기' : '화면 열기'}
              tone={task.count ? 'primary' : 'quiet'}
              onPress={() => router.push(task.href as Href)}
            />
          )}
        />
      </SectionCard>

      <SectionCard
        title="가점 계산식"
        description="사용자에게 점수 해석을 보여주려면, 검토를 마친 산식이 활성 상태여야 해요."
        action={<AdminButton label="가점 계산식 관리" tone="quiet" icon="calculate" onPress={() => router.push('/admin/scoring' as Href)} />}
      >
        <DataList
          rows={formulas}
          keyOf={row => row.id}
          empty={{ title: '등록된 산식이 없어요', body: '가점 계산식 화면에서 배점표를 등록할 수 있어요.' }}
          columns={[
            { key: 'name', header: '산식', flex: 2.4, render: row => <CellText strong>{row.name}</CellText> },
            { key: 'target', header: '적용 대상', flex: 1.6, render: row => <CellText>{row.targets}</CellText> },
            { key: 'max', header: '만점', flex: 0.8, render: row => <CellText>{row.maxScore}점</CellText> },
            {
              key: 'status', header: '상태', flex: 1,
              render: row => <StatusBadge status={row.status === 'ACTIVE' ? 'ACTIVE' : row.status === 'REVIEW' ? 'REVIEWING' : row.status === 'SUSPENDED' ? 'SUSPENDED' : 'DRAFT'} />,
            },
            {
              key: 'published', header: '사용자 노출', flex: 1,
              render: row => <StatusBadge status={row.publishedToUsers ? 'PUBLISHED' : 'INTERNAL'} />,
            },
          ]}
          actions={row => <AdminButton label="열기" tone="quiet" onPress={() => router.push(`/admin/scoring/${row.id}` as Href)} />}
        />
      </SectionCard>

      <SectionCard title="이 화면이 아직 보여주지 못하는 것" description="숫자를 지어내지 않으려고 비워 둔 부분이에요.">
        <Notice icon="info">{AUTOMATION_STATUS_NOTE}. {AUTOMATION_DEBT_NOTE}</Notice>
        <Notice icon="visibility-off">{RLS_LIMIT_NOTE}</Notice>
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textMuted },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  taskCell: { gap: 2 },
});
