import type { Assessment, ComparisonResult, NoticeAdapter, NoticeAssessmentInput, NoticeId, NoticePresentation, RAGSource } from './types.ts';

const eligibilityWeight = { ELIGIBLE: 5, EVIDENCE_REQUIRED: 4, CONDITIONAL: 3, UNAVAILABLE: 1, INELIGIBLE: 0 } as const;
const stageWeight: Record<string, number> = { PRIORITY: 7, NEWBORN_PRIORITY: 7, FIRST_RANK_PRIORITY: 6, GENERAL: 5, LOTTERY: 4, SECOND_RANK: 3, INFORMATION_ONLY: 0 };

const focus = (result: Assessment) => result.recommendation.recommended ?? result.evaluations.find(item => item.autoRecommend) ?? null;
const score = (result: Assessment) => {
  const value = focus(result)?.officialScore;
  return value?.status === 'AVAILABLE' ? value.total : -1;
};
const gaps = (result: Assessment) => result.unresolvedFacts.length;

export class NoticePlatform {
  readonly #registry: Map<NoticeId, NoticeAdapter>;
  constructor(adapters: readonly NoticeAdapter[]) {
    this.#registry = new Map();
    for (const adapter of adapters) {
      if (this.#registry.has(adapter.notice.id)) throw new Error(`DUPLICATE_NOTICE_ID:${adapter.notice.id}`);
      if (adapter.rulePackage.noticeId !== adapter.notice.id || adapter.ragSource.noticeId !== adapter.notice.id) throw new Error(`NOTICE_ADAPTER_CROSS_CONTAMINATION:${adapter.notice.id}`);
      if (adapter.binding.noticeId !== adapter.notice.id || adapter.binding.rulePackageId !== adapter.rulePackage.id ||
        adapter.binding.sourceHash !== adapter.rulePackage.sourceHash) throw new Error(`NOTICE_BINDING_MISMATCH:${adapter.notice.id}`);
      this.#registry.set(adapter.notice.id, adapter);
    }
    const activeFamilies = new Set<string>();
    for (const adapter of this.#registry.values()) {
      if (this.#publicBlockReason(adapter) !== null) continue;
      const family = adapter.notice.managementNumber || adapter.notice.listing.id;
      if (activeFamilies.has(family)) throw new Error(`ACTIVE_VERSION_COLLISION:${family}`);
      activeFamilies.add(family);
    }
  }

  getActiveNotices() { return [...this.#registry.values()].filter(value => this.#publicBlockReason(value) === null).map(value => structuredClone(value.notice)); }

  getNoticePresentation(noticeId: NoticeId): NoticePresentation {
    const adapter = this.#publicAdapter(noticeId), notice = adapter.notice;
    return { id: notice.id, title: notice.title, managementNumber: notice.managementNumber, region: notice.listing.region, address: notice.listing.address,
      noticeDate: notice.noticeDate, status: notice.status, supplyTypes: structuredClone(notice.supplyTypes), source: structuredClone(notice.sourceDocument) };
  }

  assessNotice(profile: NoticeAssessmentInput, noticeId: NoticeId): Assessment {
    const assessment = this.#publicAdapter(noticeId).assess(profile);
    if (assessment.noticeId !== noticeId) throw new Error(`ASSESSMENT_NOTICE_MISMATCH:${noticeId}`);
    return structuredClone(assessment);
  }

  assessNotices(profile: NoticeAssessmentInput, noticeIds: readonly NoticeId[]): Assessment[] {
    return [...new Set(noticeIds)].map(id => this.assessNotice(profile, id));
  }

  compareAssessmentResults(results: readonly Assessment[]): ComparisonResult {
    for (const result of results) {
      const adapter = this.#publicAdapter(result.noticeId);
      if (result.rulePackageId !== adapter.rulePackage.id || result.rulePackageVersion !== adapter.rulePackage.version)
        throw new Error(`ASSESSMENT_PACKAGE_MISMATCH:${result.noticeId}`);
    }
    const ranked = [...results].sort((a, b) => this.#compare(a, b) || a.noticeId.localeCompare(b.noticeId));
    if (!ranked.length || ranked.every(result => !focus(result))) return { orderedNoticeIds: ranked.map(item => item.noticeId), preferredNoticeId: null, basis: 'NO_RECOMMENDATION', reasons: ['비교할 추천 결과가 없어요.'], disclaimer: this.#disclaimer() };
    const first = ranked[0], second = ranked[1];
    if (!second) return { orderedNoticeIds: [first.noticeId], preferredNoticeId: first.noticeId, basis: 'ELIGIBILITY', reasons: ['평가된 공고가 한 건이에요.'], disclaimer: this.#disclaimer() };
    const basis = this.#basis(first, second);
    return { orderedNoticeIds: ranked.map(item => item.noticeId), preferredNoticeId: basis === 'EQUIVALENT' ? null : first.noticeId, basis,
      reasons: basis === 'EQUIVALENT' ? ['현재 입력에서 공고 간 판정 우선순위가 같아요.'] : [`${first.noticeId}가 ${basis} 기준에서 먼저 정렬됐어요.`], disclaimer: this.#disclaimer() };
  }

  retrieveNoticeEvidence(noticeId: NoticeId, query: string, maxChunks = 6): RAGSource['chunks'] {
    const source = this.#publicAdapter(noticeId).ragSource;
    const normalized = query.toLowerCase();
    const expanded = [
      ...(/서류|증빙|준비/.test(normalized) ? ['서류', '제출', '등본', '초본', '증빙'] : []),
      ...(/일정|언제|접수|발표/.test(normalized) ? ['일정', '접수', '발표'] : []),
      ...(/가격|분양가/.test(normalized) ? ['가격', '분양가격', '공급금액'] : []),
      ...(/임대료|토지임대/.test(normalized) ? ['토지임대료', '월임대료'] : []),
      ...(/자격|가능|조건/.test(normalized) ? ['자격', '신청자격', '조건'] : []),
    ];
    const terms = [...normalized.split(/\s+/), ...expanded].map(value => value.replace(/[^0-9a-z가-힣㎡]/g, '')).filter(value => value.length >= 2);
    return source.chunks.map(chunk => ({ chunk, score: terms.reduce((sum, term) => sum + (`${chunk.section} ${chunk.textExcerpt}`.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter(value => value.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0, maxChunks).map(value => structuredClone(value.chunk));
  }

  rulePackage(noticeId: NoticeId) { return structuredClone(this.#publicAdapter(noticeId).rulePackage); }
  ragSource(noticeId: NoticeId) { return structuredClone(this.#publicAdapter(noticeId).ragSource); }
  #adapter(id: NoticeId) { const value = this.#registry.get(id); if (!value) throw new Error(`NOTICE_NOT_FOUND:${id}`); return value; }
  #publicAdapter(id: NoticeId) {
    const adapter = this.#adapter(id), reason = this.#publicBlockReason(adapter);
    if (reason) throw new Error(`${reason}:${id}`);
    return adapter;
  }
  #publicBlockReason(adapter: NoticeAdapter): string | null {
    if (adapter.lifecycle.sourceVerificationState !== 'SOURCE_VERIFIED' || adapter.rulePackage.sourceStatus === 'REFERENCE' ||
      adapter.rulePackage.sourceHash !== adapter.notice.sourceDocument.sha256 ||
      adapter.rulePackage.rules.some(rule => !rule.evidence.id || !rule.evidence.locator)) return 'SOURCE_NOT_VERIFIED';
    if (adapter.reviewBlockers.length || adapter.rulePackage.validationErrors.length || adapter.lifecycle.reviewStatus === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
    if (adapter.lifecycle.reviewStatus !== 'APPROVED' || !['APPROVED', 'ACTIVE'].includes(adapter.rulePackage.status)) return 'RULE_PACKAGE_NOT_APPROVED';
    if (adapter.notice.status !== 'ACTIVE' || adapter.lifecycle.publicationStatus !== 'ACTIVE' ||
      adapter.binding.status !== 'ACTIVE' || !adapter.notice.activatedAt) return 'NOT_ACTIVE';
    return null;
  }
  #disclaimer() { return '이 비교는 자격·공급단계·공식 점수·확인 필요 항목·공급 세대수만 정렬하며, 경쟁률이나 당첨확률을 추정하지 않아요.'; }
  #compare(a: Assessment, b: Assessment) {
    const x = focus(a), y = focus(b);
    const values: Array<[number, number]> = [
      [x ? eligibilityWeight[x.eligibility] : -1, y ? eligibilityWeight[y.eligibility] : -1],
      [x ? stageWeight[x.priorityStage ?? 'INFORMATION_ONLY'] ?? 0 : -1, y ? stageWeight[y.priorityStage ?? 'INFORMATION_ONLY'] ?? 0 : -1],
      [score(a), score(b)], [-gaps(a), -gaps(b)], [x?.supplyCount ?? -1, y?.supplyCount ?? -1],
    ];
    for (const [left, right] of values) if (left !== right) return right - left;
    return 0;
  }
  #basis(a: Assessment, b: Assessment): ComparisonResult['basis'] {
    const x = focus(a), y = focus(b);
    if ((x ? eligibilityWeight[x.eligibility] : -1) !== (y ? eligibilityWeight[y.eligibility] : -1)) return 'ELIGIBILITY';
    if ((x ? stageWeight[x.priorityStage ?? 'INFORMATION_ONLY'] ?? 0 : -1) !== (y ? stageWeight[y.priorityStage ?? 'INFORMATION_ONLY'] ?? 0 : -1)) return 'PRIORITY_STAGE';
    if (score(a) !== score(b)) return 'OFFICIAL_SCORE';
    if (gaps(a) !== gaps(b)) return 'EVIDENCE_COMPLETENESS';
    if ((x?.supplyCount ?? -1) !== (y?.supplyCount ?? -1)) return 'SUPPLY_COUNT';
    return 'EQUIVALENT';
  }
}
