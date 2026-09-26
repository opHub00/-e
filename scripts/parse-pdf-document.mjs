// 공식 PDF 공고문을 근거 블록 문서(JSON)로 바꾼다. 외부 LLM 을 쓰지 않는다.
//
// pdftotext 가 준 텍스트를 페이지·빈 줄 기준으로 끊어 블록으로 만든다.
// 글자를 만들어 내지 않는다. 블록 텍스트는 추출된 문자 그대로이고, 위치는 페이지 번호까지만 적는다.
//
// 한계(기술 부채): 이 환경의 pdftotext(Xpdf 4.06)는 단어 좌표(-bbox)를 주지 않는다.
// 그래서 sourceLocator.bbox 는 null 이다. 좌표가 필요해지면 poppler 계열 pdftotext -bbox-layout
// 또는 pdfplumber 로 같은 형식을 다시 만들면 된다. 표 구조도 좌표 없이는 확신할 수 없어 비워 둔다.
//
// Usage: node scripts/parse-pdf-document.mjs --pdf <file.pdf> --out <parsed.json> [--parser-version <label>]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
}

/** 제목처럼 보이는 짧은 줄. 공고문의 번호·로마자 표제를 헤딩으로 본다. */
const looksLikeHeading = text =>
  text.length <= 60 && /^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ][-.\s]|[0-9]+[.)]\s|[가-힣][.)]\s|[□■▶※◎]\s?)/.test(text);

/** 페이지 텍스트를 빈 줄 기준 문단으로 끊는다. 표 레이아웃은 줄 묶음 그대로 남는다. */
export function splitBlocks(pageText) {
  return pageText
    .split(/\n\s*\n+/)
    .map(block => block.replace(/[ \t]+$/gm, '').trim())
    .filter(block => block.length > 0);
}

export function buildParsedDocument({ text, sha256, parserVersion }) {
  const pages = text.split('\f');
  if (pages.length > 1 && !pages.at(-1).trim()) pages.pop();
  const blocks = [];
  const sectionPath = [];
  let sequence = 0;
  for (const [pageIndex, pageText] of pages.entries()) {
    for (const blockText of splitBlocks(pageText)) {
      sequence += 1;
      const heading = looksLikeHeading(blockText);
      if (heading) { sectionPath.length = 0; sectionPath.push(blockText.split('\n')[0].slice(0, 120)); }
      blocks.push({
        id: `b${String(sequence).padStart(6, '0')}`,
        type: heading ? 'heading' : 'paragraph',
        text: blockText,
        sectionPath: [...sectionPath],
        sourceLocator: { kind: 'PDF_BBOX', pageNumber: pageIndex + 1, bbox: null },
      });
    }
  }
  const characterCount = blocks.reduce((sum, block) => sum + block.text.length, 0);
  return {
    schemaVersion: 1,
    documentId: `sha256:${sha256}`,
    sha256,
    mimeType: 'application/pdf',
    parserVersion,
    status: blocks.length ? 'PARSED' : 'UNREADABLE',
    pages: pages.length,
    blocks,
    tables: [],
    metadata: { extractor: 'pdftotext -layout', bboxAvailable: false },
    quality: {
      textBlockCount: blocks.length,
      tableCount: 0,
      characterCount,
      emptyBlockRatio: 0,
      replacementCharacterCount: blocks.reduce((sum, block) => sum + (block.text.match(/�/g) ?? []).length, 0),
      suspiciousEncoding: !blocks.some(block => /[가-힣]/.test(block.text)),
      parserWarnings: ['TABLES_NOT_PARSED', 'BBOX_NOT_AVAILABLE'],
      extractionAllowed: true,
    },
  };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/parse-pdf-document.mjs');
if (invokedDirectly) {
  const pdf = flag(process.argv, '--pdf');
  const out = flag(process.argv, '--out');
  if (!pdf || !out) { console.error('Usage: --pdf <file.pdf> --out <parsed.json>'); process.exit(1); }
  const sha256 = createHash('sha256').update(readFileSync(pdf)).digest('hex');
  const text = execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 256 << 20 });
  const parsed = buildParsedDocument({ text, sha256, parserVersion: flag(process.argv, '--parser-version') ?? 'xpdf-pdftotext-layout-1' });
  writeFileSync(out, JSON.stringify(parsed));
  console.log(`${out}: ${parsed.pages}페이지 · 블록 ${parsed.blocks.length}개 · ${parsed.quality.characterCount}자 · sha256 ${sha256.slice(0, 12)}…`);
}
