import { evaluateFirstHomeEligibility } from '../eligibility/firstHome.ts';
import { buildNewlywedChecklist } from '../newlywed/domain.ts';
import {
  PROFILE_BUNDLES,
  getBundleCompletion,
  knownValue,
  type ApplicantProfileV2,
  type ProfileQuestionBundleId,
} from '../profile/domain.ts';

export type BenchmarkSource = 'official' | 'wanpane-reference' | 'profile';

export type BenchmarkDimensionStatus =
  | 'well-prepared'
  | 'checking'
  | 'information-needed'
  | 'listing-confirmation';

export type BenchmarkConfidence =
  | 'official-public-scope'
  | 'deterministic-rule'
  | 'profile-state';

export type BenchmarkDimension = {
  id: string;
  title: string;
  detail: string;
  status: BenchmarkDimensionStatus;
  source: BenchmarkSource;
  confidence: BenchmarkConfidence;
  bundleId?: ProfileQuestionBundleId;
};

export type BenchmarkAction = {
  id: string;
  label: string;
  bundleId?: ProfileQuestionBundleId;
  route?: '/eligibility/first-home' | '/newlywed';
};

export type BenchmarkLayer = {
  source: BenchmarkSource;
  summary: string;
  dimensions: BenchmarkDimension[];
  confidence: BenchmarkConfidence;
  missingData: string[];
  actions: BenchmarkAction[];
};

export type OfficialBenchmarkMetadata = {
  institution: '한국부동산원 청약Home';
  checkedAt: '2026-09-09';
  publishedAt: '2023-06-16';
  dataRange: '전체 가입현황 · 통장별 가입현황 · 가입기간별 가입현황';
  sourceUrl: 'https://www.data.go.kr/data/15114369/openapi.do';
  technicalDocumentUrl: 'https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=10251&bbsId=1268&nttSn=87460';
};

export type PeerBenchmarkResult = {
  summary: string;
  official: BenchmarkLayer;
  reference: BenchmarkLayer;
  comparison: BenchmarkLayer;
  officialMetadata: OfficialBenchmarkMetadata;
  isSparse: boolean;
  primaryAction: BenchmarkAction | null;
  disclaimer: string;
};

export const OFFICIAL_BENCHMARK_METADATA: OfficialBenchmarkMetadata = {
  institution: '한국부동산원 청약Home',
  checkedAt: '2026-09-09',
  publishedAt: '2023-06-16',
  dataRange: '전체 가입현황 · 통장별 가입현황 · 가입기간별 가입현황',
  sourceUrl: 'https://www.data.go.kr/data/15114369/openapi.do',
  technicalDocumentUrl: 'https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=10251&bbsId=1268&nttSn=87460',
};

export const BENCHMARK_DISCLAIMER =
  '이 비교는 당첨 확률이나 자격 판정이 아니에요. 미입력 정보는 부족한 준비로 계산하지 않고, 실제 신청 조건은 공고문에서 확인해야 해요.';

const BUNDLE_PRIORITY: readonly ProfileQuestionBundleId[] = [
  'SUBSCRIPTION_ACCOUNT',
  'HOUSING_HISTORY',
  'INCOME',
  'ASSETS',
  'FAMILY',
  'PREFERENCES',
  'RESIDENCE',
  'HOUSEHOLD',
];

const REFERENCE_DIMENSIONS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'account', title: '청약통장' },
  { id: 'housing', title: '주택 이력' },
  { id: 'location', title: '거주·관심지역' },
  { id: 'family', title: '가족·혼인 정보' },
  { id: 'income', title: '소득 정보' },
  { id: 'assets', title: '자산 정보' },
  { id: 'first-home', title: '생애최초 준비' },
  { id: 'newlywed', title: '신혼 준비' },
];

export function buildPeerBenchmark(profile: ApplicantProfileV2): PeerBenchmarkResult {
  const comparisonDimensions = buildProfileDimensions(profile);
  const missingBundleIds = uniqueBundles(
    comparisonDimensions
      .filter((item) => item.status === 'information-needed' && item.bundleId)
      .map((item) => item.bundleId!),
  );
  const actions = missingBundleIds.map(bundleAction);
  const preparedCount = comparisonDimensions.filter((item) => item.status === 'well-prepared').length;
  const isSparse = preparedCount <= 1;
  const primaryAction = BUNDLE_PRIORITY
    .map((bundleId) => actions.find((action) => action.bundleId === bundleId))
    .find((action): action is BenchmarkAction => Boolean(action)) ?? null;

  return {
    summary: isSparse
      ? '비교할 정보가 아직 부족해요.'
      : '확인된 준비 정보와 더 채울 항목을 나눠 봤어요.',
    official: {
      source: 'official',
      summary: '공식 자료가 제공하는 범위만 안내해요.',
      confidence: 'official-public-scope',
      dimensions: [{
        id: 'subscription-statistics-scope',
        title: '청약통장 공식 통계',
        detail: '전체·통장별·가입기간별 가입현황이 공개돼요. 이 자료만으로 연령·지역·당첨자를 결합한 또래 평균은 만들 수 없어요.',
        status: 'checking',
        source: 'official',
        confidence: 'official-public-scope',
      }],
      missingData: ['연령·지역을 결합한 가입기간 분포', '당첨자 평균'],
      actions: [],
    },
    reference: {
      source: 'wanpane-reference',
      summary: '완판e는 다음 준비 정보가 확인됐는지를 봐요. 평균이나 순위가 아니에요.',
      confidence: 'deterministic-rule',
      dimensions: REFERENCE_DIMENSIONS.map(({ id, title }) => ({
        id,
        title,
        detail: '입력 여부와 기존 규칙 결과를 확인해요.',
        status: 'checking',
        source: 'wanpane-reference',
        confidence: 'deterministic-rule',
      })),
      missingData: [],
      actions: [],
    },
    comparison: {
      source: 'profile',
      summary: isSparse
        ? '미입력 정보를 낮은 점수로 보지 않았어요. 먼저 한 묶음만 확인해 주세요.'
        : '현재 저장된 프로필만 사용했어요. 미입력 값은 별도로 표시해요.',
      confidence: 'profile-state',
      dimensions: comparisonDimensions,
      missingData: missingBundleIds.map(bundleTitle),
      actions,
    },
    officialMetadata: OFFICIAL_BENCHMARK_METADATA,
    isSparse,
    primaryAction,
    disclaimer: BENCHMARK_DISCLAIMER,
  };
}

function buildProfileDimensions(profile: ApplicantProfileV2): BenchmarkDimension[] {
  const firstHome = evaluateFirstHomeEligibility(profile);
  const newlywed = buildNewlywedChecklist(profile).filter((item) => item.id !== 'notice');
  const firstNewlywedMissing = newlywed.find((item) => item.status === 'information-needed');

  return [
    accountDimension(profile),
    bundleDimension(profile, 'HOUSING_HISTORY', 'housing', '주택 이력', '본인·세대의 주택 이력 정보가 확인됐어요.'),
    locationDimension(profile),
    bundleDimension(profile, 'FAMILY', 'family', '가족·혼인 정보', '혼인·자녀 정보가 확인됐어요.'),
    bundleDimension(profile, 'INCOME', 'income', '소득 정보', '소득 범위와 관련 정보가 확인됐어요.'),
    bundleDimension(profile, 'ASSETS', 'assets', '자산 정보', '자산 범위 정보가 확인됐어요.'),
    {
      id: 'first-home',
      title: '생애최초 준비',
      detail: firstHome.summary,
      status: firstHome.status === 'needs_information'
        ? 'information-needed'
        : firstHome.status === 'not_eligible'
          ? 'checking'
          : 'listing-confirmation',
      source: 'profile',
      confidence: 'deterministic-rule',
      bundleId: firstHome.missingBundles[0],
    },
    {
      id: 'newlywed',
      title: '신혼 준비',
      detail: firstNewlywedMissing
        ? '신혼 준비에 필요한 프로필 정보가 더 필요해요.'
        : '관련 준비 정보는 확인했어요. 실제 조건은 공고별 확인이 필요해요.',
      status: firstNewlywedMissing ? 'information-needed' : 'listing-confirmation',
      source: 'profile',
      confidence: 'deterministic-rule',
      bundleId: firstNewlywedMissing?.bundleId,
    },
  ];
}

function accountDimension(profile: ApplicantProfileV2): BenchmarkDimension {
  const completion = getBundleCompletion(profile, 'SUBSCRIPTION_ACCOUNT');
  const hasAccount = knownValue(profile.subscriptionAccount.hasAccount);
  if (completion === 'complete' && hasAccount === true) {
    return dimension('account', '청약통장', '통장 보유·가입기간·납입 정보가 확인됐어요.', 'well-prepared', 'SUBSCRIPTION_ACCOUNT');
  }
  if (completion === 'complete' && hasAccount === false) {
    return dimension('account', '청약통장', '청약통장이 없는 것으로 저장돼 있어요. 필요 여부를 먼저 살펴보세요.', 'checking', 'SUBSCRIPTION_ACCOUNT');
  }
  return dimension(
    'account',
    '청약통장',
    completion === 'partial' ? '통장 정보가 일부만 확인됐어요.' : '통장 보유 여부와 유지 정보를 알려주세요.',
    completion === 'partial' ? 'checking' : 'information-needed',
    'SUBSCRIPTION_ACCOUNT',
  );
}

function locationDimension(profile: ApplicantProfileV2): BenchmarkDimension {
  const residenceKnown = Boolean(profile.residence.currentRegion.trim());
  const preferencesKnown = profile.preferences.regions.length > 0;
  return {
    id: 'location',
    title: '거주·관심지역',
    detail: residenceKnown && preferencesKnown
      ? '현재 거주지역과 관심지역이 확인됐어요.'
      : residenceKnown || preferencesKnown
        ? '지역 정보가 일부만 확인됐어요.'
        : '거주지역과 관심지역을 알려주세요.',
    status: residenceKnown && preferencesKnown
      ? 'well-prepared'
      : residenceKnown || preferencesKnown
        ? 'checking'
        : 'information-needed',
    source: 'profile',
    confidence: 'profile-state',
    bundleId: residenceKnown ? 'PREFERENCES' : 'RESIDENCE',
  };
}

function bundleDimension(
  profile: ApplicantProfileV2,
  bundleId: ProfileQuestionBundleId,
  id: string,
  title: string,
  completeDetail: string,
): BenchmarkDimension {
  const completion = getBundleCompletion(profile, bundleId);
  return dimension(
    id,
    title,
    completion === 'complete'
      ? completeDetail
      : completion === 'partial'
        ? '일부 정보만 확인됐어요.'
        : `${title}가 아직 입력되지 않았어요.`,
    completion === 'complete'
      ? 'well-prepared'
      : completion === 'partial'
        ? 'checking'
        : 'information-needed',
    bundleId,
  );
}

function dimension(
  id: string,
  title: string,
  detail: string,
  status: BenchmarkDimensionStatus,
  bundleId?: ProfileQuestionBundleId,
): BenchmarkDimension {
  return { id, title, detail, status, source: 'profile', confidence: 'profile-state', bundleId };
}

function bundleAction(bundleId: ProfileQuestionBundleId): BenchmarkAction {
  return { id: `complete-${bundleId.toLowerCase()}`, label: `${bundleTitle(bundleId)} 확인하기`, bundleId };
}

function bundleTitle(bundleId: ProfileQuestionBundleId): string {
  return PROFILE_BUNDLES.find((bundle) => bundle.id === bundleId)?.title ?? bundleId;
}

function uniqueBundles(values: ProfileQuestionBundleId[]): ProfileQuestionBundleId[] {
  return [...new Set(values)];
}
