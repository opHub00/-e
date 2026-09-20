import { SAMDO_REVIEW_SEED } from '../fixtures/samdoReviewSeed.generated.ts';
import type { RuleReviewWorkspaceSeed } from './types.ts';

/** Test-only defensive copy. No runtime filesystem access. */
export function samdoReviewSeed(): RuleReviewWorkspaceSeed { return structuredClone(SAMDO_REVIEW_SEED); }
