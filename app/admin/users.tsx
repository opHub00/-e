import { useState } from 'react';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import {
  AdminButton, CellText, DataList, KpiGrid, NotConnected, Notice, PageIntro, SearchFilterBar, SectionCard,
  StatusBadge,
} from '../../features/adminPortal/ui/AdminKit';

/**
 * 사용자 관리.
 *
 * 가입자 정보는 지금 관리자 권한으로 읽을 수 있는 경로가 없다.
 * 숫자를 지어내지 않되, 연결되면 어떤 화면이 되는지는 그대로 보여 준다.
 * 빈 표 하나가 "무엇을 만들어야 하는지"를 가장 정확하게 설명한다.
 */
export default function AdminUsersRoute() {
  return (
    <AdminShell title="사용자" subtitle="가입자 현황을 확인하는 자리예요.">
      {() => <Users />}
    </AdminShell>
  );
}

function Users() {
  const [query, setQuery] = useState('');
  return (
    <>
      <PageIntro
        title="사용자"
        description="가입자 수와 최근 가입, 프로필 입력 상태를 확인하는 화면이에요."
      />

      <KpiGrid items={[
        { label: '총 사용자', value: '연결 필요', hint: '가입자를 읽는 경로가 아직 없어요', tone: 'neutral', icon: 'group' },
        { label: '최근 30일 신규', value: '연결 필요', tone: 'neutral', icon: 'person-add' },
        { label: '프로필 입력 완료', value: '연결 필요', tone: 'neutral', icon: 'assignment-turned-in' },
        { label: '최근 접속', value: '연결 필요', tone: 'neutral', icon: 'schedule' },
      ]} />

      <SectionCard title="사용자 목록" description="연결되면 이 표에 가입자가 한 줄씩 들어와요.">
        <SearchFilterBar placeholder="이름이나 이메일로 찾기" query={query} onQuery={setQuery} />
        <DataList
          rows={[]}
          keyOf={() => ''}
          empty={{
            title: '아직 사용자 관리 데이터 연결이 필요합니다',
            body: '가입자를 읽는 경로가 없어서 비워 두었어요. 0명이라는 뜻이 아니에요.',
          }}
          columns={[
            { key: 'name', header: '이름', flex: 1.4, render: () => <CellText>—</CellText> },
            { key: 'email', header: '이메일', flex: 2.2, render: () => <CellText>—</CellText> },
            { key: 'profile', header: '프로필 상태', flex: 1.4, render: () => <StatusBadge status="UNKNOWN" /> },
            { key: 'joined', header: '가입일', flex: 1, render: () => <CellText>—</CellText> },
            { key: 'state', header: '상태', flex: 1, render: () => <StatusBadge status="UNKNOWN" /> },
          ]}
          actions={() => <AdminButton label="관리" tone="quiet" disabled onPress={() => {}} />}
        />
      </SectionCard>

      <NotConnected
        title="이 화면이 켜지려면"
        purpose="아래가 준비되면 위 표가 그대로 채워져요."
        needs={[
          '관리자만 사용자 목록을 읽을 수 있는 조회 API(개인정보는 최소 항목만)',
          '어떤 항목을 운영에 보여줄지 정한 기준(이메일 전체 노출 여부 등)',
          '누가 언제 사용자 정보를 열어 봤는지 남기는 기록',
        ]}
      />

      <SectionCard title="개인정보를 다루는 화면이에요" description="켜기 전에 정해야 할 것들이에요.">
        <Notice tone="amber" icon="privacy-tip">
          사용자 목록은 개인정보를 그대로 보여주는 화면이에요. 누가 무엇을 볼 수 있는지,
          조회 기록을 어떻게 남길지 먼저 정한 뒤에 연결하는 편이 안전해요.
        </Notice>
      </SectionCard>
    </>
  );
}
