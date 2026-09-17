# 공고 원문 파싱 · 후보 규칙 계약

## 범위와 시작 상태

시작: `feature/announcement-ingestion`, `51ea6a7`, clean. 작업: `feature/rule-extraction`.
이 단계는 로컬 parser + candidate contract + validator + Mock extractor다. 실제 semantic AI extractor, 관리자 UI, DB write, 승인/활성화는 없다. 기존 75개 Samdo `DRAFT_SOURCE_VERIFIED` 규칙과 evaluator/UI는 변경하지 않는다.

```text
Ingestion manifest + SHA-256 blob
  → hash/size/format check
  → bounded Python parser worker
  → ParsedDocument + quality report
  → section/table index + complete context chunks + literal observations
  → RuleExtractor (이번 단계: Mock)
  → candidate schema + evidence grounding validator
  → REFERENCE / REVIEW_REQUIRED local artifacts
  → [향후] human review → explicit domain conversion → existing import lifecycle
```

## 1. Parser adapters

`features/ruleExtraction/server/parser.ts`의 `DocumentParser` 구현은 PDF/HWP/HWPX MIME별로 선택한다. Node가 clean environment, shell 없는 subprocess, 180초 timeout, 최대 output 64MB를 적용한다. Python worker가 실제 SHA-256을 다시 계산한다. 문서의 매크로·스크립트·링크를 실행하지 않는다.

Python 의존성은 앱 번들에 넣지 않는다. 개발/서버 전용 Python 환경에 `scripts/document-parser-requirements.txt`를 설치한다. `DOCUMENT_PARSER_PYTHON` 또는 CLI `--python`으로 지정한다. 기존 `.cache/hwp-parser`의 olefile도 호환한다. 일반 `npm test`는 Python/실데이터 없이 contract/repository 테스트를 실행하고, `npm run test:parsers`는 별도 Python 환경을 요구한다.

| 포맷 | 구현 | 한계 |
|---|---|---|
| PDF | pypdf 암호화 검사 + pdfplumber text lines / table grid | OCR 없음, reading order와 병합 셀 격자는 추정 복원 |
| HWP5 | olefile + bounded raw-deflate + record parser | modern HWP5 cell header 지원, 페이지 추정 금지, 배포용/암호화 차단 |
| HWPX | bounded ZIP + XML section/paragraph/cell traversal | UTF-8/UTF-16 BOM 지원, 페이지 추정 금지, 실 공고 샘플 QA는 아직 없음 |

HWP 구조 참고: [한컴 HWP 5.0 revision 1.2 공개 명세](https://cdn.hancom.com/link/docs/한글문서파일형식_5.0_revision1.2.pdf). 실제 Samdo의 8-byte list header와 cell address를 직접 대조했다. 호환되지 않는 셀 주소는 추정해서 복원하지 않는다.

## 2. ParsedDocument와 evidence locator

`parsedDocument.ts`는 schemaVersion, content-addressed documentId (`sha256:…`), SHA, MIME, parserVersion, status, pages, blocks, tables, metadata, quality를 검증한다.

- block: 안정적인 순서 ID, type, text, sectionPath, sourceLocator. sectionPath는 제목 패턴 기반 **보조 힌트**이며 법적 섹션 분류가 아니다.
- PDF locator: 1-based 실제 PDF 페이지 + bbox. 문서 안에 인쇄된 페이지와 PDF 페이지가 다를 수 있다.
- HWP locator: BodyText stream + record byte offset/level + zero-based paragraph index. pageNumber=null.
- HWPX locator: section XML + zero-based traversal path + paragraph index. XPath 실행식이 아닌 자체 경로 표현이다. pageNumber=null.
- 표 셀: tableId + zero-based row/column, origin cell의 rowSpan/columnSpan, text, blockIds, locator.
- HWP memo ID, memo anchor와 본문 precedingBlockId를 보존한다. 메모를 최종 규칙으로 채택하지 않는다.

원문 text의 비교 연산자, `%`, 숫자, 괄호와 단위를 지우거나 반올림하지 않는다. 공백 정규화는 evidence substring 비교에만 쓴다.

## 3. 표와 fidelity

표는 plain text로만 저장하지 않고 rows/cells를 보존한다. 병합 셀의 origin/span을 보존하며 빈 행/영역을 임의 값으로 채우지 않는다.

- HWP/HWPX: `STRUCTURAL`, 원문 주소와 span. 병합 시 `MERGED_CELLS_PRESERVED` 경고.
- PDF: `GEOMETRY_INFERRED`, source bbox, 각 셀의 text. 격자 기반 span은 의미상 셀 병합을 확정하지 않는다. `PDF_TABLE_GRID_REQUIRES_REVIEW`.
- caption은 확실한 별도 연결이 없으므로 null. 인접 `<표7>` 문단은 context로 유지한다. 헤더 의미 자동 확정 없음.
- 표 개수는 서식용 표를 포함한다. 172개 표를 172개 규칙표로 해석하면 안 된다.

## 4. Quality gate와 보안

상태: PARSED / PARTIAL / UNREADABLE / UNSUPPORTED. PARTIAL은 읽을 수 있지만 layout/메모/페이지 한계가 있다는 뜻이다. 검수용 후보 입력만 허용하며 사용자 판정에 사용하지 않는다.

차단: HTML/error content, magic signature 불일치, hash mismatch, 암호화 PDF, 배포용/암호화 HWP, parser exception, 본문 100자 미만, replacement character 비율 1% 초과, 다량 `(cid:…)`, XML DTD/entity, ZIP path traversal/duplicate entry/expansion limit.

한도: 입력 50MB, PDF 150페이지, expanded data 128MB, blocks 50,000, text 8M characters, table grid 20,000 cells, ZIP entries 3,000. UTF-16 XML로 DTD 검사를 우회하지 못하도록 decoded text를 검사한다. PDF Content-Type가 HTML/JSON이면 signature 전에 ingestion download 단계에서 거부한다. 잘못된 확장자는 포맷 근거로 쓰지 않는다.

**OS sandbox나 malware scanner는 아니다.** 문서 라이브러리의 취약점과 hard RSS cap은 이 구현만으로 격리되지 않는다. 자동 수집 파일의 무인 대량 처리는 network-disabled container, read-only source mount, memory/CPU/process 제한을 갖춘 worker에 배치한 뒤 진행한다. 로컬 파일 경로와 parser cache는 trusted operator 소유다. 비밀키는 subprocess 환경에서 제외하고 오류에는 안전한 code만 출력한다.

## 5. Extraction contract

실행 가능한 계약은 `candidate.ts`의 타입과 `validateCandidatePackage`다.

```text
CandidateRulePackage
  schemaVersion=1, promptVersion=assessment-rule-extraction-v1
  sourceStatus=REFERENCE, reviewStatus=REVIEW_REQUIRED
  announcement(canonicalId,title,announcementDate)
  document(documentId,sha256,parserVersion)
  candidateRules[], unresolvedItems[], conflicts[], extractionWarnings[]

CandidateRule
  candidateRuleId, supplyType, stage, category, ruleKey
  condition(input,operator,value,values)
  score,maxScore,requiredInputs[],evidence[]
  confidence,confidenceReason,reviewStatus=REVIEW_REQUIRED
```

지원 category: eligibility, age, maritalStatus, housingOwnership, region, residenceDuration, subscriptionAccount, paymentCount, savingsAmount, incomeThreshold, assetThreshold, stage, score, lottery, supplyPercentage, exception.

지원 supply: YOUTH/NEWLYWED/FIRST_TIME/NEWBORN/GENERAL/INSTITUTIONAL. stage: COMMON/PRIORITY/GENERAL/LOTTERY. 비교: eq/neq/gt/gte/lt/lte/in/exists. 원문 `미만`을 기존 engine의 `이하`로 바꾸는 자동 변환은 없다. 복합조건·단위·가구원수 맥락의 engine 변환은 향후 명시적 review 작업이다.

### confidence

- HIGH: 단일 원문에 직접 근거 있음.
- MEDIUM: 복수 블록을 조합해야 함.
- LOW: 표 구조나 문맥 해석이 불명확함.

진실 확률이나 승인 점수가 아니다. confidenceReason을 함께 보존한다. HIGH도 자동 승인하지 않는다.

### unresolved / conflict

CONFLICTING_VALUES, MISSING_CONTEXT, UNCLEAR_TABLE_STRUCTURE, DRAFT_NOTE, REVIEW_MEMO, UNSUPPORTED_EXCEPTION, AMBIGUOUS_REGION_MAPPING, AMBIGUOUS_HOUSING_MANAGEMENT_NUMBER, AMBIGUOUS_THRESHOLD, OVERSIZED_CONTEXT를 표현한다.

충돌은 두 개 이상 alternatives와 각각 evidence를 가지며 resolution=null / requiresReview=true만 허용한다. Samdo 지역기준일, 관리번호 매핑, 1인 가구 검토 메모는 이 구조로 표현할 수 있다. **Mock가 이들의 의미를 자동 분석했다고 주장하지 않는다.** 현재는 실제 review memo와 anchor를 unresolved로 노출한다.

## 6. Grounding validator

- 정확한 schema/enum, finite numeric threshold, required input, score 범위 검사.
- evidence 없는 규칙, 중복 rule key/ID, 알 수 없는 block/table/cell/document, 원문과 달라진 locator 거부.
- source snippet이 실제 해당 block/cell에 존재하는지 공백 정규화 후 검사.
- 원문 `130% 이하`를 `130% 미만` 인용으로 바꾸면 거부.
- FIRST_TIME 또는 LOTTERY 단계의 점수 생성 거부.
- approved/isActive 같은 추가 필드, DRAFT_SOURCE_VERIFIED/OFFICIAL_VERIFIED 승격 거부.

**문자열 grounding은 의미 검증이 아니다.** 실제 snippet을 인용하면서 condition을 잘못 해석하는 후보는 여전히 가능하다. threshold/operator/scope/unit/table heading은 사람이 확인해야 한다. validator 통과를 approval로 쓰면 안 된다.

## 7. Prompt, two-pass, token strategy

`EXTRACTION_PROMPT` 버전은 `assessment-rule-extraction-v1`. 추정 금지, 문서 내 prompt injection 무시, 원문 evidence 필수, 경계 연산자 유지, 충돌 자동 해결 금지, 무가점 제도 점수 금지를 명시한다.

Pass 1 입력용 heading/table index를 생성하고, 향후 semantic provider가 관련 source IDs를 선택한다. Pass 2는 선택한 complete context chunk만 사용한다. 현재는 network/LLM provider가 없다.

기본 chunk budget 12,000 characters. 표와 그 내부 문단 + 앞뒤 2개 block은 한 context로 유지한다. 경계 context 중복만 허용하고 문서 전체를 매번 보내지 않는다. 큰 표를 자르지 않고 oversized로 표시한다. oversized chunk는 향후 요청 builder가 제외/수동 분할해야 한다. 표가 여러 페이지에 걸치거나 각주가 멀리 있으면 추가 context 검수가 필요하다.

estimatedTokenUpperBound는 UTF-8 byte count라는 보수적 상한이지 특정 모델 tokenizer나 과금 수치가 아니다. 실제 LLM tokens/cost: 이번 작업 0/0. 문서 전체 single request, 배치 유료 추출, 사용자 판정 때 원문 재전송은 구현하지 않는다.

## 8. Deterministic observations와 provider

extractObservations는 날짜/퍼센트/금액/관리번호/전화/경계 단어의 literal과 block character offset만 반환한다. 이 단계는 `130%`의 뜻을 신혼 일반공급 상한이라고 판단하지 않는다.

RuleExtractor는 provider 독립 인터페이스다. MockRuleExtractor는 실 문서에 candidateRules=[]를 반환하며 NO_SEMANTIC_EXTRACTION과 MISSING_CONTEXT를 명시한다. 기존 Samdo 75개 규칙을 extractor에 입력하지 않는다.

compareWithOracle는 **추출 후** 사람이 ruleKey를 대응시킨 oracle을 받아 matched/mismatched/missing/extra를 계산한다. 지금 구현은 condition/score exact comparison이며 evidence semantic mismatch, operator/threshold별 세분 지표와 실제 Samdo accuracy는 아직 측정하지 않았다. mock의 빈 결과로 정확도 0%를 주장하지 않는다.

## 9. CLI와 artifacts

```powershell
$env:DOCUMENT_PARSER_PYTHON = '<parser venv python path>'
npm run parse:announcement -- --id <canonical-id> --dry-run
npm run parse:announcement -- --id <canonical-id>
npm run extract:announcement -- --id <canonical-id>
npm run test:parsers
node --experimental-strip-types scripts/audit-extraction-samples.mjs
```

--work-dir 기본 .ingestion. 단일 공고, 최대 5개 문서. dry-run은 state/manifest/hash 검사만 수행하고 parser/artifact/lock 쓰기 없음. FAILED ingestion은 DOCUMENT_NOT_READY로 차단한다. parser timeout/unavailable은 fallback 없이 실패한다.

```text
.ingestion/announcements/{id}/
  parsed/{sha}/document-parser-v1/document.json
  parsed/{sha}/document-parser-v1/quality-report.json
  extraction/{manifestVersion}/{sha}/assessment-rule-extraction-v1/
    plan.json
    observations.json
    candidate-rules.json  # --extract에서만, Mock
```

기존 ingestion lock과 immutable-write convention 재사용. 동일 버전 파일이 다르면 overwrite하지 않는다. parser/prompt/config 변경 시 버전을 올린다. 대형 원문, 후보, 이미지, parse cache는 .ingestion/.cache에만 저장하며 gitignore/Vercelignore를 유지한다. 앱 runtime에는 import하지 않는다.

## 10. 실데이터 검증 결과

| 문서 | 페이지 | blocks | tables | 상태 | chunks / oversized |
|---|---:|---:|---:|---|---:|
| Samdo VER1.7 HWP | null | 4,115 | 172 | PARTIAL | 173 / 36 |
| 더샵 트리센트 PDF | 13 | 465 | 25 | PARTIAL | 46 / 1 |
| 힐스테이트 고덕엘리스트 A65BL PDF | 93 | 3,514 | 110 | PARTIAL | 221 / 22 |

세 문서 모두 replacement character 0. CLI manifest → parser → quality → plan → validated mock candidate artifact까지 실행했다.

Samdo는 기존 `.cache/samdo-hwp.json`의 모든 paragraph text/order/stream/offset과 일치한다. 2,669,354 / 3,813,363 / 5,338,708 / 7,533,763원, 276 / 1,034 / 362백만원, 표7/표10 제목을 보존했다. 소득금액은 표 셀에서도 확인했다. 18개 note 및 본문 memo anchor를 보존한다. 문서 의미/규칙은 새로 승인하지 않는다.

PDF visual spot check: 더샵 PDF 페이지 1–2 제목, 무순위 공고일 2026.09.10, 부산·울산·경남 거주 무주택세대구성원 안내와 일정 표. 힐스테이트 PDF 페이지 1·3 제목, 공고일 2026.09.11, 지역거주 기준/일정 표. 렌더링 원문과 parse text/cells를 대조했다. 페이지 전체 의미 정확도를 보증하는 검수는 아니다.

더 리치먼드 미아(3차)는 기존 ingestion FAILED로 유지, 문서가 없어 parser에 전달하지 않았다. HTML signature/Content-Type 차단을 synthetic 회귀로 검증했다. HWPX는 synthetic 한글/병합 셀/DTD/ZIP fixture 검증이며 실제 HWPX 공고 검증은 미완료다.

## 11. 검수 → 기존 import lifecycle handoff

Candidate JSON은 기존 import package가 아니다. DB importer로 직행하지 않는다. 향후 review record에 parsed SHA/parserVersion/promptVersion/candidate hash/reviewer를 묶고 다음을 수행한다.

1. 원문·표·각주·메모를 보며 threshold/operator/unit/scope/evidence 확인.
2. conflicts/unresolved를 명시적으로 해결하거나 지원 불가로 유지.
3. reviewed candidate를 engine-supported domain rule로 명시적 변환. unsupported semantics는 중단.
4. 기존 import schema validator → inactive/unapproved import → review → approve → activate.
5. 출처 검증상태는 사람의 실제 검증 근거에 따라 지정. Samdo는 DRAFT_SOURCE_VERIFIED 상한이며 공식 최종본 없이 OFFICIAL_VERIFIED 금지.

이번 단계에서 runtime rule registry, engine, Supabase data/schema/storage, 승인/활성화에는 어떤 쓰기도 하지 않았다.

## 12. 다음 단계

먼저 real HWPX 및 스캔 PDF의 지원 범위를 정하고 container worker isolation과 oversized table/context 편집을 보완한다. 이후 Samdo 한 건에 제한한 semantic extractor를 별도 승인된 budget으로 연결하고, 사람이 정렬한 75-rule oracle과 operator/threshold/score/evidence/conflict 지표를 측정한다. candidate 검수와 명시적 import 변환을 완성한 뒤에만 자동 수집 파이프라인과 연결한다.

## 검증 명령과 결과

- `npm run typecheck`: 통과.
- `npm run test:extraction`: 33 tests 통과. 후보 schema/grounding, 상태 승격 차단, 공고 바꿔치기, score, conflict, chunking, artifact, dry-run 무변경, hash 변경, parser unavailable 검증.
- `npm run test:parsers`: Python 14 tests 통과. 실제 PDF fixture parser, blank/encrypted/malformed/HTML, HWP control/merged table/memo/protection, HWPX Korean/merged cell/DTD/UTF-16 DTD/ZIP, hash/encoding 검증.
- `scripts/audit-extraction-samples.mjs`: 실제 세 문서 및 Samdo paragraph oracle 대조 통과. 로컬 샘플이 있어야 실행 가능.
- `npm test`: 기존 ingestion 33개, assessment 138개를 포함한 전체 회귀 통과. 최초 Deno cache 접근 권한 오류는 캐시 읽기 가능한 실행 환경에서 재실행하여 통과.
- `npx expo export --platform web`: 통과 (`dist`).
- `git diff --check`: 통과.

LLM 호출 없음, token/cost 0, Samdo semantic extraction accuracy 미측정. 수동 검수 없이 쓸 수 있는 새로운 runtime rule은 생성하지 않았다.
