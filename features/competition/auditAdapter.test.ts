import {
  adaptCompetitionRows,
  buildApplyHomeCompetitionJoinKey,
  calculateScopedCompetitionRate,
  deriveCompetitionStatus,
} from './auditAdapter.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const aptRows = adaptCompetitionRows('getAPTLttotPblancCmpet', [{
  HOUSE_MANAGE_NO: '2026000372',
  PBLANC_NO: '2026000372',
  MODEL_NO: '01',
  HOUSE_TY: '084.9000A',
  SUPLY_HSHLDCO: 20,
  SUBSCRPT_RANK_CODE: 1,
  RESIDE_SECD: '01',
  RESIDE_SENM: '해당지역',
  REQ_CNT: '401',
  CMPET_RATE: '20.05',
}]);

check(aptRows.length === 1, '공식 APT 경쟁률 row를 하나의 주택형/순위/거주범위로 보존한다');
check(aptRows[0]?.applicants === 401, '문자열 접수건수를 정수로 파싱한다');
check(aptRows[0]?.suppliedUnits === 20, '공식 공급세대수를 보존한다');
check(aptRows[0]?.officialCompetitionRate === 20.05, '공식 경쟁률을 보존한다');
check(aptRows[0]?.rankCode === 1 && aptRows[0]?.residenceCode === '01', '순위와 거주범위를 분리한다');

const missingRate = adaptCompetitionRows('getAPTLttotPblancCmpet', [{
  HOUSE_MANAGE_NO: '1',
  PBLANC_NO: '2',
  HOUSE_TY: '059A',
  SUPLY_HSHLDCO: 10,
  REQ_CNT: '30',
  CMPET_RATE: '-',
}]);
check(missingRate[0]?.officialCompetitionRate === null, '공식 경쟁률 누락을 계산값으로 몰래 채우지 않는다');
check(adaptCompetitionRows('getRemndrLttotPblancCmpet', [{ HOUSE_MANAGE_NO: '1' }]).length === 0, 'join key나 주택형이 없는 malformed row는 제외한다');
check(adaptCompetitionRows('getRemndrLttotPblancCmpet', { data: [] }).length === 0, '잘못된 envelope는 안전하게 거부한다');

check(
  buildApplyHomeCompetitionJoinKey({ houseManageNo: ' 2026000372 ', pblancNo: '2026000372' }) === '2026000372:2026000372',
  '공식 두 식별자로 deterministic join key를 만든다',
);
check(buildApplyHomeCompetitionJoinKey({ houseManageNo: '1' }) === null, '식별자 하나만으로 fuzzy join하지 않는다');

check(calculateScopedCompetitionRate({
  applicants: 401,
  suppliedUnits: 20,
  applicantScopeKey: '084A:general:rank1:local',
  supplyScopeKey: '084A:general:rank1:local',
}) === 20.05, '동일 공급 범위의 분모·분자만 deterministic 계산한다');
check(calculateScopedCompetitionRate({
  applicants: 401,
  suppliedUnits: 0,
  applicantScopeKey: 'same',
  supplyScopeKey: 'same',
}) === null, '공급세대수 0은 경쟁률을 만들지 않는다');
check(calculateScopedCompetitionRate({
  applicants: null,
  suppliedUnits: 20,
  applicantScopeKey: 'same',
  supplyScopeKey: 'same',
}) === null, '신청자 수 누락은 경쟁률을 만들지 않는다');
check(calculateScopedCompetitionRate({
  applicants: 401,
  suppliedUnits: null,
  applicantScopeKey: 'same',
  supplyScopeKey: 'same',
}) === null, '공급세대수 누락은 경쟁률을 만들지 않는다');
check(calculateScopedCompetitionRate({
  applicants: 401,
  suppliedUnits: 20,
  applicantScopeKey: '084A:general',
  supplyScopeKey: 'all:general',
}) === null, '범위가 다른 신청자 수와 공급세대수를 섞지 않는다');

check(deriveCompetitionStatus('upcoming', aptRows) === 'not_started', '접수 전은 데이터 row가 있어도 not_started다');
check(deriveCompetitionStatus('open', aptRows) === 'in_progress', '접수 중은 최종 경쟁률로 표시하지 않는다');
check(deriveCompetitionStatus('closed', aptRows) === 'available', '접수 종료 후 공식 row가 있을 때만 available이다');
check(deriveCompetitionStatus('closed', []) === 'not_available', '접수 종료 후 공식 row가 없으면 unavailable이다');
check(deriveCompetitionStatus('unknown', aptRows) === 'not_available', '일정 상태 불명은 최종 경쟁률로 단정하지 않는다');

console.log(`competition audit adapter checks passed: ${checks}`);
