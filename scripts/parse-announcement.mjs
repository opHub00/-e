import { parseArgs } from 'node:util';
import { processAnnouncement } from '../features/ruleExtraction/server/pipeline.ts';
try {
  const { values } = parseArgs({ options: { id: { type: 'string' }, 'work-dir': { type: 'string', default: '.ingestion' }, python: { type: 'string' }, 'dry-run': { type: 'boolean' }, extract: { type: 'boolean' } }, strict: true });
  if (!values.id) throw new Error('ID_REQUIRED');
  console.log(JSON.stringify(await processAnnouncement({ id: values.id, root: values['work-dir'], python: values.python ?? process.env.DOCUMENT_PARSER_PYTHON ?? 'python', dryRun: values['dry-run'], extract: values.extract }), null, 2));
} catch (error) {
  // Never echo file contents, source text, credentials or arbitrary child-process diagnostics.
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'EXTRACTION_PIPELINE_FAILED';
  console.error(code); process.exitCode = 1;
}
