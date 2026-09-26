import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusPill } from '../../components/StatusPill';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { useLearningRows } from '../../features/adminPortal/useLearningRows';
import { adminAccessMessage } from '../../features/adminPortal/access';
import { RLS_LIMIT_NOTE } from '../../features/adminPortal/dashboard';
import {
  buildAnnouncementRows, filterAnnouncementRows, sortAnnouncementRows,
  type AdminAnnouncementRow, type AnnouncementFilter,
} from '../../features/adminPortal/announcementRows';

const FILTERS: { key: AnnouncementFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'ANALYZABLE', label: '분석 가능' },
  { key: 'NO_ACTIVE_RULES', label: '활성 규칙 없음' },
];

/**
 * 공고 관리 목록.
 *
 * 관측 가능한 공고를 한 줄씩 보여주고, 상세 상태(수집 → 규칙 → 검수 → 활성화 → 연결)는
 * 기존 학습 현황 화면으로 넘긴다. 이 화면은 읽기만 한다.
 */
export default function AdminAnnouncementsRoute() {
  return (
    <AdminShell title="공고 관리" subtitle="지금 관리자 API 로 조회할 수 있는 공고예요.">
      {() => <AnnouncementList />}
    </AdminShell>
  );
}

function AnnouncementList() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const state = useLearningRows(true);
  const [filter, setFilter] = useState<AnnouncementFilter>('ALL');

  if (state.phase === 'LOADING') {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>공고를 불러오는 중이에요</Text></View>;
  }
  if (state.phase === 'FAILED') {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>공고를 불러오지 못했어요</Text>
        <Text style={styles.body}>{adminAccessMessage(state.code)}</Text>
        <Link label="다시 불러오기" onPress={state.refresh} />
      </View>
    );
  }

  const all = sortAnnouncementRows(buildAnnouncementRows(state.rows));
  const rows = filterAnnouncementRows(all, filter);
  return (
    <>
      <View style={styles.filters}>
        {FILTERS.map(item => {
          const active = filter === item.key;
          const count = filterAnnouncementRows(all, item.key).length;
          return (
            <MotionPressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: active }}
              onPress={() => setFilter(item.key)} style={[styles.filter, active && styles.filterActive]}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label} {count}</Text>
            </MotionPressable>
          );
        })}
      </View>

      {wide ? (
        <View style={styles.headRow}>
          {['공고명', '지역', '공급기관', '공고일', '규칙', '승인', '연결', '업데이트'].map(label => (
            <Text key={label} style={[styles.headCell, label === '공고명' && styles.cellWide]}>{label}</Text>
          ))}
        </View>
      ) : null}

      {rows.length === 0 ? (
        <View style={styles.card}><Text style={styles.body}>이 조건에 맞는 공고가 없어요.</Text></View>
      ) : rows.map(row => <Row key={row.announcementId} row={row} wide={wide} router={router} />)}

      <Text style={styles.note}>{RLS_LIMIT_NOTE}</Text>
    </>
  );
}

function Row({ row, wide, router }: { row: AdminAnnouncementRow; wide: boolean; router: ReturnType<typeof useRouter> }) {
  const openDetail = () => router.push('/admin/learning-status' as Href);
  return (
    <View style={styles.row}>
      <MotionPressable accessibilityRole="button" accessibilityLabel={`${row.title} 상세 상태 보기`} onPress={openDetail}>
        {wide ? (
          <View style={styles.dataRow}>
            <Text style={[styles.cell, styles.cellWide, styles.cellStrong]} numberOfLines={2}>{row.title}</Text>
            <Text style={styles.cell}>{row.region}</Text>
            <Text style={styles.cell}>{row.publisher}</Text>
            <Text style={styles.cell}>{row.announcementDate}</Text>
            <Text style={styles.cell}>{row.ruleCount}</Text>
            <Text style={styles.cell}>{row.approvedCount}</Text>
            <Text style={styles.cell}>{row.bindingLabel}</Text>
            <Text style={styles.cell}>{row.updatedAt}</Text>
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.cellStrong} numberOfLines={2}>{row.title}</Text>
            <Text style={styles.meta}>{row.region} · {row.publisher} · {row.announcementDate}</Text>
            <Text style={styles.meta}>규칙 {row.ruleCount} · 승인 {row.approvedCount} · 연결 {row.bindingLabel} · 업데이트 {row.updatedAt}</Text>
          </View>
        )}
      </MotionPressable>

      <View style={styles.pills}>
        <StatusPill label={row.officialLabel} tone={row.officialLabel === '공식 공고 기준' ? 'green' : 'neutral'} icon="verified" />
        {row.statuses.map(status => (
          <StatusPill key={status.key} label={status.label} tone={status.tone}
            icon={status.tone === 'green' ? 'check-circle' : 'help-outline'} />
        ))}
      </View>

      {row.notes.length ? <Text style={styles.note}>· {row.notes[0]}</Text> : null}

      <View style={styles.links}>
        <Link label="상세 상태" onPress={openDetail} />
        {row.ruleSetId ? <Link label="검수 콘솔" onPress={() => router.push(`/admin/rule-review?ruleSetId=${row.ruleSetId}` as Href)} /> : null}
        <Link label="listing 연결" onPress={() => router.push('/admin/listing-bindings' as Href)} />
      </View>
    </View>
  );
}

const Link = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <MotionPressable accessibilityRole="button" onPress={onPress} style={styles.link}>
    <Text style={styles.linkText}>{label}</Text>
  </MotionPressable>
);

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  filter: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceContainer },
  filterActive: { backgroundColor: colors.primary },
  filterText: { ...type.bodySm, color: colors.textMuted },
  filterTextActive: { color: colors.onPrimary },
  headRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: 4 },
  headCell: { ...type.micro, color: colors.textSubtle, flex: 1 },
  row: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: 8 },
  dataRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  cell: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  cellWide: { flex: 3 },
  cellStrong: { ...type.bodyStrong, color: colors.text },
  stack: { gap: 3 },
  meta: { ...type.bodySm, color: colors.textMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  link: { minHeight: size.touch, justifyContent: 'center' },
  linkText: { ...type.bodySmStrong, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.sm },
  cardTitle: { ...type.cardTitle, color: colors.text },
  body: { ...type.body, color: colors.textMuted },
  note: { ...type.bodySm, color: colors.textSubtle },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
