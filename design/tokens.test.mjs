import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 시연 전에 정리한 규칙이 조용히 되돌아오는 것만 막는다.
 * 폭넓은 스타일 검사는 하지 않는다. 오탐이 나는 규칙은 넣지 않는다.
 */

let checks = 0;
const failures = [];
const check = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) files.push(path);
  }
};
['app', 'components', 'features'].forEach(walk);

const rel = (p) => relative('.', p).replaceAll('\\', '/');
const sources = files.map((path) => ({ path: rel(path), text: readFileSync(path, 'utf8') }));

/** JSX 텍스트 노드만 본다. 코드 식별자나 fetch 옵션은 검사하지 않는다. */
const jsxText = (text) =>
  [...text.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1].trim()).filter(Boolean);

// 1. 장식성 영문 eyebrow. 화면에 보이는 텍스트가 통째로 영문 대문자면 잡는다.
{
  const offenders = [];
  for (const { path, text } of sources) {
    for (const node of jsxText(text)) {
      if (/^[A-Z][A-Z0-9 ·&.]{3,}$/.test(node)) offenders.push(`${path}: ${node}`);
    }
  }
  check(offenders.length === 0, `장식성 영문 라벨이 화면에 있습니다:\n    ${offenders.join('\n    ')}`);
}

// 2. 내부 구현 용어 노출. 사용자 문구에 개발 용어를 쓰지 않는다.
{
  const banned = /(Mock|mock 데이터|읽기 전용 Mock|서버 기능은 없|데모 초기화|\bV1\b)/i;
  const offenders = [];
  for (const { path, text } of sources) {
    for (const node of jsxText(text)) {
      if (banned.test(node)) offenders.push(`${path}: ${node}`);
    }
  }
  check(offenders.length === 0, `내부 구현 용어가 노출됩니다:\n    ${offenders.join('\n    ')}`);
}

// 3. 최소 타이포. type.micro(11) 보다 작은 글씨를 만들지 않는다.
{
  const offenders = [];
  for (const { path, text } of sources) {
    for (const m of text.matchAll(/fontSize: (\d+)/g)) {
      if (Number(m[1]) < 11) offenders.push(`${path}: fontSize ${m[1]}`);
    }
  }
  check(offenders.length === 0, `최소 글자 크기(11) 아래입니다:\n    ${offenders.join('\n    ')}`);
}

// 4. letterSpacing 은 tracking 토큰에서만 온다.
{
  const offenders = [];
  for (const { path, text } of sources) {
    for (const m of text.matchAll(/letterSpacing: (-?[\d.]+)/g)) {
      offenders.push(`${path}: letterSpacing ${m[1]}`);
    }
  }
  check(offenders.length === 0, `letterSpacing 은 tracking 토큰을 쓰세요:\n    ${offenders.join('\n    ')}`);
}

// 5. 카드 테두리는 surfaceHigh. outline 은 컨트롤 전용이라 카드 radius 와 함께 오면 안 된다.
{
  const offenders = [];
  for (const { path, text } of sources) {
    const block = text.match(/StyleSheet\.create\(\{([\s\S]*)\}\);?\s*$/);
    if (!block) continue;
    for (const m of block[1].matchAll(/^ {2}(\w+): \{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\},?$/gm)) {
      const flat = m[2].replace(/\s+/g, ' ');
      if (/borderColor: colors\.outline/.test(flat) && /borderRadius: radius\.(card|cardSm|bento)/.test(flat)) {
        offenders.push(`${path}: ${m[1]}`);
      }
    }
  }
  check(offenders.length === 0, `카드 테두리에 outline 을 쓰지 마세요(surfaceHigh):\n    ${offenders.join('\n    ')}`);
}

if (failures.length > 0) {
  console.error(`design/tokens: ${failures.length}개 규칙 위반`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`design/tokens: ${checks} checks passed`);
