# Assessment Rule Review platform boundary

## 목적

Rule Review의 판정·검수 상태 전이는 브라우저와 Node에서 같은 순수 domain code를 사용한다. Domain은 `node:crypto`, filesystem, Metro alias, Supabase client를 알지 않는다. 운영 DB 연결 전의 관리자 콘솔은 명시적으로 주입된 dev/test seed만 사용하는 hidden prototype이다.

## 책임 분리

```text
RuleReviewService / ReviewWorkspace
        ↑
RuleReviewRepository
        ↑
InMemoryRuleReviewRepository (test/dev)
        ↑
sessionStorage seed adapter (browser smoke only)

Future:
trusted server ReviewRepository → Supabase/Postgres
```

- `RuleReviewService`: immutable original, edit diff, revision, audit, evidence/conflict/exception blocker, activation gate의 유일한 source of truth다.
- `CandidateHasher`: 동기 domain이 받는 최소 SHA-256 interface다. 기본 구현은 runtime builtin이 없는 순수 TypeScript SHA-256이다.
- `WebCryptoCandidateHasher`: 브라우저와 Node의 `globalThis.crypto.subtle`을 사용하는 비동기 adapter다. Web Crypto는 domain에 직접 노출하지 않는다.
- `RuleReviewRepository`: UI가 사용하는 조회·mutation contract다. UI는 `RuleReviewService`를 생성하거나 activation 조건을 재구현하지 않는다.
- `InMemoryRuleReviewRepository`: test/dev 전용이다. 향후 trusted server repository로 교체한다.

## Canonical candidate hash

Candidate는 SHA-256 전에 다음 규칙으로 직렬화한다.

1. object key는 code-unit 순서로 정렬한다.
2. array 순서는 보존한다.
3. object의 `undefined` property는 생략하고 array의 `undefined`는 `null`로 기록한다.
4. string은 JSON escaping 후 UTF-8 bytes로 hash한다.
5. `null`, boolean, 유한 number, string, array, plain object만 허용한다.
6. `-0`은 `0`으로 정규화한다.
7. NaN/Infinity, bigint, function, symbol, class instance, cycle은 거절한다.

Empty, ASCII, Korean UTF-8, 55/56/64/1000-byte boundary와 실제 Samdo candidate를 portable SHA-256 및 Web Crypto로 교차 검증한다.

## Fixture generation과 stale detection

`data/assessment-rules/samdo-2026-v1.7.json`은 Node-only generator가 읽는다. 앱과 domain은 filesystem을 읽지 않는다.

```bash
npm run gen:rule-review-seed
npm run verify:rule-review-seed
```

생성 파일에는 다음 provenance만 저장한다.

- `sourceFixtureHash`: source JSON의 canonical hash
- `sourceFixtureVersion`: source rule-set version
- `generatorVersion`: generator contract version

시간과 로컬 경로는 넣지 않아 동일 source에서 byte-stable output을 만든다. Verify script와 unit test는 source가 달라지면 `STALE_REVIEW_SEED`로 실패한다.

Generated seed는 test와 hidden admin prototype에만 쓰인다. Production route는 generated module을 import하지 않는다. Browser smoke test가 session storage에 seed를 명시적으로 주입하고, route는 `RuleReviewRepository`만 받는다. Seed가 없으면 console 대신 연결 전 안내를 표시한다.

## Browser runtime

Metro `node:crypto` alias는 제거했다. Browser smoke는 다음을 검증한다.

- page error 없음
- `createHash`/filesystem runtime 오류 없음
- Web Crypto와 portable SHA-256의 동일 결과
- Supabase/REST request 없음
- domain activation blocker가 UI에서도 그대로 작동

## Production repository 전환

Production 연결 시 UI contract는 유지하고 `RuleReviewRepository` 구현만 trusted server API adapter로 교체한다. Service-role key와 mutation SQL은 client bundle에 넣지 않는다. Server repository는 기존 `expectedRevision`, audit actor, immutable candidate hash, document hash, RLS와 activation RPC gate를 함께 검증해야 한다.

현재 migration은 원격에 적용하지 않았으며 실제 approve/activate도 수행하지 않았다.
