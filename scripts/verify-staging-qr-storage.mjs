import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolveProductV3StagingTarget } from '../features/productV3/admin/stagingTarget.ts';
import { PersistentResultSessionService } from '../features/eventKiosk/server/persistentResultSession.ts';
import { STAGING_QR_BUCKET, StagingSupabaseResultSessionRepository, stagingQrObjectPath } from '../features/eventKiosk/server/stagingSupabaseResultSession.ts';

const target = resolveProductV3StagingTarget(process.env);
const bucketResponse = await fetch(`${target.url}/storage/v1/bucket/${STAGING_QR_BUCKET}`, {
  headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}` },
});
assert.equal(bucketResponse.status, 200, 'Staging QR bucket must exist');
assert.equal((await bucketResponse.json()).public, false, 'Staging QR bucket must be private');

const repository = new StagingSupabaseResultSessionRepository(process.env);
const token = randomBytes(32).toString('hex');
const anonToken = randomBytes(32).toString('hex');
const summary = { v: 3, event: 'Staging QR verification', date: '2026-10-18', title: 'Housing result verification', focus: null, cautions: [] };
const service = new PersistentResultSessionService(repository, { generateToken: () => token });
const anonPath = `${target.url}/storage/v1/object/${STAGING_QR_BUCKET}/${stagingQrObjectPath(anonToken)}`;
const anonHeaders = { apikey: target.anonKey, authorization: `Bearer ${target.anonKey}` };
try {
  const created = await service.create(summary);
  assert.equal(created.token, token);
  assert.equal((await service.read(token)).status, 'ok');
  assert.equal(await repository.putIfAbsent(token, { summary, expiresAt: created.expiresAt }, 21_600), false);
  const anonRead = await fetch(`${target.url}/storage/v1/object/${STAGING_QR_BUCKET}/${stagingQrObjectPath(token)}`, { headers: anonHeaders });
  const anonWrite = await fetch(anonPath, { method: 'POST', headers: { ...anonHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ summary, expiresAt: created.expiresAt }) });
  assert.ok(anonRead.status >= 400, `Anonymous read unexpectedly returned ${anonRead.status}`);
  assert.ok(anonWrite.status >= 400, `Anonymous write unexpectedly returned ${anonWrite.status}`);
  const afterExpiry = new PersistentResultSessionService(repository, { now: () => Date.parse(created.expiresAt) + 1 });
  assert.equal((await afterExpiry.read(token)).status, 'expired');
  assert.equal((await service.read(token)).status, 'missing');
  console.log(JSON.stringify({ project: target.ref, bucket: STAGING_QR_BUCKET, private: true,
    create: 201, read: 200, collisionRejected: true, anonRead: anonRead.status, anonWrite: anonWrite.status,
    expiredRejected: true, expiredRemoved: true, rawTokenPersisted: false }));
} finally {
  await repository.delete(token);
  await repository.delete(anonToken);
}
