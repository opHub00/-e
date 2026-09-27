import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../design/tokens';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { countLabel, dateLabel } from '../../features/adminPortal/status';
import { RECRUITMENT_BADGE, scheduleRows, type ScheduleRow } from '../../features/adminPortal/operations';
import {
  AdminButton, CellText, DataList, KpiGrid, Notice, PageIntro, SearchFilterBar, SectionCard, StatusBadge,
} from '../../features/adminPortal/ui/AdminKit';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';

const FILTERS = [
  { key: 'ALL', label: '전체' },
  { key: 'open', label: '모집중' },
  { key: 'upcoming', label: '모집예정' },
  { key: 'closed', label: '모집종료' },
];

/**
 * 모집 일정.
 *
 * 사용자 화면이 쓰는 공고 데이터를 그대로 읽는다. 관리자용으로 따로 모으지 않는다.
 * 그래야 운영자가 보는 일정과 사용자가 보는 일정이 어긋나지 않는다.
 */
export default function AdminScheduleRoute() {
  return (
    <AdminShell title="모집 일정" subtitle="접수와 발표 일정을 임박한 순서로 봐요.">
      {() => <Schedule />}
    </AdminShell>
  );
}

function Schedule() {
  const dataset = useListingDataset();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const rows = useMemo(() => scheduleRows(dataset.listings), [dataset.listings]);

  if (dataset.status === 'loading') {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>공고 일정을 불러오는 중이에요</Text></View>;
  }
  if (dataset.status === 'error') {
    return (
      <SectionCard title="일정을 불러오지 못했어요" description="공고 데이터를 읽지 못했어요. 잠시 후 다시 시도해 주세요.">
        <AdminButton label="다시 불러오기" icon="refresh" onPress={() => void dataset.retry()} />
      </SectionCard>
    );
  }

  const shown = rows.filter(row => {
    const needle = query.replace(/\s+/g, '').toLowerCase();
    const matches = !needle || `${row.complexName}${row.district}`.replace(/\s+/g, '').toLowerCase().includes(needle);
    return matches && (status === 'ALL' || row.recruitmentStatus === status);
  });
  const closingSoon = rows.filter(row => row.daysToClose !== null && row.daysToClose >= 0 && row.daysToClose <= 7);

  return (
    <>
      <PageIntro
        title="모집 일정"
        description="접수가 임박한 공고가 위로 와요. 날짜를 모르는 공고는 아래에 모아 둬요."
      />

      {dataset.isFallback ? (
        <Notice tone="amber" icon="cloud-off">
          지금은 실제 공고를 불러오지 못해 예비 데이터를 보고 있어요. 일정을 그대로 믿지 마세요.
          {dataset.fallbackReason ? ` (${dataset.fallbackReason})` : ''}
        </Notice>
      ) : null}

      <KpiGrid items={[
        { label: '전체 공고', value: countLabel(rows.length), tone: 'neutral', icon: 'event' },
        { label: '모집중', value: countLabel(rows.filter(row => row.recruitmentStatus === 'open').length), tone: 'green', icon: 'play-circle' },
        { label: '7일 안에 마감', value: countLabel(closingSoon.length), hint: '접수 마감이 임박했어요', tone: closingSoon.length ? 'amber' : 'neutral', icon: 'timer' },
        { label: '일정 미확인', value: countLabel(rows.filter(row => row.daysToClose === null).length), hint: '접수 마감일이 없는 공고', tone: 'neutral', icon: 'help-outline' },
      ]} />

      <SectionCard title={`일정 ${shown.length}건`} description={`기준 데이터: ${dataset.fetchedAt ? dateLabel(dataset.fetchedAt) : '확인 불가'}`}>
        <SearchFilterBar
          placeholder="단지명이나 지역으로 찾기"
          query={query}
          onQuery={setQuery}
          filters={[{ label: '모집 상태', value: status, choices: FILTERS, onChange: setStatus }]}
        />
        <DataList
          rows={shown}
          keyOf={row => row.listingId}
          empty={{
            title: '조건에 맞는 공고가 없어요',
            body: '검색어나 상태를 바꿔 보세요.',
            action: <AdminButton label="필터 초기화" tone="quiet" onPress={() => { setQuery(''); setStatus('ALL'); }} />,
          }}
          columns={[
            {
              key: 'name', header: '공고', flex: 2.4,
              render: row => (
                <View style={styles.cell}>
                  <CellText strong>{row.complexName}</CellText>
                  <CellText muted>{row.district}</CellText>
                </View>
              ),
            },
            { key: 'status', header: '모집', flex: 1, render: row => <StatusBadge status={RECRUITMENT_BADGE[row.recruitmentStatus]} /> },
            { key: 'notice', header: '공고일', flex: 1, render: row => <CellText>{dateLabel(row.announcementDate) ?? '—'}</CellText> },
            {
              key: 'apply', header: '접수', flex: 1.6,
              render: row => (
                <CellText>
                  {dateLabel(row.recruitmentStartDate) ?? '—'} ~ {dateLabel(row.recruitmentEndDate) ?? '—'}
                </CellText>
              ),
            },
            { key: 'winner', header: '당첨 발표', flex: 1, render: row => <CellText>{dateLabel(row.winnerAnnouncementDate) ?? '—'}</CellText> },
            { key: 'contract', header: '계약 시작', flex: 1, hideOnNarrow: true, render: row => <CellText muted>{dateLabel(row.contractStartDate) ?? '—'}</CellText> },
            { key: 'left', header: '마감까지', flex: 1, render: row => <CellText strong>{remaining(row)}</CellText> },
          ]}
        />
      </SectionCard>
    </>
  );
}

/** 남은 날을 운영자 말로. 날짜를 모르면 비운다. */
function remaining(row: ScheduleRow): string {
  if (row.daysToClose === null) return '—';
  if (row.daysToClose < 0) return '마감됨';
  if (row.daysToClose === 0) return '오늘 마감';
  return `${row.daysToClose}일 남음`;
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textMuted },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  cell: { gap: 2 },
});
