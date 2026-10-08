import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { InMemoryResultSessionStore, RESULT_SESSION_TTL_MS, isValidResultSummary } from './event-result-session-store.mjs';
import activeDataset from '../data/events/jeju-event-2026-10-v1.json' with { type: 'json' };
import liveReference from '../data/events/jeju-live-reference-2026-10-09.json' with { type: 'json' };
import { buildServiceListingPortfolio } from '../features/eventKiosk/live/portfolio.ts';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.EVENT_RC_PORT ?? 4173);
const sessions = new InMemoryResultSessionStore({ ttlMs: RESULT_SESSION_TTL_MS });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function originOf(request) {
  const host = request.headers.host;
  if (!host || /[\r\n]/.test(host)) throw new Error('INVALID_HOST');
  return `http://${host}`;
}

async function api(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/event-api/listings') {
    return json(response, 200, {
      ...buildServiceListingPortfolio({
        now: new Date().toISOString(),
        fetchedAt: liveReference.fetchedAt,
        liveRecords: liveReference.records,
        liveSourceStatus: 'STALE_REFERENCE',
        frozenDataset: activeDataset,
      }),
      transport: 'BUNDLED_REFERENCE',
    });
  }
  if (request.method === 'POST' && url.pathname === '/event-api/result-sessions') {
    const payload = await body(request);
    if (!isValidResultSummary(payload.summary)) return json(response, 400, { error: 'INVALID_SUMMARY' });
    const session = sessions.create(payload.summary);
    return json(response, 201, { ...session, url: `${originOf(request)}/event/take?token=${session.token}` });
  }
  const match = url.pathname.match(/^\/event-api\/result-sessions\/([a-f0-9]{64})$/);
  if (request.method === 'GET' && match) {
    const record = sessions.read(match[1]);
    if (record.status === 'expired') return json(response, 410, { error: 'EXPIRED' });
    if (record.status !== 'ok') return json(response, 404, { error: 'NOT_FOUND' });
    return json(response, 200, { summary: record.summary, expiresAt: record.expiresAt });
  }
  if (request.method === 'DELETE' && match) {
    sessions.delete(match[1]);
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return true;
  }
  return false;
}

function safeFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const candidate = resolve(root, relative);
  return candidate.startsWith(root) ? candidate : null;
}

async function staticFile(response, pathname) {
  const initial = safeFile(pathname === '/' ? 'index.html' : pathname);
  if (!initial) return false;
  const candidates = [initial, `${initial}.html`, join(initial, 'index.html'), join(root, 'index.html')];
  for (const candidate of candidates) {
    if (!existsSync(candidate) || !(await stat(candidate)).isFile()) continue;
    const etag = createHash('sha256').update(await readFile(candidate)).digest('hex').slice(0, 16);
    response.writeHead(200, { 'content-type': mime[extname(candidate)] ?? 'application/octet-stream', etag, 'cache-control': candidate.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable' });
    createReadStream(candidate).pipe(response);
    return true;
  }
  return false;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', originOf(request));
    if (url.pathname.startsWith('/event-api/')) {
      const handled = await api(request, response, url);
      if (handled !== false) return;
      return json(response, 404, { error: 'NOT_FOUND' });
    }
    if (await staticFile(response, url.pathname)) return;
    response.writeHead(404).end('Not found');
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'SERVER_ERROR' });
  }
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Jeju event RC server: http://127.0.0.1:${port}\n`);
});
