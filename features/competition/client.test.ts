process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-test-key';

const { fetchCompetition } = await import('./useListingCompetition.ts');

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const identifier = { sourceType: 'apt' as const, houseManageNo: 'client1', pblancNo: 'notice1' };
const payload = {
  schemaVersion: 1 as const,
  identifier,
  generalRows: [],
  specialSupplyRows: [],
  source: {
    provider: '한국부동산원 청약Home' as const,
    dataset: '청약접수 경쟁률 및 특별공급 신청현황' as const,
    fetchedAt: '2026-09-08T12:00:00.000Z',
    cache: 'miss' as const,
    partial: false,
  },
};

let calls = 0;
const fetcher = async () => {
  calls += 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const [first, second] = await Promise.all([
  fetchCompetition(identifier, false, fetcher as typeof fetch),
  fetchCompetition(identifier, false, fetcher as typeof fetch),
]);
check(first === second, '동일 공고 in-flight 요청은 하나의 결과를 공유한다');
check(calls === 1, '동일 공고 중복 submit은 upstream 한 번만 호출한다');
await fetchCompetition(identifier, false, fetcher as typeof fetch);
check(calls === 1, 'fresh client cache hit는 네트워크를 호출하지 않는다');
await fetchCompetition(identifier, true, fetcher as typeof fetch);
check(calls === 2, '명시적 retry는 client cache를 우회한다');

let mismatchRejected = false;
try {
  await fetchCompetition(
    { sourceType: 'apt', houseManageNo: 'client2', pblancNo: 'notice2' },
    false,
    (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch,
  );
} catch {
  mismatchRejected = true;
}
check(mismatchRejected, '다른 공고 identifier 응답을 거부한다');

console.log(`competition client checks passed: ${checks}`);
