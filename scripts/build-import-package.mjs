// Builds an import package from a human transcription and the parsed source document.
// Usage: --transcription <transcription.json> --parsed <document.json> --out <package.json>
//
// The transcription holds the rules a person read from the announcement, each pointing at
// parsed block ids. This tool never invents text: evidence excerpts, pages and locators are
// copied from the parsed document, and the build fails when
//   - the parsed document is not the package's document (SHA-256 mismatch),
//   - a cited block does not exist,
//   - a literal number in a rule (or a parameter it reads) does not appear in its cited text,
//     unless the transcription states why (derivedLiterals, e.g. "성년 = 만 19세").
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';

export function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
}

const digits = text => text.replace(/[\s,]/g, '');
/** Ways a number is printed in Korean announcements: 6,000,000 / 600만원 / 123,400천원 / 1년 = 12개월. */
export function literalForms(value) {
  const forms = new Set([String(value), value.toLocaleString('en-US')]);
  if (value >= 1000 && value % 1000 === 0) forms.add(`${(value / 1000).toLocaleString('en-US')}천원`);
  if (value >= 10000 && value % 10000 === 0) forms.add(`${(value / 10000).toLocaleString('en-US')}만원`);
  if (value >= 1_000_000 && value % 1_000_000 === 0) forms.add(`${(value / 1_000_000).toLocaleString('en-US')}백만원`);
  if (value >= 12 && value % 12 === 0) forms.add(`${value / 12}년`);
  return [...forms];
}
export function literalAppears(value, text) {
  const compact = digits(text);
  return literalForms(value).some(form => text.includes(form) || compact.includes(digits(form)));
}

function literals(expression, parameters, out = []) {
  if (!expression || typeof expression !== 'object') return out;
  if (Array.isArray(expression.all)) expression.all.forEach(item => literals(item, parameters, out));
  if (Array.isArray(expression.any)) expression.any.forEach(item => literals(item, parameters, out));
  if ('fact' in expression && typeof expression.value === 'number') out.push({ value: expression.value, from: `${expression.fact} ${expression.op}` });
  if ('fact' in expression && expression.value && typeof expression.value === 'object' && 'parameter' in expression.value) {
    const value = parameters[expression.value.parameter];
    if (typeof value !== 'number') throw new Error(`PARAMETER_MISSING:${expression.value.parameter}`);
    out.push({ value, from: `parameter ${expression.value.parameter}` });
  }
  return out;
}

export function buildImportPackage(transcription, parsed) {
  if (parsed.sha256 !== transcription.document.sha256) throw new Error('PARSED_DOCUMENT_SHA256_MISMATCH');
  const blocks = new Map(parsed.blocks.map(block => [block.id, block]));
  const parameters = transcription.ruleSet.config.parameters ?? {};
  const errors = [];
  const rules = transcription.rules.map(rule => {
    const cited = rule.evidence.blockIds.map(id => blocks.get(id) ?? errors.push(`BLOCK_NOT_FOUND:${rule.ruleKey}:${id}`));
    if (cited.some(block => typeof block === 'number')) return null;
    const excerpt = cited.map(block => block.text.trim()).join('\n');
    const derived = rule.evidence.derivedLiterals ?? {};
    for (const literal of literals(rule.config.expression, parameters)) {
      if ([0, 1, -1].includes(literal.value) || derived[String(literal.value)]) continue;
      if (!literalAppears(literal.value, excerpt)) errors.push(`LITERAL_NOT_IN_EVIDENCE:${rule.ruleKey}:${literal.from}=${literal.value}`);
    }
    const pages = [...new Set(cited.map(block => block.sourceLocator?.pageNumber).filter(page => Number.isInteger(page)))];
    return {
      ruleKey: rule.ruleKey,
      supplyType: rule.supplyType,
      stage: rule.stage,
      category: rule.category,
      config: rule.config,
      evidence: {
        id: `${transcription.evidencePrefix}.${rule.ruleKey}`,
        documentId: transcription.document.id,
        source: transcription.evidenceSource,
        section: rule.evidence.section,
        label: rule.evidence.label ?? String(rule.config.label),
        tableLabel: rule.evidence.tableLabel ?? null,
        pageNumber: pages[0] ?? null,
        textExcerpt: excerpt,
        sourceUrl: transcription.document.sourceUrl,
        locator: {
          sha256: parsed.sha256,
          parserVersion: parsed.parserVersion,
          pages,
          blocks: cited.map(block => ({ id: block.id, page: block.sourceLocator?.pageNumber ?? null, bbox: block.sourceLocator?.bbox ?? null })),
          ...(Object.keys(derived).length ? { derivedLiterals: derived } : {}),
        },
      },
    };
  });
  if (errors.length) throw new Error(`TRANSCRIPTION_INVALID\n${errors.join('\n')}`);
  const pkg = {
    schemaVersion: 1,
    announcement: transcription.announcement,
    document: transcription.document,
    ruleSet: transcription.ruleSet,
    rules,
  };
  // The importer's own validator decides whether the package can be imported.
  validateImportPackage(pkg);
  return pkg;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1]?.endsWith('build-import-package.mjs')) {
  const argv = process.argv.slice(2);
  const transcriptionPath = flag(argv, '--transcription'), parsedPath = flag(argv, '--parsed'), outPath = flag(argv, '--out');
  if (!transcriptionPath || !parsedPath || !outPath) throw new Error('usage: --transcription <json> --parsed <document.json> --out <package.json>');
  const transcription = JSON.parse(await readFile(resolve(transcriptionPath), 'utf8'));
  const parsed = JSON.parse(await readFile(resolve(parsedPath), 'utf8'));
  const pkg = buildImportPackage(transcription, parsed);
  await writeFile(resolve(outPath), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`import package written: ${pkg.rules.length} rules, document ${pkg.document.sha256.slice(0, 12)}…`);
}
