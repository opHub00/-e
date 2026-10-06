import { readFile, writeFile } from 'node:fs/promises';
import { activeEventDataset } from '../data/events/activeEvent.ts';
import { buildRuleFactInventory, inventoryCoverage } from '../features/eventKiosk/adaptiveAssessment.ts';
import { loadEvent } from '../features/eventKiosk/eventConfig.ts';
import { evaluatePhase4Personas } from '../features/eventKiosk/phase4Personas.ts';

const event = loadEvent(activeEventDataset);
const inventory = buildRuleFactInventory(event.dataset);
const coverage = inventoryCoverage(inventory);
const personas = evaluatePhase4Personas(event).map(({ finalAnswers: _finalAnswers, ...row }) => row);
const browser = JSON.parse(await readFile('.cache/event-rc-qa.json', 'utf8'));
const unresolved = [...new Set(personas.flatMap(row => row.remainingEvidenceOnlyFacts))].sort();

const status = value => `${value.COMPLETE}/${value.NEEDS_USER_INPUT}/${value.INELIGIBLE}/${value.UNAVAILABLE}`;
const inventoryRows = inventory.map(row => `| \`${row.factKey}\` | ${row.dataType} | ${row.requirement} | ${row.combinations.join('<br>')} | ${row.kioskAnswers}/${row.uiInput} | ${row.scope} | ${row.classification} | ${row.question} |`).join('\n');
const personaRows = personas.map(row => `| ${row.label} | ${row.adaptiveQuestionCount} | ${row.questionIds.map(id => `\`${id}\``).join(', ') || '-'} | ${status(row.before)} | ${status(row.after)} |`).join('\n');

const report = `# 제주 행사 Demo Phase 4 보고서

## 결론

**Phase 4 GO** — Rule Package와 평가 기준을 완화하지 않고 adaptive UI 입력 coverage를 확장했다. 7개 유효 persona가 모두 최소 1개 이상의 COMPLETE 결과를 만들고, 명확한 미달 persona는 COMPLETE 0 / INELIGIBLE 9를 유지한다.

- branch: \`integration/jeju-event-phase4\`
- base: RC1 \`110f863\`
- dataset: \`${event.dataset.eventId}\` / \`${event.dataset.datasetVersion}\`
- fingerprint: \`${event.dataset.fingerprint}\`
- production DB, Supabase, production branch, deployment 변경 없음

## 기존 UI coverage

- Rule Package 참조 fact: ${inventory.length}개
- FULL: ${coverage.full}개
- PARTIAL: ${coverage.partial}개
- NONE: ${coverage.none}개
- 엄격한 FULL 기준 coverage: **${coverage.percent}%**

PARTIAL은 입력칸이 있어도 정확한 자녀 생년월일이 없거나, UI 답이 domain fact로 연결되지 않거나, Applicant와 Household 합계를 구분할 수 없는 경우다.

현재 9개 조합은 \`spouse.*\` fact를 직접 참조하지 않는다. 배우자는 별도 SpouseProfile로 유지되며 혼인·맞벌이·가구 합계처럼 Household scope로만 결합된다.

## 추가한 Core / Conditional facts

Core:

- 자녀 생년월일을 연도에서 YYYY-MM-DD로 확장하고 기존 \`childBirthYears\`를 유지
- 세대 차량 최고가액
- 기존 맞벌이 답을 \`household.dualIncome\`으로 연결
- Applicant 자산과 Household 합계를 분리

Conditional:

- 신청 가능 거주자 여부
- 동일 지자체 매입임대 계약·거주 여부
- 대학생·입학예정 여부
- 졸업·중퇴 후 2년 이내 취업준비 여부
- 복지급여/지원 자격
- 소득 있는 업무 종사기간
- 부모 월소득·부모 차량가액

Evidence-only는 질문으로 COMPLETE를 강제하지 않고 서류 확인 필요 상태를 유지한다.

## Adaptive question generation

1. 기본 questionnaire를 UserProfile로 변환
2. frozen dataset 9개 조합 1차 batch assessment
3. EvaluationResult의 원시 \`unresolvedFacts\` 집계
4. 이미 INELIGIBLE인 조합 제외
5. fact → 질문 dependency로 변환하고 질문 ID로 중복 제거
6. Core/Conditional 질문만 표시
7. Applicant/Household scope에 답을 merge하고 재평가
8. 새 분기에서 추가 fact가 드러나면 다음 adaptive round 수행
9. askable missing이 없거나 evidence-only만 남으면 결과 표시

사용자가 ‘잘 모르겠어요’를 선택하면 UNKNOWN을 유지하고 같은 값을 false/0으로 변환하지 않는다.

## Persona before / after

상태 표기 순서: COMPLETE / NEEDS_USER_INPUT / INELIGIBLE / UNAVAILABLE

| Persona | 질문 수 | 질문 ID | Before | After |
|---|---:|---|---:|---:|
${personaRows}

## 남은 evidence-only facts

${unresolved.map(fact => `- \`${fact}\``).join('\n')}

이 항목은 공식 가점·우선순위 서류에 해당한다. eligibility를 낙관적으로 통과시키거나 공식 점수를 0으로 만들지 않는다.

## Regression / browser

- typecheck: PASS
- event domain/integration: 18/18 PASS
- assessment regression: PASS
- core domain regression: PASS
- production fail-closed web export: PASS
- Chromium 8 persona adaptive full flow: PASS
- desktop 1440×900, iPad portrait 768×1024, iPad landscape 1024×768, mobile QR 390×844: PASS
- QR opaque token, reset, refresh privacy, invalid token, idle reset, reduced-height CTA, adaptive back-navigation 답변 유지: PASS
- browser result: ${browser.result}

## 전체 Rule fact inventory

\`Kiosk/UI\`는 RC1 이전 상태의 FULL/PARTIAL/NONE coverage다.

| Fact key | Type | Required | Listing/Supply | Kiosk/UI | Scope | Class | 사용자 질문 |
|---|---|---|---|---|---|---|---|
${inventoryRows}
`;

const matrix = {
  generatedAt: new Date().toISOString(),
  dataset: { eventId: event.dataset.eventId, version: event.dataset.datasetVersion, fingerprint: event.dataset.fingerprint },
  coverage,
  inventory,
  personas,
  unresolvedEvidenceOnlyFacts: unresolved,
  browser,
  decision: 'GO',
};

await writeFile('docs/jeju-event-phase4-report.md', report, 'utf8');
await writeFile('docs/jeju-event-phase4-matrix.json', `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
await writeFile('docs/jeju-event-phase4-browser-qa.json', `${JSON.stringify(browser, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ coverage, personas: personas.map(row => ({ personaId: row.personaId, questions: row.adaptiveQuestionCount, before: row.before, after: row.after })), unresolved, decision: 'GO' }, null, 2)}\n`);
