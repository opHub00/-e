/** Event-MVP provisional operation setting; legal retention policy is not yet finalized. */
export const EVENT_CONTACT_PROVISIONAL_RETENTION_DAYS = 7;
export const EVENT_CONTACT_CONSENT_VERSION = 'event-result-2026-10-v1';
export const EVENT_CONTACT_PURPOSE = 'RESULT_DELIVERY_AND_CONSULTATION_FOLLOWUP';

export type DeliveryStatus = 'REQUESTED' | 'PROVIDER_UNCONFIGURED' | 'SENDING' | 'SENT' | 'FAILED' | 'EXPIRED';
export type DeliveryChannel = 'SMS';
export type ContactRegistration = {
  token: string;
  claim: string;
  name: string;
  phone: string;
  consent: true;
};

export function normalizeKoreanMobile(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^010\d{8}$/.test(compact)) return `+82${compact.slice(1)}`;
  if (/^\+8210\d{8}$/.test(compact)) return compact;
  return null;
}

export function parseContactRegistration(value: unknown): ContactRegistration | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['token', 'claim', 'name', 'phone', 'consent'].includes(key))) return null;
  if (row.consent !== true || typeof row.token !== 'string' || !/^[a-f0-9]{64}$/.test(row.token)
    || typeof row.claim !== 'string' || !/^[a-f0-9]{64}$/.test(row.claim)) return null;
  if (typeof row.name !== 'string' || typeof row.phone !== 'string') return null;
  const name = row.name.trim().normalize('NFC');
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f<>]/.test(name) || !normalizeKoreanMobile(row.phone)) return null;
  return { token: row.token, claim: row.claim, name, phone: row.phone, consent: true };
}

export function maskKoreanMobile(e164: string): string {
  const digits = e164.replace(/^\+82/, '0');
  return /^010\d{8}$/.test(digits) ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '연락처 비공개';
}
