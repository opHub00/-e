import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash as real } from 'node:crypto';
import { createHash as shim } from './nodeCrypto.ts';

/** The web bundle hashes review candidates with this shim; it must equal node's digest. */
test('web sha256 shim matches node across block boundaries and multibyte input', () => {
  const inputs = ['', 'abc', 'hello world', '만 19~39세', '제주특별자치도 1년 이상 거주',
    JSON.stringify({ ruleKey: 'youth.age', value: [19, 39] }), 'y'.repeat(55), 'z'.repeat(56), 'w'.repeat(64), 'x'.repeat(1000)];
  for (const input of inputs) {
    assert.equal(shim('sha256').update(input).digest('hex'), real('sha256').update(input).digest('hex'), input.slice(0, 20));
  }
});

test('unsupported algorithms and encodings are refused rather than silently wrong', () => {
  assert.throws(() => shim('md5'), /UNSUPPORTED_HASH_ALGORITHM/);
  assert.throws(() => shim('sha256').update('a').digest('base64'), /UNSUPPORTED_DIGEST_ENCODING/);
});
