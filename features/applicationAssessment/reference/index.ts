/**
 * LEGACY / REFERENCE_ONLY registry. Runtime code asks this registry for the
 * explicitly selectable reference sample instead of importing one
 * announcement by name. It is never a fallback for a real listing.
 */
import type { AnnouncementRules } from '../types.ts';
import { REFERENCE_LISTING_ID, samdoReferenceRules } from './samdoReferenceRules.ts';

export { REFERENCE_LISTING_ID };
export const REFERENCE_RULE_SET: AnnouncementRules = samdoReferenceRules;
