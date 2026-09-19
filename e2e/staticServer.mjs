// Serves the `expo export --platform web` output for browser smoke tests.
// Expo emits one HTML file per route, so `/assessment` resolves to `assessment.html`.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};

const fileAt = async (path) => {
  try { return (await stat(path)).isFile() ? path : null; } catch { return null; }
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const clean = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(join(root, clean));
  // Never serve outside the export directory.
  if (candidate !== root && !candidate.startsWith(root + sep)) { response.writeHead(403).end(); return; }

  const target = await fileAt(candidate)
    ?? await fileAt(`${candidate}.html`)
    ?? await fileAt(join(candidate, 'index.html'))
    ?? await fileAt(join(root, 'index.html'));
  if (!target) { response.writeHead(404).end('not found'); return; }

  response.writeHead(200, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(response);
}).listen(port, () => console.log(`static export served on http://127.0.0.1:${port}`));
