# Claude integration note — Product V3

## Imports for presentation work

Use these contracts; do not import database rows or Samdo evaluator internals:

```ts
import type {
  Assessment,
  Notice,
  NoticePresentation,
} from '../features/noticePlatform/index.ts';

import {
  assessNotice,
  assessNotices,
  compareAssessmentResults,
  getActiveNotices,
  getNoticePresentation,
  retrieveNoticeEvidence,
} from '../features/eventKiosk/noticePlatform/index.ts';

import type {
  AdminDashboardViewModel,
  NoticeAdminViewModel,
  RulePackageReviewViewModel,
  AiMonitoringViewModel,
  AssessmentMonitoringViewModel,
} from '../features/productV3/admin/index.ts';

import {
  getNextBestQuestion,
  planCopilotAction,
  runCopilotTurn,
  runCopilotSimulation,
} from '../features/productV3/copilot/index.ts';

import type {
  CopilotMessage,
  NextBestQuestion,
  CopilotPlan,
  NoticeComparisonViewModel,
} from '../features/productV3/copilot/index.ts';
```

## UI rules

- Never display `NextBestQuestion.expectedInformationGain`; use `priority`, `question`, and `reason`.
- Persist neither simulation overrides nor `simulatedResult`. “원래 조건으로 돌아가기” discards the local simulation object.
- `DOES_NOT_KNOW` is a valid user decision. Keep it as “확인 필요” and request the next question; do not ask the same `factId` again.
- Attach the asked `factId` to the assistant `CopilotMessage`. Attach `factDisposition` when the user answers, chooses “잘 모르겠어요”, or skips.
- Use `NoticeComparisonViewModel.disclaimer` with every comparison. Never turn supply count into a probability claim.
- The generic context intentionally has no raw profile fields. Do not reconstruct or add them in UI code.

## Suggested Copilot call sequence

1. Build/retain one `NoticeAssessmentInput` and its `answerStates`.
2. Call `runCopilotTurn(platform, { profile, noticeIds, conversation, question })`.
3. Render `nextQuestion` for `RUN_ASSESSMENT`/`ASK_FOLLOWUP`.
4. Render `comparison` for `COMPARE_NOTICES`.
5. Send only `promptContext` to an explanation provider.
6. A server policy must approve any proposed plan; the browser must not execute LLM-authored actions directly.

## Admin wiring

- Views consume only the five `*ViewModel` contracts above.
- `AdminOperationService` mutations are for local/preview staging. Production runtime fails closed.
- Existing rule-review services remain authoritative for human review and activation.
- For event chat telemetry, pass a server-only monitor callback:

```ts
monitor: record => telemetrySink.recordAi(record)
```

Do not put service-role credentials in browser code.

## Files Claude should avoid changing

- `features/noticePlatform/**`
- `features/eventKiosk/noticePlatform/**`
- `features/productV3/admin/**`
- `features/productV3/copilot/**`
- `features/eventKiosk/samdoDual/evaluate.ts`
- `features/eventKiosk/server/eventChat.ts`
- `supabase/migrations/20261016054748_product_v3_operations.sql`

Presentation work can add adapters alongside these modules without changing their semantics.
