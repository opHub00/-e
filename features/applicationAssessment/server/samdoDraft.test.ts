import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from './importPackage.ts';
import { samdoApplicant } from './samdoProfiles.test-data.ts';
import { assessApplication } from '../engine.ts';
import { noHomeDuration } from '../dateFacts.ts';
import { knownField } from '../../profile/domain.ts';
import type { AssessmentInput, SupplyType } from '../types.ts';
const pkg=JSON.parse(readFileSync(new URL('../../../data/assessment-rules/samdo-2026-v1.7.json',import.meta.url),'utf8'));
const rules=validateImportPackage(pkg).rules;
const result=(t:SupplyType,input:AssessmentInput=samdoApplicant(t))=>assessApplication(rules,input).find(r=>r.supplyType===t)!;
test('draft provenance, all evidence points to hashed HWP, unresolved mapping and null pages',()=>{
  assert.equal(rules.sourceStatus,'DRAFT_SOURCE_VERIFIED');assert.equal(pkg.announcement.housingManagementNumber,null);
  for(const r of pkg.rules){assert.equal(r.evidence.documentId,pkg.document.id);assert.equal(r.evidence.pageNumber,null);assert.equal(r.evidence.locator.sha256,pkg.document.sha256);assert.ok(r.evidence.textExcerpt);}
});
test('youth 9/9 priority, general score 11/12, explicit ineligible, missing',()=>{
  const p=samdoApplicant();assert.equal(result('youth',p).score?.total,9);assert.equal(result('youth',p).stage,'PRIORITY');
  p.profile.income.incomeTaxPaymentYears=knownField(3);assert.equal(result('youth',p).stage,'GENERAL');assert.equal(result('youth',p).score?.total,11);
  p.details.birthDate='2008-09-15';assert.equal(result('youth',p).status,'INELIGIBLE');
  assert.equal(result('youth',{...p,details:{}}).status,'NEEDS_MORE_INFORMATION');
});
for(const [date,eligible] of [['2007-09-14',true],['2007-09-15',false],['1986-09-15',true],['1986-09-14',false]] as const)
  test(`age boundary ${date}`,()=>{const p=samdoApplicant();p.details.birthDate=date;assert.equal(result('youth',p).status,eligible?'ELIGIBLE':'INELIGIBLE');});
for(const [date,eligible] of [['2026-03-14',true],['2026-03-15',false]] as const)
  test(`six months ${date}`,()=>{const p=samdoApplicant();p.details.subscriptionAccountOpenedAt=date;assert.equal(result('youth',p).status,eligible?'ELIGIBLE':'INELIGIBLE');});
for(const [count,points] of [[6,1],[11,1],[12,2],[23,2],[24,3]])
  test(`payment boundary ${count}`,()=>{const p=samdoApplicant();p.details.recognizedPaymentCount=count;assert.equal(result('youth',p).score?.breakdown.find(x=>x.ruleId.endsWith('paymentScore'))?.points,points);});
for(const [income,points,status] of [[2669354,3,'ELIGIBLE'],[2669355,2,'ELIGIBLE'],[3813363,2,'ELIGIBLE'],[3813364,1,'ELIGIBLE'],[5338708,1,'ELIGIBLE'],[5338709,undefined,'INELIGIBLE']] as const)
  test(`youth income ${income}`,()=>{const p=samdoApplicant();p.details.monthlyIncome=income;assert.equal(result('youth',p).status,status);assert.equal(result('youth',p).score?.breakdown[0]?.points,points);});
for(const [date,points] of [['2025-09-15',1],['2025-09-14',2],['2024-09-15',2],['2024-09-14',3]] as const)
  test(`residence ${date}`,()=>{const p=samdoApplicant();p.details.residenceStartDate=date;assert.equal(result('youth',p).score?.breakdown.find(x=>x.ruleId.endsWith('residenceScore'))?.points,points);assert.equal(result('youth',p).regionalPriority?.status,'NEEDS_REVIEW');});
for(const [years,points] of [[0,0],[2,1],[3,2],[4,2],[5,3]])
  test(`youth tax ${years}`,()=>{const p=samdoApplicant();p.profile.income.incomeTaxPaymentYears=knownField(years);p.profile.income.workOrBusinessIncomeEligible=knownField(false);assert.equal(result('youth',p).score?.breakdown.find(x=>x.ruleId.endsWith('taxScore'))?.points,points);});
test('newlywed priority and general calculated duration, lottery has no score',()=>{
 const p=samdoApplicant('newlywed');assert.equal(result('newlywed',p).score?.total,9);
 p.details.marriageDate='2021-09-14';p.details.firstMarriageDate='2021-09-14';assert.equal(result('newlywed',p).stage,'GENERAL');assert.equal(result('newlywed',p).score?.breakdown.find(x=>x.ruleId.endsWith('noHomeScore'))?.points,3);
 p.details.dualIncome=true;p.details.householdIncome=10547269;assert.equal(result('newlywed',p).stage,'LOTTERY');assert.equal(result('newlywed',p).score,undefined);
});
for(const [date,stage,status] of [['2024-09-14','PRIORITY','ELIGIBLE'],['2024-09-13','GENERAL','ELIGIBLE'],['2019-09-14','GENERAL','ELIGIBLE'],['2019-09-13',null,'INELIGIBLE']] as const)
 test(`marriage exact day ${date}`,()=>{const p=samdoApplicant('newlywed');p.details.marriageDate=date;p.details.firstMarriageDate=date;assert.equal(result('newlywed',p).stage,stage);assert.equal(result('newlywed',p).status,status);});
for(const [date,expected] of [['2023-09-15','NEEDS_MORE_INFORMATION'],['2023-09-14','NEEDS_MORE_INFORMATION'],['2019-09-15','ELIGIBLE'],['2019-09-14','INELIGIBLE']] as const)
 test(`child age + unsupported childbirth ${date}`,()=>{const p=samdoApplicant('newlywed');p.details.marriageDate='2018-01-01';p.details.children=[{birthDate:date,unborn:false}];assert.equal(result('newlywed',p).status,expected);});
for(const n of [1,2,3]) test(`minor children ${n}`,()=>{const p=samdoApplicant('newlywed');p.details.marriageDate='2021-09-14';p.details.children=Array.from({length:n},()=>({birthDate:'2020-01-01',unborn:false}));assert.equal(result('newlywed',p).score?.breakdown.find(x=>x.ruleId.endsWith('childrenScore'))?.points,n);});
for(const [income,points] of [[6027010,3],[6027011,2],[8287139,2],[8287140,1]]) test(`dual income score ${income}`,()=>{const p=samdoApplicant('newlywed');p.details.dualIncome=true;p.details.householdIncome=income;assert.equal(result('newlywed',p).score?.breakdown[0].points,points);});
for(const [birth,marriage,disposals,months] of [
 ['1992-09-14',undefined,[],48],['1991-09-14',undefined,['2025-09-14'],12],['1995-09-14','2021-09-14',[],60],
 ['1992-09-14','2018-09-14',['2024-09-14'],24],['1994-09-14','2020-09-14',[],72],['1998-09-14',undefined,[],0],
] as const) test(`HWP no-home example ${birth}/${marriage}`,()=>{assert.equal(noHomeDuration({birthDate:birth,firstMarriageDate:marriage,everMarried:!!marriage,disposalDates:[...disposals]},'2026-09-14')?.months,months);});
for(const [dispose,points] of [['2025-09-15',1],['2025-09-14',2],['2023-09-15',2],['2023-09-14',3]] as const)
 test(`no-home anniversary ${dispose}`,()=>{const p=samdoApplicant('newlywed');p.details.marriageDate='2021-09-14';p.details.firstMarriageDate='2021-09-14';p.details.housingDisposalDates=[dispose];assert.equal(result('newlywed',p).score?.breakdown.find(x=>x.ruleId.endsWith('noHomeScore'))?.points,points);});
for(const [dual,income,stage,status] of [[false,7533763,'PRIORITY','ELIGIBLE'],[false,7533764,'GENERAL','ELIGIBLE'],[false,9793892,'GENERAL','ELIGIBLE'],[false,9793893,null,'INELIGIBLE'],[true,9040516,'PRIORITY','ELIGIBLE'],[true,9040517,'GENERAL','ELIGIBLE'],[true,10547268,'GENERAL','ELIGIBLE'],[true,10547269,'LOTTERY','ELIGIBLE'],[true,15067526,'LOTTERY','ELIGIBLE'],[true,15067527,null,'INELIGIBLE']] as const)
 test(`firstHome income ${dual}/${income}`,()=>{const p=samdoApplicant('firstHome');p.details.dualIncome=dual;p.details.householdIncome=income;const r=result('firstHome',p);assert.equal(r.status,status);assert.equal(r.stage,stage);assert.equal(r.score,undefined);});
test('firstHome deposit, tax, head, single household under review',()=>{
 const p=samdoApplicant('firstHome');p.details.recognizedDepositAmount=5999999;assert.equal(result('firstHome',p).status,'INELIGIBLE');
 p.details.recognizedDepositAmount=6000000;p.profile.income.incomeTaxPaymentYears=knownField(4);assert.equal(result('firstHome',p).status,'INELIGIBLE');
 p.profile.income.incomeTaxPaymentYears=knownField(5);p.details.isHouseholdHead=false;assert.equal(result('firstHome',p).status,'INELIGIBLE');
 p.details.isHouseholdHead=true;p.profile.household.memberCount=knownField(1);assert.equal(result('firstHome',p).status,'NEEDS_MORE_INFORMATION');
});
test('overseas, special exception, childbirth, unsupported household size never silently reject',()=>{
 for(const change of [{overseasStayHistory:[{startDate:'2025-01-01',endDate:'2025-01-02'}]},{specialExceptions:['배우자 혼인 전 주택소유']},{children:[{birthDate:'2024-01-01',unborn:false}]},{incomeHouseholdSize:9}]){
  const p=samdoApplicant('firstHome');Object.assign(p.details,change);assert.equal(result('firstHome',p).status,'NEEDS_MORE_INFORMATION');
 }
});
test('newlywed account conflict with correction memo is review, not rejection',()=>{const p=samdoApplicant('newlywed');p.details.accountKindEligible=false;assert.equal(result('newlywed',p).status,'NEEDS_MORE_INFORMATION');});
test('minor applicant exception is not automatically eligible or ineligible',()=>{for(const t of ['newlywed','firstHome'] as const){const p=samdoApplicant(t);p.details.birthDate='2008-09-15';assert.equal(result(t,p).status,'NEEDS_MORE_INFORMATION');}});
test('Samdo minor child boundary is under 19; legacy fixture retains its own boundary',()=>{
 const p=samdoApplicant('newlywed');p.details.marriageDate='2021-09-14';p.details.firstMarriageDate='2021-09-14';
 p.details.children=[{birthDate:'2007-09-15',unborn:false},{birthDate:'2007-09-14',unborn:false}];
 assert.equal(result('newlywed',p).score?.breakdown.find(x=>x.ruleId.endsWith('childrenScore'))?.points,1);
});
test('fractional won is missing rather than silently falling between integer score bands',()=>{const p=samdoApplicant();p.details.monthlyIncome=2669354.5;assert.equal(result('youth',p).status,'NEEDS_MORE_INFORMATION');});
test('source asset boundaries for applicant, parent and household',()=>{
 const y=samdoApplicant();y.details.totalAssets=276000000;y.details.parentAssets=1034000000;assert.equal(result('youth',y).status,'ELIGIBLE');
 y.details.parentAssets=1034000001;assert.equal(result('youth',y).status,'INELIGIBLE');y.details.parentAssets=0;y.details.totalAssets=276000001;assert.equal(result('youth',y).status,'INELIGIBLE');
 const n=samdoApplicant('newlywed');n.details.totalAssets=362000000;assert.equal(result('newlywed',n).status,'ELIGIBLE');n.details.totalAssets=362000001;assert.equal(result('newlywed',n).status,'INELIGIBLE');
});
for(const size of [4,5,6,7,8]) test(`literal income table for ${size} people`,()=>{
 const p=samdoApplicant('firstHome');p.profile.household.memberCount=knownField(size);p.details.incomeHouseholdSize=size;p.details.dualIncome=true;
 const priority=rules.parameters[`income.${size}.120`] as number,lottery=rules.parameters[`income.${size}.200`] as number;
 p.details.householdIncome=priority;assert.equal(result('firstHome',p).stage,'PRIORITY');
 p.details.householdIncome=priority+1;assert.equal(result('firstHome',p).stage,'GENERAL');
 p.details.householdIncome=lottery;assert.equal(result('firstHome',p).stage,'LOTTERY');
 p.details.householdIncome=lottery+1;assert.equal(result('firstHome',p).status,'INELIGIBLE');
});
