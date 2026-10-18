import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResultSummary } from '../summary.ts';
import { PersistentResultSessionService } from './persistentResultSession.ts';
import { createResultSessionRepository } from './resultSessionRepository.ts';
import { STAGING_QR_BUCKET, stagingQrObjectPath } from './stagingSupabaseResultSession.ts';

const staging = {
  WANPANE_ENV: 'staging', SUPABASE_STAGING_PROJECT_REF: 'abcdefghijklmnopqrst',
  SUPABASE_PRODUCTION_PROJECT_REF: 'zyxwvutsrqponmlkjihg',
  SUPABASE_STAGING_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'staging-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'staging-service',
  EVENT_QR_BACKEND: 'STAGING_SUPABASE_STORAGE',
};
const summary: ResultSummary = {
  v: 3, event: '삼도이동 분석', date: '2026-10-18', title: '삼도이동 1지구 분석 결과', focus: null, cautions: [],
};

test('staging QR stores a token hash only, with private server credentials and six-hour expiry', async () => {
  const objects = new Map<string, string>();
  const token = 'a'.repeat(64);
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input).split('?')[0];
    assert.ok(url.includes(`/storage/v1/object/${STAGING_QR_BUCKET}`));
    assert.ok(!url.includes(token));
    assert.equal((init?.headers as Record<string, string>).apikey, 'staging-service');
    if (init?.method === 'POST') {
      if (objects.has(url)) return Response.json({ statusCode: '409', error: 'Duplicate' }, { status: 400 });
      objects.set(url, String(init.body));
      return new Response('{}', { status: 200 });
    }
    if (init?.method === 'DELETE') {
      const path = (JSON.parse(String(init.body)) as { prefixes: string[] }).prefixes[0];
      objects.delete(`${url}/${path}`);
      return new Response('{}', { status: 200 });
    }
    return objects.has(url) ? new Response(objects.get(url), { status: 200 }) : new Response('', { status: 404 });
  }) as typeof fetch;
  const service = new PersistentResultSessionService(createResultSessionRepository(staging, fetcher), {
    now: () => 1_000, generateToken: () => token,
  });
  assert.equal(stagingQrObjectPath(token).includes(token), false);
  assert.equal((await service.create(summary)).expiresAt, new Date(1_000 + 21_600_000).toISOString());
  assert.equal((await service.read(token)).status, 'ok');
  await service.delete(token);
  assert.equal((await service.read(token)).status, 'missing');
  assert.equal(objects.size, 0);
});

test('staging QR backend fails closed for Production, mixed project refs and unknown backend', () => {
  assert.throws(() => createResultSessionRepository({ ...staging, WANPANE_ENV: 'production' }), /PRODUCT_V3_STAGING_ONLY/);
  assert.throws(() => createResultSessionRepository({ ...staging, VERCEL_ENV: 'production' }), /PRODUCT_V3_STAGING_ONLY/);
  assert.throws(() => createResultSessionRepository({ ...staging, SUPABASE_STAGING_PROJECT_REF: staging.SUPABASE_PRODUCTION_PROJECT_REF }),
    /PRODUCT_V3_STAGING_IDENTITY_REQUIRED/);
  assert.throws(() => createResultSessionRepository({ ...staging, EVENT_QR_BACKEND: 'other' }), /RESULT_SESSION_BACKEND_UNCONFIGURED/);
});

test('staging QR rejects private payloads before contacting Storage', async () => {
  const fetcher = (async () => { throw new Error('STORAGE_MUST_NOT_BE_CONTACTED'); }) as typeof fetch;
  const service = new PersistentResultSessionService(createResultSessionRepository(staging, fetcher));
  await assert.rejects(() => service.create({ ...summary, applicant: { birthDate: '1990-01-01' } }), /INVALID_SUMMARY/);
});
