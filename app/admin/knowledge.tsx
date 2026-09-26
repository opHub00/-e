import { useRouter, type Href } from 'expo-router';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { AdminButton, NotConnected, Notice, PageIntro, SectionCard } from '../../features/adminPortal/ui/AdminKit';

/**
 * 지식베이스 관리.
 *
 * 아직 문서 저장소도, 문서별 상태를 읽는 경로도 없다.
 * 빈 표에 "0건"이라고 적으면 운영자는 문서를 다 지운 줄 안다. 그래서 무엇이 없는지 그대로 적는다.
 */
export default function AdminKnowledgeRoute() {
  const router = useRouter();
  return (
    <AdminShell title="지식베이스" subtitle="AI 가 답할 때 참고하는 문서를 관리하는 자리예요.">
      {() => (
        <>
          <PageIntro
            title="지식베이스"
            description="공고 원문, 규정, 자주 묻는 질문처럼 AI 가 참고할 문서를 모아 두는 곳이에요."
          />

          <NotConnected
            title="문서 목록"
            purpose="등록된 문서와 처리 상태, 문서별 청크 수를 여기서 보게 될 자리예요."
            needs={[
              '문서를 담을 저장소와 문서 표(제목·출처·업로드 시각·처리 상태)',
              '문서를 조각내어 색인한 결과를 세는 경로',
              '관리자만 읽을 수 있는 조회 API',
              '문서와 공고를 잇는 연결(어떤 공고의 문서인지)',
            ]}
          />

          <SectionCard title="지금 확인할 수 있는 것" description="문서 기반으로 이미 동작하는 부분이에요.">
            <Notice icon="fact-check">
              공고에서 뽑은 판정 규칙은 이미 검수 화면에서 문서 근거와 함께 볼 수 있어요.
              규칙마다 어느 문단에서 나왔는지 남아 있어요.
            </Notice>
            <AdminButton label="규칙 검수 열기" tone="quiet" icon="fact-check" onPress={() => router.push('/admin/rule-review' as Href)} />
          </SectionCard>
        </>
      )}
    </AdminShell>
  );
}
