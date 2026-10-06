import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.EVENT_RC_PORT ?? 4173);
const ttlMs = 6 * 60 * 60 * 1000;
const sessions = new Map();
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

function validSummary(value) {
  if (!value || value.v !== 1 || typeof value.event !== 'string' || typeof value.date !== 'string') return false;
  const raw = JSON.stringify(value);
  return raw.length <= 48_000 && !/(displayName|birthDate|monthlyIncome|totalAssets|profileId|personId)/i.test(raw);
}

function originOf(request) {
  const host = request.headers.host;
  if (!host || /[\r\n]/.test(host)) throw new Error('INVALID_HOST');
  return `http://${host}`;
}

async function api(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/event-api/result-sessions') {
    const payload = await body(request);
    if (!validSummary(payload.summary)) return json(response, 400, { error: 'INVALID_SUMMARY' });
    const token = randomBytes(32).toString('hex');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlMs);
    sessions.set(token, { summary: structuredClone(payload.summary), expiresAt: expiresAt.getTime() });
    return json(response, 201, { token, expiresAt: expiresAt.toISOString(), url: `${originOf(request)}/event/take?token=${token}` });
  }
  const match = url.pathname.match(/^\/event-api\/result-sessions\/([a-f0-9]{64})$/);
  if (request.method === 'GET' && match) {
    const record = sessions.get(match[1]);
    if (!record) return json(response, 404, { error: 'NOT_FOUND' });
    if (record.expiresAt <= Date.now()) {
      sessions.delete(match[1]);
      return json(response, 410, { error: 'EXPIRED' });
    }
    return json(response, 200, { summary: record.summary, expiresAt: new Date(record.expiresAt).toISOString() });
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
