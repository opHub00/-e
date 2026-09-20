/** Platform-neutral hashing contracts used by the synchronous review domain. */
export interface CandidateHasher {
  sha256(input: string | Uint8Array): string;
}

/** Web Crypto is asynchronous, so it is exposed as an adapter rather than leaked into the domain. */
export interface AsyncCandidateHasher {
  sha256(input: string | Uint8Array): Promise<string>;
}

const encoder = new TextEncoder();
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const bytesOf = (input: string | Uint8Array) => typeof input === 'string' ? encoder.encode(input) : input;
const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
const hex = (bytes: ArrayBuffer | Uint8Array) => [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');

/** FIPS 180-4 SHA-256 used where the domain needs a synchronous digest. */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes = bytesOf(input);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + K[i] + words[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) state[i] = (state[i] + next[i]) >>> 0;
  }
  return state.map(value => value.toString(16).padStart(8, '0')).join('');
}

/**
 * Canonical JSON rules:
 * - object keys use code-unit sort order;
 * - array order is preserved;
 * - undefined object properties are omitted and undefined array slots become null;
 * - strings are UTF-8 encoded for hashing;
 * - non-finite numbers, bigint, functions, symbols, cycles and class instances are rejected.
 */
export function canonicalSerialize(value: unknown): string {
  const active = new Set<object>();
  const encode = (item: unknown, arrayValue = false): string => {
    if (item === null) return 'null';
    if (item === undefined) {
      if (arrayValue) return 'null';
      throw new Error('UNDEFINED_CANONICAL_ROOT');
    }
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('NON_FINITE_CANONICAL_NUMBER');
      return Object.is(item, -0) ? '0' : JSON.stringify(item);
    }
    if (typeof item !== 'object') throw new Error('UNSUPPORTED_CANONICAL_VALUE');
    if (active.has(item)) throw new Error('CYCLIC_CANONICAL_VALUE');
    active.add(item);
    try {
      if (Array.isArray(item)) return `[${item.map(entry => encode(entry, true)).join(',')}]`;
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new Error('NON_PLAIN_CANONICAL_OBJECT');
      const record = item as Record<string, unknown>;
      return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
        .map(key => `${JSON.stringify(key)}:${encode(record[key])}`).join(',')}}`;
    } finally {
      active.delete(item);
    }
  };
  return encode(value);
}

export const PORTABLE_CANDIDATE_HASHER: CandidateHasher = Object.freeze({ sha256: sha256Hex });

export class WebCryptoCandidateHasher implements AsyncCandidateHasher {
  private readonly subtle: SubtleCrypto;
  constructor(subtle: SubtleCrypto) { this.subtle = subtle; }
  async sha256(input: string | Uint8Array): Promise<string> {
    const source = bytesOf(input), bytes = new Uint8Array(source.length);
    bytes.set(source);
    return hex(await this.subtle.digest('SHA-256', bytes.buffer));
  }
}

export function createWebCryptoCandidateHasher(cryptoApi: Crypto | undefined = globalThis.crypto): AsyncCandidateHasher {
  if (!cryptoApi?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  return new WebCryptoCandidateHasher(cryptoApi.subtle);
}

export function hashCanonical(value: unknown, hasher: CandidateHasher = PORTABLE_CANDIDATE_HASHER): string {
  return hasher.sha256(canonicalSerialize(value));
}
