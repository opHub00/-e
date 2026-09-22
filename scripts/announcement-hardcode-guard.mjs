// CI guard: generic pipeline modules must not know any single announcement.
// A new hit outside the allowlist fails the build and needs review: move the
// value into announcement data (import package, review annotations, literal
// expectations) or into the fixture/benchmark layer, never into generic code.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const FORBIDDEN = [
  { name: 'announcement name', pattern: /삼도|[Ss]amdo|SAMDO|고덕엘리스트|고덕국제화|[Gg]odeok|A65BL|2026000438/ },
  { name: 'hard-coded region', pattern: /제주|평택/ },
  // Thresholds printed in one announcement. Statutory values (19세, 6회, 600만원 …) are allowed.
  { name: 'announcement amount', pattern: /362백만|276백만|1,034백만|2,669,354|5,338,708|9,793,892|10,547,268|215,500천원|45,420천원|215_500_000|45_420_000/ },
];

/** Paths allowed to mention a specific announcement, each with the reason. */
export const ALLOWLIST = [
  { pattern: /\.(test|spec)\.(ts|tsx|mjs)$/, reason: 'tests' },
  { pattern: /\.test-data\.ts$/, reason: 'test data' },
  { pattern: /\.generated\.ts$/, reason: 'generated test/dev fixture' },
  { pattern: /(^|\/)fixtures\//, reason: 'fixture layer' },
  { pattern: /\.fixture\.ts$/, reason: 'regression dataset' },
  { pattern: /^features\/discovery\/regions\.ts$/, reason: 'region registry: the single source of truth for every region', file: true },
  { pattern: /^features\/applicationAssessment\/reference\//, reason: 'LEGACY/REFERENCE_ONLY sample, explicitly selected and labelled', dir: 'features/applicationAssessment/reference' },
  { pattern: /^features\/ruleExtraction\/server\/v4\/scorecard\.ts$/, reason: 'Samdo retrieval benchmark oracle; not on the import path', file: true },
  { pattern: /^features\/ruleExtraction\/server\/v4_1\/benchmarkPack\.ts$/, reason: 'frozen Samdo benchmark pack identity', file: true },
  { pattern: /^features\/ruleExtraction\/server\/v4_1\/comparison\.ts$/, reason: 'model-comparison benchmark scoring over the frozen pack', file: true },
  { pattern: /^scripts\/[^/]*samdo[^/]*\.mjs$/, reason: 'archived Samdo benchmark tooling' },
  { pattern: /^scripts\/(generate|verify)-rule-review-seed\.mjs$/, reason: 'writes/verifies the checked-in Samdo test fixture' },
  { pattern: /^scripts\/check-assessment-[a-z-]+\.mjs$/, reason: 'local database checks with synthetic, labelled rows' },
  { pattern: /^scripts\/export-assessment-reference\.mjs$/, reason: 'exports the legacy reference sample', file: true },
  { pattern: /^scripts\/audit-extraction-samples\.mjs$/, reason: 'archived extraction audit', file: true },
  { pattern: /^scripts\/announcement-hardcode-guard\.mjs$/, reason: 'this guard', file: true },
];

/** Runtime code may not reach into the fixture or benchmark layers. */
const RUNTIME_ROOTS = ['app', 'components', 'features', 'lib', 'domain', 'store'];
const FORBIDDEN_RUNTIME_IMPORT = /from\s+['"][^'"]*(?:\/fixtures\/|\.generated(?:\.ts)?['"]|\/v4\/scorecard|\/benchmarkPack)/;
const ROOTS = [...RUNTIME_ROOTS, 'supabase/migrations', 'supabase/functions', 'scripts'];
const EXTENSIONS = /\.(ts|tsx|mjs|js|sql)$/;

async function walk(root, dir, out) {
  let entries;
  try { entries = await readdir(join(root, dir), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) await walk(root, path, out);
    else if (EXTENSIONS.test(entry.name)) out.push(path);
  }
}

export const allowed = path => ALLOWLIST.find(item => item.pattern.test(path)) ?? null;
const isTestLike = path => /\.(test|spec)\.(ts|tsx|mjs)$|\.test-data\.ts$|\.fixture\.ts$|(^|\/)fixtures\//.test(path);

export async function scanAnnouncementHardcodes(root) {
  const files = [];
  for (const dir of ROOTS) await walk(root, dir, files);
  const violations = [];
  for (const path of files) {
    const text = await readFile(join(root, path), 'utf8');
    if (!allowed(path)) {
      text.split(/\r?\n/).forEach((line, index) => {
        for (const rule of FORBIDDEN) if (rule.pattern.test(line)) violations.push({ path, line: index + 1, rule: rule.name, text: line.trim().slice(0, 140) });
      });
    }
    if (RUNTIME_ROOTS.some(dir => path.startsWith(`${dir}/`)) && !isTestLike(path) && !allowed(path)) {
      text.split(/\r?\n/).forEach((line, index) => {
        if (FORBIDDEN_RUNTIME_IMPORT.test(line)) violations.push({ path, line: index + 1, rule: 'runtime imports fixture/benchmark', text: line.trim().slice(0, 140) });
      });
    }
  }
  // An allowlist entry for a file or folder that no longer exists is stale and must be removed.
  const stale = [];
  for (const item of ALLOWLIST) {
    const target = item.dir ?? (item.file ? item.pattern.source.replace(/^\^|\$$/g, '').replace(/\\/g, '') : null);
    if (!target) continue;
    try { await stat(join(root, target)); } catch { stale.push(target); }
  }
  return { scanned: files.length, violations, stale, relativeRoot: relative(process.cwd(), root) || '.' };
}
