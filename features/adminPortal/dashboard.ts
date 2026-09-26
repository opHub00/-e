import type { LearningRow } from '../adminLearningStatus/domain.ts';

/**
 * 운영 요약.
 *
 * 전부 관측된 행에서 센다. 추정하지 않는다. 특히 두 가지를 분명히 나눈다:
 *  - 수집된 공고: announcements 에 있는 것
 *  - 분석 가능 공고: 활성·공개·승인된 rule set 이 있고 listing 까지 연결돼 실제 판정이 열리는 것
 * 검수 상태를 못 읽은 공고의 승인 규칙 수는 0 으로 세지 않고 "확인 불가"로 남긴다.
 */
export type AdminDashboard = {
  collectedAnnouncements: number;
  analyzableAnnouncements: number;
  activeRuleSets: number;
  /** 확인 가능한 공고들의 승인 규칙 합계. */
  approvedRules: number;
  /** 승인 규칙 수를 확인할 수 없는 공고 수. approvedRules 에 포함되지 않았다는 뜻이다. */
  approvedRulesUnknownFor: number;
  listingBindings: number;
  needsAttention: number;
  /** 분석 가능 공고를 운영자가 바로 알아볼 수 있게 추린 목록. */
  analyzable: {
    announcementId: string;
    title: string;
    officialLabel: string;
    ruleCount: number | null;
    approvedCount: number | null;
    listingIds: string[];
    ruleSetId: string | null;
  }[];
};

export function buildAdminDashboard(rows: LearningRow[]): AdminDashboard {
  const withActiveRules = rows.filter(row => row.ruleSetId);
  const analyzable = withActiveRules.filter(row => row.listingIds.length > 0);
  return {
    collectedAnnouncements: rows.length,
    analyzableAnnouncements: analyzable.length,
    activeRuleSets: withActiveRules.length,
    approvedRules: rows.reduce((sum, row) => sum + (row.approvedCount ?? 0), 0),
    approvedRulesUnknownFor: withActiveRules.filter(row => row.approvedCount === null).length,
    listingBindings: rows.reduce((sum, row) => sum + row.listingIds.length, 0),
    needsAttention: rows.filter(row => row.notes.length > 0).length,
    analyzable: analyzable.map(row => ({
      announcementId: row.announcementId,
      title: row.title,
      officialLabel: row.officialLabel,
      ruleCount: row.ruleCount,
      approvedCount: row.approvedCount,
      listingIds: row.listingIds,
      ruleSetId: row.ruleSetId,
    })),
  };
}

/** 자동 학습 상태는 추적 데이터가 없다. 진행률을 만들지 않고 이 사실만 적는다. */
export const AUTOMATION_STATUS_NOTE = '자동 학습 상태: 현재 추적 데이터 없음';
export const AUTOMATION_DEBT_NOTE = '자동 수집·추출 진행 상황을 보려면 rule_extraction_jobs 에 기록하는 pipeline 과 읽기 전용 관리자 RPC 가 필요해요.';
export const RLS_LIMIT_NOTE = '검수 중 또는 비활성 규칙 세트는 현재 관리자 API에서 조회할 수 없습니다.';
