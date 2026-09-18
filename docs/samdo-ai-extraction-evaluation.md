# Samdo semantic extraction benchmark — 실행 승인 대기

## 상태

시작 commit `7866e4a`, branch `feature/rule-extraction`, 시작 working tree clean.

**실제 semantic AI 호출은 아직 실행하지 않았다.** 자동 승인 검토가 VER1.7 검토본 내용을 Google Gemini라는 특정 외부 목적지로 전송하는 명시적 승인이 필요하다는 사유로 실행을 차단했다. 우회 실행하지 않았으며 사용자에게 해당 전송 승인을 요청했다.

모델 metadata read-only 조회는 HTTP 200으로 성공했다. 모델 metadata 조회는 문서 추출 호출이나 성능 측정이 아니다. 추출 전 검증 규칙 파일을 읽거나 prompt에 넣지 않았다.

## 실행 준비

- 기존 AI infrastructure: `supabase/functions/ai/index.ts`의 Gemini REST 기반 설명 기능, 모델 gemini-2.5-flash. 기존 endpoint는 수정하지 않았다.
- 새 benchmark: 같은 provider의 reasoning 모델 `gemini-2.5-pro`, 별도 서버/CLI adapter. SDK 추가 없음.
- 키: 기존 `GEMINI_API_KEY`, 모델: 필수 `ASSESSMENT_EXTRACTION_MODEL`. 키 값은 로그/클라이언트/commit에 넣지 않는다.
- 모델 metadata에서 generateContent 지원 확인. 기존 앱 설명 prompt와 benchmark 추출 prompt는 분리한다.
- prompt: `assessment-rule-extraction-v2`. v1 상수는 보존. v2는 단위·범위·원문 인용·예외·검토 메모 처리와 compact structured output 계약을 추가한다.
- Samdo 원문 SHA: `bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763` 한 건만 CLI에서 허용.
- dry-run 통과. 읽은 데이터: ingestion manifest, hash-verified source, ParsedDocument. 다른 PDF나 oracle 입력 없음.

## Two-pass 및 문맥

1. Pass 1: 172개 표의 ID/짧은 preview/heading과 표 밖 메모 블록을 색인으로 제공. 관련 ID만 선택한다.
2. Pass 2: COMMON / YOUTH / NEWLYWED / FIRST_TIME / EXCEPTIONS별 선택한 표와 전후 두 문단을 묶는다.
3. 기존 parser의 cell/merged span/block ID를 유지하면서 반복되는 locator 및 셀 text 중복을 줄인다. 표 원문은 자르지 않는다.
4. 24,000 characters를 넘는 원문 단위는 OVERSIZED_CONTEXT로 남긴다. 요청 전체 UTF-8 body 160KB 상한도 적용한다.
5. 공급유형별 후보를 merge하되 supply/stage/category/condition/score/requiredInputs가 같은 후보만 중복 처리하고 provenance를 합친다. 다른 숫자·조건을 묵시적으로 합치지 않는다.

동일 블록의 요청별 노출 횟수, 최대 반복 횟수와 반복 블록 개수를 validation artifact에 기록한다. 표 ID preview 선택 누락이나 큰 표 제외는 recall 저하 원인으로 별도 보고해야 한다.

## Structured output 및 검증

Gemini `responseMimeType=application/json`, `responseJsonSchema`를 사용한다. 모델은 evidence의 blockId/snippet을 출력하고 host가 원문 locator를 결정적으로 연결한다. 선택한 context 밖의 ID와 원문에 없는 인용은 거부한다. 상태와 공고·문서 identity는 host가 고정하며 모델이 승인/활성화를 생성할 수 없다.

최종 CandidateRulePackage는 기존 validator를 통과해야 한다. 규칙/충돌/미해결 항목별 거부 사유와 원 응답을 local artifact에 보존한다. JSON 오류, 잘린 출력, 권한 실패는 숨기지 않는다. schema/semantic 오류를 oracle로 수정하거나 자동 repair하지 않는다.

HTTP 429/503만 최대 한 번 재시도하며 전역 호출/비용 예산을 함께 소비한다. timeout은 이미 과금된 요청일 수 있어 자동 재시도하지 않는다. 무한 retry나 다른 모델 fallback 없음.

## 호출·비용 예산

| 항목 | 기본값 |
|---|---:|
| 모델 | gemini-2.5-pro |
| 최대 API attempts | 16 |
| 최대 출력 토큰/요청 | 16,000 |
| thinkingBudget | 2,048 |
| 요청 timeout | 180초 |
| 보수적 예상비용 상한 | US$4 |

Google 공식 [가격표](https://ai.google.dev/gemini-api/docs/pricing)의 200K 이하 요청 요금(입력 US$1.25/M, reasoning 포함 출력 US$10/M)을 계산 기준으로 설정했다. 다른 모델을 설정하면 가격도 명시해야 한다. 예약 비용은 request byte 상한과 maxOutputTokens로 계산하며 실패·미확인 호출도 예약을 돌려주지 않는다. 실제 청구금액은 provider billing과 다를 수 있다.

usageMetadata에서 input/output/thinking/total tokens, model, attempt, latency, status를 호출별 기록한다. usage가 없으면 0으로 만들지 않고 null로 남긴다. 실제 본문 전체나 키를 console에 출력하지 않는다.

## 측정 결과

| 지표 | 현재 결과 |
|---|---|
| semantic AI calls | 0 — 실행 차단 |
| input/output/thinking tokens | 미발생 |
| AI 추출 비용 | 미발생 |
| candidate / accepted / rejected | 미생성 |
| human oracle | 기존 75개, 이번 실행에서 아직 읽지 않음 |
| overall precision / recall | 미측정 |
| numeric / operator / score / stage accuracy | 미측정 |
| evidence grounding | 미측정 |
| hallucination / critical extraction errors | 미측정 — 0개라고 주장하지 않음 |
| conflict/unresolved recall | 미측정 |
| 청년 / 신혼 / 생애최초 개별 결과 | 미측정 |

## 평가 방법과 분모

`oracleEvaluation.ts`는 추출 모듈과 분리되어 있다. extraction-complete artifact가 생긴 뒤 별도 평가 프로세스에서만 oracle을 읽어야 한다. 기존 75개 rule을 수정하지 않고 각 rule의 비교 가능한 원자 조건을 평가용으로 정규화한다. 이것은 AI prompt 입력이 아니다.

의미 대응이 불명확한 rule 이름을 fuzzy match로 EXACT 처리하지 않는다. 사람이 scope/단위/복합조건을 확인한 alignment가 있어야 exact 비교가 가능하다. 평가용 alignment와 근거를 별도 artifact에 보존하며 후보 결과 자체는 수정하지 않는다.

- Rule recall: 모든 원자 조건이 정확히 일치한 oracle rule 수 / 전체 oracle rule 수.
- Semantic correspondence precision: scope를 확인한 oracle 대응 candidate 수 / 전체 candidate 수. **정답률과는 구별**한다.
- Numeric/operator/score/stage/evidence accuracy: 검토된 매핑에서 해당 속성을 비교할 수 있는 조건을 분모로 한다. mapped/total oracle atoms도 함께 보고하여 작은 분모를 숨기지 않는다.
- Source-supported extra는 oracle에 없더라도 hallucination으로 계산하지 않는다. 원문 근거 없음이 검토된 extra만 hallucination. 미검토 extras 수를 별도로 제공한다.
- Conflict recall: 발견했다고 근거를 연결한 항목 / 평가 대상 전체. 미검토 항목도 분모에 포함한다.
- HIGH confidence 후보와 unresolved가 같은 source block을 인용하면 false-confidence 검토 대상으로 표시한다. 이 자동 표시는 확정 오류 판정이 아니다.

분류: EXACT_MATCH / PARTIAL_MATCH / WRONG_VALUE / WRONG_OPERATOR / WRONG_STAGE / WRONG_SCORE / EVIDENCE_MISMATCH / EXTRA_RULE / MISSING_RULE / NEEDS_HUMAN_REVIEW. 숫자·연산자·점수·stage 오류와 검증된 critical hallucination은 CRITICAL_EXTRACTION_ERROR로 기록한다.

## 실행 승인 후 이어갈 절차

```powershell
$env:ASSESSMENT_EXTRACTION_MODEL = 'gemini-2.5-pro'
npm run benchmark:samdo -- --run samdo-ai-v1 --dry-run
# Google 전송 승인 후에만 실제 실행
npm run benchmark:samdo -- --run samdo-ai-v1
```

run directory가 이미 있으면 재사용/덮어쓰기하지 않는다. 실패한 run은 보존하고 새 run ID를 명시한다. artifacts는 `.ingestion/announcements/{samdoId}/extraction/{runId}/`에만 저장되며 commit/배포에서 제외한다.

생성 예정: input-provenance, run-config, pass1-raw, selected-contexts, batch raw outputs, progress, samdo-ai-candidate-v1, samdo-ai-validation-v1, samdo-token-usage-v1, extraction-complete. Oracle comparison은 추출 완료 뒤 생성해야 하므로 현재 만들지 않았다.

그 뒤 기존 oracle/spec을 평가용으로 읽고 청년·신혼·생애최초 중요 규칙과 conflict checklist를 정렬한다. 정확도는 실제 수치로 이 문서를 갱신한다. 실패 원인은 parser / selection / table / prompt / model / schema / validator로 분류하며 oracle을 이용해 후보를 수정하지 않는다.

## Acceptance와 다음 Phase

현재는 실제 측정 전이므로 semantic extraction 신뢰도를 판단할 수 없다. 자동 import/approve/activate는 어떤 측정 결과에서도 이 단계의 범위가 아니다. critical 숫자/연산자 오류, critical hallucination, 충돌의 잘못된 확정이 하나라도 있으면 먼저 prompt/context 문제를 분석한다. Fine-tuning, 무인 대량 extraction, DB handoff로 넘어갈 근거는 아직 없다.

## 코드 검증

- `npm run typecheck`: 통과.
- `npm run test:semantic`: 25개 통과. structured output mapping, HTTP retry, JSON/schema 오류, timeout, budget, token accounting, merge/duplicate, two-pass artifact, source scope, oracle 분류/분모, 숫자/연산자/stage/score/evidence 오류, hallucination/conflict 검증.
- 기존 extraction 33개, Python parser 14개, ingestion 33개, assessment 138개 통과.
- `npm test`: 전체 회귀 통과. 실제 Gemini 호출은 테스트에 포함되지 않는다.
- `npx expo export --platform web`: 통과.
- `git diff --check`: 통과.
- 원격 Supabase write, import/review/approve/activate, human-verified Samdo rule 변경 없음.
