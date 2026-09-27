import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

/**
 * 동적 경로는 rewrite 가 있어야 한다.
 *
 * 정적으로 내보낸 웹은 경로마다 HTML 파일 하나를 만든다. `/admin/scoring/[id]` 같은 경로는
 * 실제 주소(`/admin/scoring/abc`)와 파일 이름이 달라서, 호스팅이 둘을 이어 주지 않으면
 * 엉뚱한 HTML(루트 화면)이 내려온다. 그러면 브라우저가 이어받는 순간 화면이 어긋나
 * React 가 통째로 다시 그리고 콘솔에 오류를 남긴다.
 *
 * 화면을 하나 더 만들 때 rewrite 를 빠뜨리기 쉬워서, 여기서 잡는다.
 */
const ROOT = new URL('../../', import.meta.url);

/** app/ 아래의 `[id].tsx` 를 찾아 실제 주소 패턴으로 옮긴다. */
async function dynamicRoutes(dir = 'app', out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await dynamicRoutes(path, out);
    else if (/^\[[^\]]+\]\.tsx$/.test(entry.name)) out.push(path.replace(/^app/, '').replace(/\.tsx$/, ''));
  }
  return out;
}

test('동적 화면마다 vercel rewrite 가 있다', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', ROOT), 'utf8')) as {
    rewrites?: { source: string; destination: string }[];
  };
  const rewrites = config.rewrites ?? [];
  const routes = (await dynamicRoutes()).map(route => route.replace(/\/+$/, ''));

  assert.ok(routes.length >= 2, '동적 화면을 하나도 찾지 못했다면 이 테스트가 잘못된 것이다');
  for (const route of routes) {
    // `/admin/scoring/[id]` → source `/admin/scoring/:id`
    const source = route.replace(/\[([^\]]+)\]/g, (_match, name: string) => `:${name}`);
    const found = rewrites.find(rewrite => rewrite.source === source);
    assert.ok(found, `${route} 로 가는 rewrite 가 vercel.json 에 없어요 (source: ${source})`);
    assert.equal(found!.destination, route, `${source} 의 destination 이 화면 경로와 달라요`);
  }
});
