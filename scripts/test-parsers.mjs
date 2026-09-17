import { spawnSync } from 'node:child_process';
const result = spawnSync(process.env.DOCUMENT_PARSER_PYTHON ?? 'python', ['scripts/test_document_parser.py'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
if (result.error) console.error('PARSER_PYTHON_UNAVAILABLE');
process.exitCode = result.status ?? 1;
