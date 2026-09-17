import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256, validateManifest, validateState } from './domain.ts';
import { emptyState, type IngestionState, type LocalDocument, type Manifest } from './model.ts';

const absent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';
export class LocalIngestionStore {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  path(relative: string) {
    const p = resolve(this.root, relative);
    if (!p.startsWith(this.root + sep)) throw new Error('UNSAFE_LOCAL_PATH');
    return p;
  }
  async load(): Promise<IngestionState> {
    let text: string;
    try { text = await readFile(this.path('state.json'), 'utf8'); } catch (error) { if (absent(error)) return emptyState(); throw error; }
    const state: unknown = JSON.parse(text); validateState(state); return state;
  }
  async lock(): Promise<() => Promise<void>> {
    await mkdir(this.root, { recursive: true });
    let handle;
    try { handle = await open(this.path('sync.lock'), 'wx'); } catch { throw new Error('SYNC_LOCKED'); }
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    return async () => { await handle.close(); await unlink(this.path('sync.lock')); };
  }
  async immutable(relative: string, bytes: Uint8Array, verifyExisting = true) {
    const target = this.path(relative); await mkdir(dirname(target), { recursive: true });
    try { await writeFile(target, bytes, { flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (verifyExisting && sha256(await readFile(target)) !== sha256(bytes)) throw new Error('LOCAL_CONTENT_CONFLICT');
    }
  }
  async cached(document: LocalDocument): Promise<boolean> {
    try { const bytes = await readFile(this.path(document.localPath)); return bytes.length === document.size && sha256(bytes) === document.sha256; }
    catch (error) { if (absent(error)) return false; throw error; }
  }
  async saveManifest(m: Manifest): Promise<string> {
    validateManifest(m);
    const path = `announcements/${m.canonicalId}/versions/${m.version}.json`;
    // A content version keeps its first observation metadata. State retains latest validators/check time.
    await this.immutable(path, Buffer.from(JSON.stringify(m, null, 2) + '\n'), false);
    return path;
  }
  async save(state: IngestionState) {
    validateState(state);
    const temporary = this.path(`state-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, this.path('state.json'));
  }
}
