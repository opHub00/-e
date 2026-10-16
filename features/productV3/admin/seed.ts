import type { NoticePlatform } from '../../noticePlatform/platform.ts';
import type { AdminOperationSnapshot } from './types.ts';

export function buildProductV3AdminSeed(platform: NoticePlatform): AdminOperationSnapshot {
  const notices = platform.getActiveNotices();
  const rulePackages = notices.map(notice => platform.rulePackage(notice.id));
  return { notices, rulePackages, ragVersions: Object.fromEntries(notices.map(notice => [notice.id, platform.ragSource(notice.id).version])), audits: [], ai: [], assessments: [] };
}
