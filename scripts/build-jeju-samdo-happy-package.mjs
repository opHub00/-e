import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildImportPackage } from './build-import-package.mjs';

const parsedPath = resolve(process.argv[2] ?? '.cache/jeju-samdo-happy-housing/parsed-document.json');
const transcriptionPath = resolve('data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.transcription.json');
const packagePath = resolve('data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.json');
const documentId = '620be476-2073-4bf4-8db9-0bacb6ae1b29';

const condition = (ruleKey, supplyType, stage, label, expression, blockIds, documents = []) => ({
  ruleKey, supplyType, stage, category: stage === null ? 'ELIGIBILITY' : 'STAGE',
  config: { label, expression, documents },
  evidence: { blockIds, section: label },
});
const fact = (name, op, value) => ({ fact:name, op, value });
const eq = (name, value) => fact(name, 'eq', value);
const all = (...items) => ({ all:items });
const any = (...items) => ({ any:items });
const common = (supply, blockIds = ['b000097','b000099','b000100','b000104','b000137','b000139','b000140','b000141']) => [
  condition(`${supply}.applicantAgeOrException`, supply, null, '성년 신청자 또는 미성년 세대주 예외', eq('adultOrMinorHouseholdHeadException', true), blockIds, ['주민등록표등본','가족관계증명서']),
  condition(`${supply}.subletRestriction`, supply, null, '공공임대 불법양도·전대 재입주 제한이 없음', eq('noPublicRentalSubletRestriction', true), ['b000137','b000139','b000140','b000141']),
  condition(`${supply}.singleApplication`, supply, null, '세대당 1건 신청', eq('singleHouseholdApplicationClear', true), ['b000157','b000985']),
];

const incomeThresholds = {
  1:{120:4576036},
  2:{110:6452897,120:7039524,130:7626151,140:8212778},
  3:{100:8168429,110:8985272,120:9802115,130:10618958,140:11435801},
  4:{100:8802202,110:9682422,120:10562642,130:11442863,140:12323083},
  5:{100:9326985,110:10259684,120:11192382,130:12125081,140:13057779},
  6:{100:9906263,110:10896889,120:11887516,130:12878142,140:13868768},
};
const parameters = {
  'supplyLabel.student': '대학생 계층',
  'supplyLabel.youth': '청년 계층',
  'supplyLabel.newlywed': '신혼부부·예비신혼부부 계층',
  'supplyLabel.senior': '고령자 계층',
  'supplyLabel.housingBenefit': '주거급여수급자 계층',
  'amounts.integerWon':true,
  'children.includeUnborn':true,
  'children.minorAgeYears':19,
  'exceptions.childbirthAfter':'2023-03-28',
  'announcement.applicationStartsAt':'2026-10-01T10:00:00+09:00',
  'announcement.applicationEndsAt':'2026-10-02T17:00:00+09:00',
  'announcement.documentTargetAt':'2026-10-08T16:00:00+09:00',
  'announcement.documentsEndDate':'2026-10-14',
  'announcement.winnerAt':'2026-12-28T16:00:00+09:00',
  'announcement.applicationResidency':'NATIONWIDE',
  'stage.student.PRIORITY.label':'1순위', 'stage.student.GENERAL.label':'2순위',
  'stage.youth.PRIORITY.label':'1순위', 'stage.youth.GENERAL.label':'2순위',
  'stage.newlywed.PRIORITY.label':'1순위', 'stage.newlywed.GENERAL.label':'2순위',
  'stage.senior.LOTTERY.label':'추첨', 'stage.housingBenefit.LOTTERY.label':'추첨',
  'warning.selection':'대학생·청년·신혼부부·한부모가족은 순위 후 추첨, 고령자·주거급여수급자는 추첨으로 선정합니다.',
  'warning.childbirth':'2023-03-28 이후 출산·입양·태아에 따른 소득·자산 가산을 최대 2명까지 반영합니다.',
};
for (const supply of ['student','youth','newlywed','senior']) {
  parameters[`threshold.${supply}.incomeFact`] = supply === 'student' ? 'parentApplicantMonthlyIncome' : 'householdIncome';
  parameters[`threshold.${supply}.incomeMaxPercent`] = supply === 'newlywed' ? 140 : 120;
  parameters[`threshold.${supply}.incomePercent.single.1`] = 120;
  parameters[`threshold.${supply}.incomePercent.single.2`] = 110;
  parameters[`threshold.${supply}.incomePercent.single.default`] = 100;
  if (supply === 'newlywed') {
    parameters[`threshold.${supply}.incomePercent.dual.1`] = 120;
    parameters[`threshold.${supply}.incomePercent.dual.2`] = 130;
    parameters[`threshold.${supply}.incomePercent.dual.default`] = 120;
  }
  for (const [size, values] of Object.entries(incomeThresholds)) for (const [percent, amount] of Object.entries(values)) {
    parameters[`threshold.${supply}.income.${size}.${percent}`] = amount;
  }
}
for (const [supply, values] of Object.entries({
  student:[[108000000,0],[119000000,0],[130000000,0]],
  youth:[[251000000,45420000],[276000000,49960000],[301000000,54510000]],
  newlywed:[[345000000,45420000],[379000000,49960000],[413000000,54510000]],
  senior:[[345000000,45420000],[379000000,49960000],[413000000,54510000]],
})) values.forEach(([assets,vehicle], band) => {
  parameters[`threshold.${supply}.assets.${band}`] = assets;
  parameters[`threshold.${supply}.vehicle.${band}`] = vehicle;
});

const rules = [];
const add = (...items) => rules.push(...items);
add(...common('student'),
  condition('student.education','student',null,'대학생 또는 졸업·중퇴 2년 이내 취업준비생',any(eq('educationStatus','ENROLLED_OR_INCOMING'),all(eq('educationStatus','GRADUATED_OR_WITHDRAWN'),fact('graduationMonths','lte',24))),['b000148','b000151','b000152','b000153']),
  condition('student.unmarried','student',null,'미혼',eq('maritalStatus','single'),['b000154']),
  condition('student.noHome','student',null,'신청자 본인 무주택',eq('noHome',true),['b000148','b000128']),
  condition('student.income','student',null,'본인·부모 소득 기준',eq('incomeWithinAnnouncementLimit',true),['b000155','b000156','b000158','b000160','b000161','b000162','b000163','b000164','b000165']),
  condition('student.assets','student',null,'본인 총자산 기준',eq('assetsWithinAnnouncementLimit',true),['b000167','b000168','b000170','b000173','b000177','b000178','b000179','b000181']),
  condition('student.vehicle','student',null,'자동차를 소유하지 않음',eq('vehicleValue',0),['b000167','b000173']),
  condition('student.rank1','student','PRIORITY','제주 거주 또는 제주 대학 재학',any(eq('residence','제주특별자치도'),eq('schoolRegion','제주특별자치도')),['b000236','b000239','b000242','b000244']));
add(...common('youth'),
  condition('youth.category','youth',null,'청년 또는 소득활동 5년 이내 사회초년생',any(all(fact('age','gte',19),fact('age','lte',39)),all(any(eq('youthActivityCategory','WORKER'),eq('youthActivityCategory','RECENTLY_UNEMPLOYED'),eq('youthActivityCategory','ARTIST')),fact('totalIncomeWorkMonths','lte',60))),['b000190','b000191','b000193','b000194','b000195','b000196','b000197'],['주민등록표등본','국민연금 가입증명서','건강보험자격득실확인서']),
  condition('youth.unmarried','youth',null,'미혼',eq('maritalStatus','single'),['b000199']),
  condition('youth.noHome','youth',null,'신청자 본인 무주택',eq('noHome',true),['b000190','b000201']),
  condition('youth.income','youth',null,'해당 세대 소득 기준',eq('incomeWithinAnnouncementLimit',true),['b000200','b000202','b000204','b000208','b000210','b000211','b000212','b000213','b000214']),
  condition('youth.assets','youth',null,'해당 세대 총자산 기준',eq('assetsWithinAnnouncementLimit',true),['b000217','b000221','b000228','b000231','b000232','b000234']),
  condition('youth.vehicle','youth',null,'해당 세대 자동차 기준',eq('vehicleWithinAnnouncementLimit',true),['b000217','b000228','b000231','b000232','b000234']),
  condition('youth.account','youth',null,'입주 전까지 청약통장 가입사실 증명',eq('canProveSubscriptionByMoveIn',true),['b000219']),
  condition('youth.rank1','youth','PRIORITY','제주 거주 또는 제주 소득 근거지',any(eq('residence','제주특별자치도'),eq('incomeSourceRegion','제주특별자치도')),['b000236','b000239','b000242']));
add(...common('newlywed'),
  condition('newlywed.category','newlywed',null,'신혼부부·예비신혼부부·한부모가족',any(all(eq('familyCategory','married'),any(eq('marriageWithin7Years',true),eq('hasChildUnder7',true))),all(eq('familyCategory','engaged'),eq('plannedMarriageWithinDeadline',true)),all(eq('familyCategory','singleParent'),eq('singleParentQualified',true),eq('hasChildUnder7',true))),['b000252','b000253','b000254','b000257','b000258','b000259','b000260']),
  condition('newlywed.householdNoHome','newlywed',null,'현재 또는 미래 세대 전원 무주택',eq('householdNoHome',true),['b000252','b000253','b000288','b000354','b000355']),
  condition('newlywed.income','newlywed',null,'해당 세대 소득 기준',eq('incomeWithinAnnouncementLimit',true),['b000262','b000263','b000264','b000269','b000271','b000273','b000275','b000276','b000312','b000313','b000314','b000315','b000316']),
  condition('newlywed.assets','newlywed',null,'해당 세대 총자산 기준',eq('assetsWithinAnnouncementLimit',true),['b000280','b000282','b000289','b000295','b000297','b000298','b000299','b000300']),
  condition('newlywed.vehicle','newlywed',null,'해당 세대 자동차 기준',eq('vehicleWithinAnnouncementLimit',true),['b000280','b000282','b000294','b000295','b000297','b000298','b000299','b000300']),
  condition('newlywed.account','newlywed',null,'입주 전까지 본인 또는 배우자 청약통장 가입사실 증명',eq('canProveSubscriptionByMoveIn',true),['b000284','b000285','b000289']),
  condition('newlywed.rank1','newlywed','PRIORITY','본인·배우자의 제주 거주 또는 소득 근거지',any(eq('residence','제주특별자치도'),eq('incomeSourceRegion','제주특별자치도')),['b000291','b000295','b000299','b000302','b000308']));
add(...common('senior'),
  condition('senior.age','senior',null,'만 65세 이상',fact('age','gte',65),['b000327','b000329','b000331']),
  condition('senior.householdNoHome','senior',null,'세대 전원 무주택',eq('householdNoHome',true),['b000331','b000354','b000355']),
  condition('senior.income','senior',null,'해당 세대 소득 기준',eq('incomeWithinAnnouncementLimit',true),['b000333','b000335','b000337','b000338','b000339','b000340','b000343','b000345','b000347']),
  condition('senior.assets','senior',null,'해당 세대 총자산 기준',eq('assetsWithinAnnouncementLimit',true),['b000351','b000353','b000360','b000363','b000365','b000367']),
  condition('senior.vehicle','senior',null,'해당 세대 자동차 기준',eq('vehicleWithinAnnouncementLimit',true),['b000351','b000353','b000360','b000363','b000365','b000367']));
add(...common('housingBenefit'),
  condition('housingBenefit.recipient','housingBenefit',null,'주거급여 수급자',eq('housingBenefitRecipient',true),['b000376','b000379','b000381','b000393']),
  condition('housingBenefit.householdNoHome','housingBenefit',null,'세대 전원 무주택',eq('householdNoHome',true),['b000381','b000383','b000385','b000387','b000389','b000391']));

const bySupply = type => rules.filter(rule => rule.supplyType === type);
const supplies = ['student','youth','newlywed','senior','housingBenefit'].map(type => ({
  type,
  eligibility: bySupply(type).filter(rule => rule.stage === null).map(rule => rule.ruleKey),
  stages: type === 'senior' || type === 'housingBenefit'
    ? [{stage:'LOTTERY',conditions:[],scores:null}]
    : [{stage:'PRIORITY',conditions:bySupply(type).filter(rule => rule.stage === 'PRIORITY').map(rule => rule.ruleKey),scores:null},{stage:'GENERAL',conditions:[],scores:null}],
}));

const transcription = {
  evidencePrefix:'lh.jeju.happy.20260918',
  evidenceSource:'제주일도·삼도 행복주택 예비입주자 모집공고(2026.09.18.)',
  announcement:{id:'902916ae-bb9a-4ddf-a3cc-505d18a20e25',source:'LH',externalId:'lh-jeju-ildo-samdo-happy-20260918',housingManagementNumber:null,title:'제주일도·삼도 행복주택 예비입주자 모집',publisher:'한국토지주택공사',announcementDate:'2026-09-18',regionCode:'500',regionName:'제주특별자치도',sourceUrl:null},
  document:{id:documentId,documentType:'DRAFT',storagePath:'2026/902916ae-bb9a-4ddf-a3cc-505d18a20e25/620be476-2073-4bf4-8db9-0bacb6ae1b29/original.pdf',fileName:'lh-2026-09-18-jeju-ildo-samdo-happy-housing.pdf',mimeType:'application/pdf',versionLabel:'2026.09.18. 모집공고 검토본',sha256:'76c89334fb042564569d9856acd073c85a84c425f124474891bdb01303d6404e',isOfficial:false,sourceUrl:null,publishedAt:null},
  ruleSet:{id:'20b37b91-9edf-479a-a56a-ac9d3b70c424',version:'DRAFT-2026-09-18-transcription-1',sourceStatus:'DRAFT_SOURCE_VERIFIED',effectiveDate:'2026-09-18',config:{parameters,supplies}},
  rules,
};

const parsed = JSON.parse(await readFile(parsedPath,'utf8'));
const pkg = buildImportPackage(transcription, parsed);
await writeFile(transcriptionPath, `${JSON.stringify(transcription,null,2)}\n`);
await writeFile(packagePath, `${JSON.stringify(pkg,null,2)}\n`);
console.log(`Jeju Happy Housing package: ${pkg.rules.length} rules, ${supplies.length} supplies`);
