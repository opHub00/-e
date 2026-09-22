// Node-only loader shared by the seed generator and the staging seed script.
// Every announcement goes through the same path: import package + review annotations → generic seed.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';
import { decodeReviewSeedAnnotation } from '../features/assessmentRuleReview/seed/annotations.ts';
import { buildAssessmentReviewSeed } from '../features/assessmentRuleReview/seed/buildAssessmentReviewSeed.ts';

/** Reads `--package <path> --annotations <path>` style options. Both are required: there is no default announcement. */
export function reviewSeedPaths(argv) {
  const value = flag => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
  };
  const packagePath = value('--package'), annotationsPath = value('--annotations');
  if (!packagePath || !annotationsPath) throw new Error('REVIEW_SEED_INPUT_REQUIRED: --package <import package json> --annotations <review annotations json>');
  return { packagePath: resolve(packagePath), annotationsPath: resolve(annotationsPath) };
}

export async function loadReviewSeedInput({ packagePath, annotationsPath }) {
  const source = JSON.parse(await readFile(packagePath, 'utf8'));
  // The importer's own validator: a package that cannot be imported cannot be seeded.
  validateImportPackage(source);
  const annotation = decodeReviewSeedAnnotation(JSON.parse(await readFile(annotationsPath, 'utf8')));
  return { source, annotation, seed: buildAssessmentReviewSeed(source, annotation) };
}
