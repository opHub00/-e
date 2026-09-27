import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, type } from '../../design/tokens';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import {
  AdminButton, KpiGrid, NotConnected, Notice, PageIntro, SectionCard,
} from '../../features/adminPortal/ui/AdminKit';

type Tab = 'bases' | 'documents' | 'health';

const TABS: { key: Tab; label: string }[] = [
  { key: 'bases', label: '지식베이스' },
  { key: 'documents', label: '문서' },
  { key: 'health', label: '운영 상태' },
];

/**
 * 지식베이스 관리.
 *
 * 아직 문서 저장소도, 문서별 상태를 읽는 경로도 없다.
 * 빈 표에 "0건"이라고 적으면 운영자는 문서를 다 지운 줄 안다. 그래서 무엇이 없는지 그대로 적는다.
 * 화면 뼈대는 미리 맞춰 둔다. 연결되는 날 숫자만 채우면 되도록.
 */
export default function AdminKnowledgeRoute() {
  return (
    <AdminShell title="지식베이스" subtitle="AI 가 답할 때 참고하는 문서를 관리하는 자리예요.">
      {() => <Knowledge />}
    </AdminShell>
  );
}

function Knowledge() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('bases');

  return (
    <>
      <PageIntro
        title="지식베이스"
        description="공고 원문, 규정, 자주 묻는 질문처럼 AI 가 참고할 문서를 모아 두는 곳이에요."
      />

      <KpiGrid items={[
        { label: '활성 지식베이스', value: '연결 필요', hint: '문서 저장소가 아직 없어요', tone: 'neutral', icon: 'library-books' },
        { label: '총 문서', value: '연결 필요', tone: 'neutral', icon: 'description' },
        { label: '최근 처리 실패', value: '연결 필요', tone: 'neutral', icon: 'error-outline' },
        { label: '최근 업데이트', value: '연결 필요', tone: 'neutral', icon: 'schedule' },
      ]} />

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

      {tab === 'bases' ? (
        <NotConnected
          title="지식베이스 목록"
          purpose="이름, 연결된 공고, 문서 수, 상태, 최근 업데이트를 한 줄씩 보게 될 자리예요."
          needs={[
            '지식베이스를 담을 표(이름·설명·연결 공고·상태)',
            '관리자만 읽을 수 있는 조회 API',
            '지식베이스와 공고를 잇는 연결',
          ]}
        />
      ) : null}

      {tab === 'documents' ? (
        <NotConnected
          title="문서 목록"
          purpose="업로드한 문서와 처리 상태, 페이지 수와 조각 수를 보게 될 자리예요."
          needs={[
            '문서 파일 저장소와 문서 표(제목·출처·업로드 시각·처리 상태)',
            '문서를 조각내어 색인한 결과를 세는 경로',
            '문서 보기·삭제를 안전하게 처리하는 경로',
          ]}
        />
      ) : null}

      {tab === 'health' ? (
        <NotConnected
          title="운영 상태"
          purpose="질문 건수, 성공·실패, 최근 오류를 보게 될 자리예요."
          needs={[
            '질문과 답변을 기록하는 곳(성공·실패 포함)',
            '실패 사유를 남기는 기록',
            '기간별로 집계해 읽는 경로',
          ]}
        />
      ) : null}

      <SectionCard title="지금 확인할 수 있는 것" description="문서 기반으로 이미 동작하는 부분이에요.">
        <Notice icon="fact-check">
          공고에서 뽑은 판정 규칙은 이미 검수 화면에서 문서 근거와 함께 볼 수 있어요.
          규칙마다 어느 문단에서 나왔는지 남아 있어요.
        </Notice>
        <AdminButton label="규칙 검수 열기" tone="quiet" icon="fact-check" onPress={() => router.push('/admin/rule-review' as Href)} />
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceContainer },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...type.bodySm, color: colors.textMuted },
  tabTextActive: { color: colors.onPrimary },
});
