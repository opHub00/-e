import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUpstashResultSessionCredentials } from './upstashResultSession.ts';

test('prefers the existing Upstash credential names', () => {
  assert.deepEqual(
    resolveUpstashResultSessionCredentials({
      UPSTASH_REDIS_REST_URL: ' https://primary.example ',
      UPSTASH_REDIS_REST_TOKEN: ' primary-token ',
      EVENT_QR_KV_REST_API_URL: 'https://integration.example',
      EVENT_QR_KV_REST_API_TOKEN: 'integration-token',
    }),
    { url: 'https://primary.example', token: 'primary-token' },
  );
});

test('falls back to the Vercel Integration-managed credential names', () => {
  assert.deepEqual(
    resolveUpstashResultSessionCredentials({
      EVENT_QR_KV_REST_API_URL: ' https://integration.example ',
      EVENT_QR_KV_REST_API_TOKEN: ' integration-token ',
    }),
    { url: 'https://integration.example', token: 'integration-token' },
  );
});

test('resolves URL and token priorities independently', () => {
  assert.deepEqual(
    resolveUpstashResultSessionCredentials({
      UPSTASH_REDIS_REST_URL: 'https://primary.example',
      EVENT_QR_KV_REST_API_TOKEN: 'integration-token',
    }),
    { url: 'https://primary.example', token: 'integration-token' },
  );
});

test('fails closed when either credential is missing', () => {
  assert.throws(
    () => resolveUpstashResultSessionCredentials({ EVENT_QR_KV_REST_API_URL: 'https://integration.example' }),
    /RESULT_SESSION_BACKEND_UNCONFIGURED/,
  );
  assert.throws(
    () => resolveUpstashResultSessionCredentials({ EVENT_QR_KV_REST_API_TOKEN: 'integration-token' }),
    /RESULT_SESSION_BACKEND_UNCONFIGURED/,
  );
});
