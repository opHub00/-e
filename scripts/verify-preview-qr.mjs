// Run under `vercel env run` for the linked Staging Preview project. Never print bearer tokens.
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? '');
assert.equal(base.protocol, 'https:');
assert.ok(base.hostname.endsWith('.vercel.app'));
const oidc = process.env.VERCEL_OIDC_TOKEN;
assert.ok(oidc, 'Vercel development OIDC token is required for protected Preview');
const headers = { 'x-vercel-trusted-oidc-idp-token': oidc, 'cache-control': 'no-store' };
const call = (path, init = {}) => fetch(new URL(path, base), {
  ...init, headers: { ...headers, ...(init.headers ?? {}) }, redirect: 'manual',
});
const summary = { v: 3, event: 'Staging external verification', date: '2026-10-18',
  title: 'Housing result verification', focus: null, cautions: [] };
const routes = {};
for (const path of ['/', '/event', '/event/chat', '/admin/console']) {
  const response = await call(path);
  routes[path] = response.status;
  assert.equal(response.status, 200, `${path} must load through protected Preview`);
}
const unauthorizedAdmin = await call('/admin-api/product-v3?view=dashboard');
assert.equal(unauthorizedAdmin.status, 401, 'Admin API must reject unauthenticated callers');
const payload = JSON.stringify({ summary });
const post = await call('/event-api/result-sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
assert.equal(post.status, 201, `QR POST failed: ${post.status}`);
const created = await post.json();
assert.match(created.token, /^[a-f0-9]{64}$/);
assert.ok(created.url.startsWith(`${base.origin}/event/take?token=`));
assert.ok(!created.url.includes(summary.title));
assert.ok(!created.url.includes('birthDate') && !created.url.includes('income') && !created.url.includes('profile'));
const tokenPath = `/event-api/result-sessions/${created.token}`;
try {
  const get = await call(tokenPath);
  assert.equal(get.status, 200, 'QR GET must succeed');
  const redeemed = await get.json();
  assert.deepEqual(redeemed.summary, summary);
  const mobile = await call(`/event/take?token=${created.token}`);
  assert.equal(mobile.status, 200, 'Mobile result page must load');
  const invalid = await call('/event-api/result-sessions/invalid-token');
  assert.equal(invalid.status, 400, 'Malformed token must be rejected');
  const privatePayload = await call('/event-api/result-sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ summary: { ...summary, applicant: { birthDate: '1990-01-01' } } }),
  });
  assert.equal(privatePayload.status, 400, 'Private payload must be rejected');
} finally {
  const deleted = await call(tokenPath, { method: 'DELETE' });
  assert.equal(deleted.status, 204, 'QR DELETE must return 204');
}
const missing = await call(tokenPath);
assert.equal(missing.status, 404, 'Deleted token must not redeem');
console.log(JSON.stringify({ preview: base.origin, routes, adminUnauthenticated: unauthorizedAdmin.status,
  qrPost: post.status, qrGet: 200, mobileResult: 200, qrDelete: 204, deletedGet: missing.status,
  invalidToken: 400, privatePayload: 400, opaqueToken: true, qrUrlHasPrivateData: false }));
