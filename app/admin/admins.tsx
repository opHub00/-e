import { AdminShell } from '../../features/adminPortal/AdminShell';
import { ADMIN_ROLE_LABEL } from '../../features/adminPortal/access';
import {
  CellText, DataList, NotConnected, Notice, PageIntro, SectionCard, StatusBadge,
} from '../../features/adminPortal/ui/AdminKit';

/**
 * 관리자 계정.
 *
 * 권한은 서버가 판정한다(get_assessment_review_access). 이 화면이 스스로 정하지 않는다.
 * 계정 목록을 읽는 경로가 아직 없어서, 지금은 "내 권한"만 사실대로 보여준다.
 */
export default function AdminAdminsRoute() {
  return (
    <AdminShell title="관리자 계정" subtitle="운영 권한을 확인하는 자리예요.">
      {access => (
        <>
          <PageIntro
            title="관리자 계정"
            description="누가 운영 화면을 열 수 있는지, 어떤 권한을 갖는지 관리하는 화면이에요."
          />

          <SectionCard title="지금 로그인한 계정" description="서버가 판정한 권한을 그대로 보여드려요.">
            <DataList
              rows={[access]}
              keyOf={() => 'me'}
              empty={{ title: '계정 정보를 읽지 못했어요', body: '다시 로그인해 주세요.' }}
              columns={[
                { key: 'email', header: '계정', flex: 2.4, render: row => <CellText strong>{row.email ?? '확인 불가'}</CellText> },
                { key: 'role', header: '권한', flex: 1.2, render: row => <CellText>{ADMIN_ROLE_LABEL[row.role]}</CellText> },
                { key: 'state', header: '상태', flex: 1, render: () => <StatusBadge status="ACTIVE" /> },
              ]}
            />
            <Notice icon="info">
              권한은 서버에서 정해요. 이 화면에서 권한을 바꾸지 않아요.
              {' '}관리자는 검수와 승인까지, 검수자는 검수까지 할 수 있어요.
            </Notice>
          </SectionCard>

          <NotConnected
            title="전체 관리자 목록"
            purpose="관리자와 검수자 계정, 마지막 로그인, 활성 여부를 한 줄씩 보게 될 자리예요."
            needs={[
              '관리자 계정 목록을 읽는 관리자 전용 조회 API',
              '마지막 로그인 시각을 남기는 기록',
              '권한 부여·회수를 안전하게 처리하는 경로(누가 바꿨는지 함께 남기기)',
            ]}
          />
        </>
      )}
    </AdminShell>
  );
}
