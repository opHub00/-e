import type { RecruitmentStatus } from '../discovery/types.ts';

export const APPLYHOME_COMPETITION_API_BASE =
  'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

export type SupportedCompetitionOperation =
  | 'getAPTLttotPblancCmpet'
  | 'getRemndrLttotPblancCmpet';

export type CompetitionStatus =
  | 'available'
  | 'in_progress'
  | 'not_started'
  | 'not_available';

export type ApplyHomeCompetitionIdentifier = {
  houseManageNo: string;
  pblancNo: string;
};

export type CompetitionRow = ApplyHomeCompetitionIdentifier & {
  operation: SupportedCompetitionOperation;
  housingType: string;
  modelNo: string | null;
  suppliedUnits: number | null;
  applicants: number | null;
  /** API가 직접 제공한 CMPET_RATE만 보존한다. 누락값을 임의 계산해 채우지 않는다. */
  officialCompetitionRate: number | null;
  /** 숫자, '-', '(△92)' 등 API 원문 표기. UI가 임의 경쟁률로 바꾸지 않는다. */
  officialCompetitionRateLabel: string | null;
  rankCode: number | null;
  residenceCode: string | null;
  residenceName: string | null;
  remnantAnnouncementTypeCode: string | null;
};

export type SpecialSupplyCategory =
  | '다자녀'
  | '신혼부부'
  | '생애최초'
  | '노부모부양'
  | '신생아'
  | '청년';

export type SpecialSupplyCompetitionRow = ApplyHomeCompetitionIdentifier & {
  housingType: string;
  category: SpecialSupplyCategory;
  suppliedUnits: number;
  applicants: number;
  /** 동일 주택형·동일 유형의 공식 배정세대수와 지역별 신청건수 합으로만 계산한다. */
  calculatedCompetitionRate: number | null;
  resultName: string | null;
};

export type ScopedCompetitionCounts = {
  applicants: number | null;
  suppliedUnits: number | null;
  applicantScopeKey: string;
  supplyScopeKey: string;
};

const asText = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text ? text : null;
};

const asNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll(',', '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const asNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll(',', '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildApplyHomeCompetitionJoinKey = (
  identifier: Partial<ApplyHomeCompetitionIdentifier>,
): string | null => {
  const houseManageNo = asText(identifier.houseManageNo);
  const pblancNo = asText(identifier.pblancNo);
  if (!houseManageNo || !pblancNo) return null;
  return `${houseManageNo}:${pblancNo}`;
};

/**
 * 현재 완판e가 수집하는 APT/잔여세대와 직접 join 가능한 두 operation의 감사용 adapter.
 * production UI나 repository에서는 아직 import하지 않는다.
 */
export const adaptCompetitionRows = (
  operation: SupportedCompetitionOperation,
  records: unknown,
): CompetitionRow[] => {
  if (!Array.isArray(records)) return [];

  return records.flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
    const row = record as Record<string, unknown>;
    const houseManageNo = asText(row.HOUSE_MANAGE_NO);
    const pblancNo = asText(row.PBLANC_NO);
    const housingType = asText(row.HOUSE_TY);
    if (!houseManageNo || !pblancNo || !housingType) return [];

    return [{
      operation,
      houseManageNo,
      pblancNo,
      housingType,
      modelNo: asText(row.MODEL_NO),
      suppliedUnits: asNonNegativeInteger(row.SUPLY_HSHLDCO),
      applicants: asNonNegativeInteger(row.REQ_CNT),
      officialCompetitionRate: asNonNegativeNumber(row.CMPET_RATE),
      officialCompetitionRateLabel: asText(row.CMPET_RATE),
      rankCode: operation === 'getAPTLttotPblancCmpet'
        ? asNonNegativeInteger(row.SUBSCRPT_RANK_CODE)
        : null,
      residenceCode: operation === 'getAPTLttotPblancCmpet' ? asText(row.RESIDE_SECD) : null,
      residenceName: operation === 'getAPTLttotPblancCmpet' ? asText(row.RESIDE_SENM) : null,
      remnantAnnouncementTypeCode: operation === 'getRemndrLttotPblancCmpet'
        ? asText(row.REMNDR_HSHLD_PBLANC_TYCD)
        : null,
    }];
  });
};

const SPECIAL_SUPPLY_FIELDS: ReadonlyArray<{
  category: SpecialSupplyCategory;
  supplied: string;
  applicants: readonly string[];
}> = [
  { category: '다자녀', supplied: 'MNYCH_HSHLDCO', applicants: ['CRSPAREA_MNYCH_CNT', 'CTPRVN_MNYCH_CNT', 'ETC_AREA_MNYCH_CNT'] },
  { category: '신혼부부', supplied: 'NWWDS_NMTW_HSHLDCO', applicants: ['CRSPAREA_NWWDS_NMTW_CNT', 'CTPRVN_NWWDS_NMTW_CNT', 'ETC_AREA_NWWDS_NMTW_CNT'] },
  { category: '생애최초', supplied: 'LFE_FRST_HSHLDCO', applicants: ['CRSPAREA_LFE_FRST_CNT', 'CTPRVN_LFE_FRST_CNT', 'ETC_AREA_LFE_FRST_CNT'] },
  { category: '노부모부양', supplied: 'OLD_PARNTS_SUPORT_HSHLDCO', applicants: ['CRSPAREA_OPS_CNT', 'CTPRVN_OPS_CNT', 'ETC_AREA_OPS_CNT'] },
  { category: '신생아', supplied: 'NWBB_NWBBSHR_HSHLDCO', applicants: ['CRSPAREA_NWBB_NWBBSHR_CNT', 'CTPRVN_NWBB_NWBBSHR_CNT', 'ETC_AREA_NWBB_NWBBSHR_CNT'] },
  { category: '청년', supplied: 'YGMN_HSHLDCO', applicants: ['CRSPAREA_YGMN_CNT', 'CTPRVN_YGMN_CNT', 'ETC_AREA_YGMN_CNT'] },
];

export const adaptSpecialSupplyRows = (records: unknown): SpecialSupplyCompetitionRow[] => {
  if (!Array.isArray(records)) return [];

  return records.flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
    const row = record as Record<string, unknown>;
    const houseManageNo = asText(row.HOUSE_MANAGE_NO);
    const pblancNo = asText(row.PBLANC_NO);
    const housingType = asText(row.HOUSE_TY);
    if (!houseManageNo || !pblancNo || !housingType) return [];

    return SPECIAL_SUPPLY_FIELDS.flatMap(({ category, supplied, applicants }) => {
      const suppliedUnits = asNonNegativeInteger(row[supplied]);
      const applicantCounts = applicants.map((field) => asNonNegativeInteger(row[field]));
      if (suppliedUnits === null || applicantCounts.some((value) => value === null)) return [];
      const applicantTotal = applicantCounts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      if (suppliedUnits === 0 && applicantTotal === 0) return [];
      return [{
        houseManageNo,
        pblancNo,
        housingType,
        category,
        suppliedUnits,
        applicants: applicantTotal,
        calculatedCompetitionRate: calculateScopedCompetitionRate({
          applicants: applicantTotal,
          suppliedUnits,
          applicantScopeKey: `${housingType}:${category}`,
          supplyScopeKey: `${housingType}:${category}`,
        }),
        resultName: asText(row.SUBSCRPT_RESULT_NM),
      }];
    });
  });
};

export const formatOfficialCompetitionRate = (row: CompetitionRow): string => {
  if (row.officialCompetitionRate !== null) {
    return `${row.officialCompetitionRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} : 1`;
  }
  if (row.applicants === 0) return '신청 없음';
  const deficit = row.officialCompetitionRateLabel?.match(/[△▲]\s*([\d,]+)/);
  if (deficit) return `미달 ${deficit[1]}세대`;
  return '공식 경쟁률 확인 필요';
};

/** 분모·분자가 동일한 공급 범위임을 호출자가 증명한 경우에만 계산한다. */
export const calculateScopedCompetitionRate = ({
  applicants,
  suppliedUnits,
  applicantScopeKey,
  supplyScopeKey,
}: ScopedCompetitionCounts): number | null => {
  if (
    applicants === null ||
    suppliedUnits === null ||
    !Number.isInteger(applicants) ||
    !Number.isInteger(suppliedUnits) ||
    applicants < 0 ||
    suppliedUnits <= 0 ||
    !applicantScopeKey ||
    applicantScopeKey !== supplyScopeKey
  ) return null;

  return Math.round((applicants / suppliedUnits) * 100) / 100;
};

export const deriveCompetitionStatus = (
  recruitmentStatus: RecruitmentStatus,
  officialRows: readonly CompetitionRow[],
): CompetitionStatus => {
  if (recruitmentStatus === 'upcoming') return 'not_started';
  if (recruitmentStatus === 'open') return 'in_progress';
  if (recruitmentStatus === 'closed' && officialRows.length > 0) return 'available';
  return 'not_available';
};
