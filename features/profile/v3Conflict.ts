import type { ApplicantProfileV3 } from './v3.ts';
import { canonicalSerialize } from '../applicationAssessment/serverExecution.ts';

export type ProfileConflictField = {
  path: string;
  baseValue: unknown;
  localValue: unknown;
  serverValue: unknown;
};

export type ApplicantProfileV3ConflictComparison = {
  serverRevision: number;
  serverVersion: ApplicantProfileV3;
  localEditedVersion: ApplicantProfileV3;
  conflictingFields: ProfileConflictField[];
  nonConflictingFields: ProfileConflictField[];
  autoMergeSafeFields: string[];
  requiresUserChoiceFields: string[];
};

function flatten(value: unknown, path = '', output = new Map<string, unknown>()): Map<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    output.set(path, value);
    return output;
  }
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (!path && ['revision', 'schemaVersion'].includes(key)) continue;
    flatten((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key, output);
  }
  return output;
}

const equal = (left: unknown, right: unknown) => left === undefined || right === undefined
  ? left === right
  : canonicalSerialize(left) === canonicalSerialize(right);

export function compareApplicantProfileV3Conflict(input: {
  base: ApplicantProfileV3;
  local: ApplicantProfileV3;
  server: ApplicantProfileV3;
  serverRevision: number;
}): ApplicantProfileV3ConflictComparison {
  const base = flatten(input.base), local = flatten(input.local), server = flatten(input.server);
  const paths = [...new Set([...base.keys(), ...local.keys(), ...server.keys()])].sort();
  const conflictingFields: ProfileConflictField[] = [];
  const nonConflictingFields: ProfileConflictField[] = [];
  for (const path of paths) {
    const detail = { path, baseValue: base.get(path), localValue: local.get(path), serverValue: server.get(path) };
    const localChanged = !equal(detail.baseValue, detail.localValue);
    const serverChanged = !equal(detail.baseValue, detail.serverValue);
    if (localChanged && serverChanged && !equal(detail.localValue, detail.serverValue)) conflictingFields.push(detail);
    else if (localChanged || serverChanged) nonConflictingFields.push(detail);
  }
  return {
    serverRevision: input.serverRevision,
    serverVersion: input.server,
    localEditedVersion: input.local,
    conflictingFields,
    nonConflictingFields,
    autoMergeSafeFields: nonConflictingFields.map(field => field.path),
    requiresUserChoiceFields: conflictingFields.map(field => field.path),
  };
}
