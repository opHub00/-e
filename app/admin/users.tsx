import { AdminShell } from '../../features/adminPortal/AdminShell';
import { NotConnected, Notice, PageIntro, SectionCard } from '../../features/adminPortal/ui/AdminKit';

/**
 * 사용자 관리.
 *
 * 가입자 정보는 지금 관리자 권한으로 읽을 수 있는 경로가 없다.
 * 사용자 수를 추정해 적지 않는다. 대신 무엇이 있어야 이 화면이 켜지는지 적는다.
 */
export default function AdminUsersRoute() {
  return (
    <AdminShell title="사용자" subtitle="가입자 현황을 확인하는 자리예요.">
      {() => (
        <>
          <PageIntro
            title="사용자"
            description="가입자 수와 최근 가입, 프로필 상태를 확인하는 화면이에요."
          />

          <NotConnected
            title="사용자 목록"
            purpose="가입일, 프로필 입력 상태, 최근 접속을 한 줄씩 보게 될 자리예요."
            needs={[
              '관리자만 사용자 목록을 읽을 수 있는 조회 API(개인정보는 최소 항목만)',
              '어떤 항목을 운영에 보여줄지 정한 기준(이메일 전체 노출 여부 등)',
              '조회 기록을 남기는 감사 로그',
            ]}
          />

          <SectionCard title="개인정보를 다루는 화면이에요" description="켜기 전에 정해야 할 것들이에요.">
            <Notice tone="amber" icon="privacy-tip">
              사용자 목록은 개인정보를 그대로 보여주는 화면이에요. 누가 무엇을 볼 수 있는지,
              조회 기록을 어떻게 남길지 먼저 정한 뒤에 연결하는 편이 안전해요.
            </Notice>
          </SectionCard>
        </>
      )}
    </AdminShell>
  );
}
