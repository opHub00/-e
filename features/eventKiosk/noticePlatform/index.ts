import { NoticePlatform } from '../../noticePlatform/platform.ts';
import type { Assessment, NoticeAssessmentInput, NoticeId } from '../../noticePlatform/types.ts';
import { SAMDO_NOTICE_ADAPTERS } from './samdoAdapter.ts';

export { createSamdoNoticeAdapter, SAMDO_NOTICE_ADAPTERS } from './samdoAdapter.ts';
export const noticePlatform = new NoticePlatform(SAMDO_NOTICE_ADAPTERS);
export const assessNotice = (profile: NoticeAssessmentInput, noticeId: NoticeId) => noticePlatform.assessNotice(profile, noticeId);
export const assessNotices = (profile: NoticeAssessmentInput, noticeIds: readonly NoticeId[]) => noticePlatform.assessNotices(profile, noticeIds);
export const compareAssessmentResults = (results: readonly Assessment[]) => noticePlatform.compareAssessmentResults(results);
export const retrieveNoticeEvidence = (noticeId: NoticeId, query: string) => noticePlatform.retrieveNoticeEvidence(noticeId, query);
export const getNoticePresentation = (noticeId: NoticeId) => noticePlatform.getNoticePresentation(noticeId);
export const getActiveNotices = () => noticePlatform.getActiveNotices();
