// Bounded, dry-run-by-default cleanup of never-redeemed expired staging QR objects.
import assert from 'node:assert/strict';
import { resolveProductV3StagingTarget } from '../features/productV3/admin/stagingTarget.ts';
import { STAGING_QR_BUCKET } from '../features/eventKiosk/server/stagingSupabaseResultSession.ts';

const target = resolveProductV3StagingTarget(process.env);
const apply = process.argv.includes('--apply');
assert.ok(process.argv.every(arg => arg !== '--force'), 'No force mode');
const headers = { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}`, 'content-type': 'application/json' };
const bucketResponse = await fetch(`${target.url}/storage/v1/bucket/${STAGING_QR_BUCKET}`, { headers });
assert.equal(bucketResponse.status, 200, 'Staging QR bucket must exist');
assert.equal((await bucketResponse.json()).public, false, 'Staging QR bucket must be private');

const listResponse = await fetch(`${target.url}/storage/v1/object/list/${STAGING_QR_BUCKET}`, {
  method: 'POST', headers, body: JSON.stringify({ prefix: 'v1', limit: 100, offset: 0,
    sortBy: { column: 'created_at', order: 'asc' } }),
});
assert.equal(listResponse.status, 200, 'Staging object listing failed');
const objects = await listResponse.json();
assert.ok(Array.isArray(objects), 'Unexpected Storage list response');
// Every normal session expires at six hours. Retain an extra hour to absorb clock skew.
const cutoff = Date.now() - 7 * 60 * 60 * 1_000;
const paths = objects.filter(object => {
  const name = String(object.name ?? '');
  const createdAt = Date.parse(String(object.created_at ?? ''));
  return /^[a-f0-9]{64}\.json$/.test(name) && Number.isFinite(createdAt) && createdAt < cutoff;
}).map(object => `v1/${object.name}`);
if (apply && paths.length) {
  const response = await fetch(`${target.url}/storage/v1/object/${STAGING_QR_BUCKET}`, {
    method: 'DELETE', headers, body: JSON.stringify({ prefixes: paths }),
  });
  assert.ok(response.ok, `Staging cleanup failed: ${response.status}`);
}
console.log(JSON.stringify({ project: target.ref, bucket: STAGING_QR_BUCKET,
  scanned: objects.length, eligible: paths.length, removed: apply ? paths.length : 0,
  dryRun: !apply, morePagesPossible: objects.length === 100 }));
