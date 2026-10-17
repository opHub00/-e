import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../../design/tokens';
import { AdminButton, EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell, useConsole } from '../../../features/adminConsole/ConsoleShell';
import { Field, FieldGrid, LifecycleBadge, ValidationBadge, WrapTabs } from '../../../features/adminConsole/ConsoleKit';
import { noticeById, shortTime } from '../../../features/adminConsole/consoleModel';
import type { ConsoleNotice, ConsoleSnapshot } from '../../../features/adminConsole/contract';

type Tab = 'overview' | 'source' | 'rules' | 'rag' | 'history';

/** 공고 상세. 탭으로 나누되 좁은 화면에서도 탭은 줄바꿈된다. 해시·locator 는 운영 화면이라 그대로 보여 준다. */
export default function ConsoleNoticeDetail() {
  return (
    <ConsoleShell
      menuKey="notices"
      title="공고 상세"
      subtitle="원문·규칙 패키지·RAG·변경 이력을 한 공고 기준으로 봐요."
      testID="console-notice-detail"
      needs={['공고 상세(원문 해시·provenance·공급유형·규칙 수·RAG chunk 수·검증 결과·이력)']}
    >
      {snapshot => <Detail snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Detail({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { link } = useConsole();
  const [tab, setTab] = useState<Tab>('overview');
  const notice = noticeById(snapshot, id);
  const back = () => router.push(link('/admin/console/notices'));
  if (!notice) return <EmptyState title="공고를 찾을 수 없어요" body="목록에서 다시 골라 주세요." action={<AdminButton label="공고 목록" icon="arrow-back" onPress={back} />} />;
  const rules = snapshot.rules.filter(rule => rule.noticeId === notice.id);
  return (
    <View style={styles.stack}>
      <SectionCard title={notice.title} description={`${notice.region} · 공고일 ${notice.announcementDate} · 최근 업데이트 ${shortTime(notice.updatedAt)}`} action={<AdminButton label="목록" tone="quiet" icon="arrow-back" onPress={back} />}>
        <View style={styles.badges}><LifecycleBadge status={notice.status} /><ValidationBadge validation={notice.validation} /></View>
      </SectionCard>
      <WrapTabs<Tab>
        testID="console-notice-tabs"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: '개요' },
          { key: 'source', label: '원문' },
          { key: 'rules', label: '규칙 패키지', count: notice.ruleCount },
          { key: 'rag', label: 'RAG', count: notice.ragChunkCount },
          { key: 'history', label: '이력', count: notice.history.length },
        ]}
      />
      {tab === 'overview' ? <Overview notice={notice} /> : null}
      {tab === 'source' ? (
        <SectionCard title="원문" description="판정과 RAG 가 근거로 삼는 문서예요.">
          <FieldGrid>
            <Field label="파일" value={notice.provenance.fileName} />
            <Field label="출처" value={notice.provenance.official ? '공식 원문' : '사용자 제공본(공식 게시본 확인 필요)'} />
            <Field label="SHA-256" value={notice.provenance.sha256} mono />
            <Field label="원문 링크" value={notice.provenance.sourceUrl ?? '없음'} />
          </FieldGrid>
        </SectionCard>
      ) : null}
      {tab === 'rules' ? (
        <SectionCard title="규칙 패키지" description={`${notice.ruleVersion ?? '버전 없음'} · 규칙 ${notice.ruleCount}건 · 검토 대기 ${rules.filter(rule => rule.status === 'PENDING').length}건`} action={<AdminButton label="규칙 검토로" icon="fact-check" onPress={() => router.push(link('/admin/console/rules', { notice: notice.id }))} />}>
          <Text style={styles.body}>규칙 하나씩 근거 문장과 함께 확인하고 승인해요.</Text>
        </SectionCard>
      ) : null}
      {tab === 'rag' ? (
        <SectionCard title="RAG 색인" description="AI 상담이 근거로 찾는 공고 조각이에요.">
          <FieldGrid>
            <Field label="RAG 버전" value={notice.ragVersion ?? '색인 없음'} />
            <Field label="chunk 수" value={`${notice.ragChunkCount}개`} />
          </FieldGrid>
        </SectionCard>
      ) : null}
      {tab === 'history' ? (
        <SectionCard title="변경 이력" description="최신 순">
          <View style={styles.list}>
            {!notice.history.length ? <Text style={styles.body}>기록된 변경이 없어요.</Text> : null}
            {[...notice.history].sort((a, b) => b.at.localeCompare(a.at)).map(item => (
              <View key={`${item.at}-${item.summary}`} style={styles.line}>
                <Text style={styles.time}>{shortTime(item.at)}</Text>
                <Text style={styles.lineText}>{item.summary} · {item.actor}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}
    </View>
  );
}

function Overview({ notice }: { notice: ConsoleNotice }) {
  return (
    <SectionCard title="개요" description="서비스에 내보내기 전에 확인하는 값이에요.">
      <FieldGrid>
        <Field label="공급유형" value={notice.supplyTypes.join(' · ') || '—'} />
        <Field label="규칙 수" value={`${notice.ruleCount}건`} />
        <Field label="RAG chunk" value={`${notice.ragChunkCount}개`} />
        <Field label="규칙 버전" value={notice.ruleVersion ?? '없음'} />
        <Field label="RAG 버전" value={notice.ragVersion ?? '없음'} />
        <Field label="검증">
          <View style={styles.validation}>
            <ValidationBadge validation={notice.validation} />
            {notice.validation.messages.map(message => <Text key={message} style={styles.body}>· {message}</Text>)}
          </View>
        </Field>
      </FieldGrid>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { ...type.bodySm, color: colors.textMuted },
  list: { gap: 8 },
  line: { flexDirection: 'row', gap: 10 },
  time: { ...type.caption, color: colors.textMuted, width: 72 },
  lineText: { ...type.bodySm, color: colors.text, flex: 1 },
  validation: { gap: 4 },
});
