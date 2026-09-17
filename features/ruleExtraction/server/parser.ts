import { spawn } from 'node:child_process';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateParsedDocument, type ParsedDocument } from './parsedDocument.ts';
import type { LocalDocument } from '../../announcementIngestion/server/model.ts';

export interface DocumentParser {
  supports(document: LocalDocument): boolean;
  parse(document: LocalDocument, sourcePath: string, outputPath: string): Promise<ParsedDocument>;
}
export class PythonDocumentParser implements DocumentParser {
  readonly mimeType: string; readonly python: string; readonly timeoutMs: number;
  constructor(mimeType: string, python: string, timeoutMs = 180000) { this.mimeType = mimeType; this.python = python; this.timeoutMs = timeoutMs; }
  supports(d: LocalDocument) { return d.mimeType === this.mimeType; }
  async parse(document: LocalDocument, sourcePath: string, outputPath: string) {
    if (!this.supports(document) || (await stat(sourcePath)).size !== document.size) throw new Error('DOCUMENT_INPUT_MISMATCH');
    await mkdir(dirname(outputPath), { recursive: true });
    // Deliberately omit credentials, API variables and document-supplied environment/arguments.
    const env = Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','HOME'].filter(k => process.env[k]).map(k => [k, process.env[k]!])) as NodeJS.ProcessEnv;
    env.PYTHONIOENCODING = 'utf-8'; env.PYTHONNOUSERSITE = '1';
    await new Promise<void>((accept, reject) => {
      const child = spawn(this.python, ['-s', resolve('scripts/document_parser_worker.py'), '--input', resolve(sourcePath), '--output', resolve(outputPath), '--mime', document.mimeType, '--sha256', document.sha256], { env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
      let size = 0, timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, this.timeoutMs);
      const consume = (data: Buffer) => { size += data.length; if (size > 64000) child.kill(); };
      child.stdout.on('data', consume); child.stderr.on('data', consume);
      child.on('error', () => { clearTimeout(timer); reject(new Error('PARSER_PROCESS_UNAVAILABLE')); });
      child.on('close', code => { clearTimeout(timer); code === 0 && !timedOut && size <= 64000 ? accept() : reject(new Error(timedOut ? 'PARSER_TIMEOUT' : 'PARSER_PROCESS_FAILED')); });
    });
    if ((await stat(outputPath)).size > 64_000_000) throw new Error('PARSER_OUTPUT_LIMIT');
    const parsed: unknown = JSON.parse(await readFile(outputPath, 'utf8')); validateParsedDocument(parsed);
    if (parsed.sha256 !== document.sha256 || parsed.mimeType !== document.mimeType) throw new Error('PARSED_IDENTITY_MISMATCH');
    return parsed;
  }
}
export class PdfDocumentParser extends PythonDocumentParser { constructor(python: string) { super('application/pdf', python); } }
export class HwpDocumentParser extends PythonDocumentParser { constructor(python: string) { super('application/x-hwp', python); } }
export class HwpxDocumentParser extends PythonDocumentParser { constructor(python: string) { super('application/hwp+zip', python); } }
export function documentParsers(python: string): DocumentParser[] { return [new PdfDocumentParser(python), new HwpDocumentParser(python), new HwpxDocumentParser(python)]; }
