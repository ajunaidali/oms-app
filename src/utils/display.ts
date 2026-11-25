import { getDisplayName, getRecordId } from './apiHelpers';

export function show(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map(item => show(item)).join(', ');
  }
  return getDisplayName(value);
}

export function recordId(record: any): string {
  return getRecordId(record);
}

export function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function titleCase(value: unknown): string {
  const text = show(value);
  if (text === '—') return text;
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'OT';
  return parts
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
}

export function rowsFromPayload(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const nested = Object.values(data).find(value => Array.isArray(value));
    if (Array.isArray(nested)) return nested;
    return [data];
  }
  return [];
}

export function detailEntries(record: any, skip: string[] = []): Array<[string, string]> {
  if (!record || typeof record !== 'object') return [];
  const hidden = new Set(['_id', '__v', 'id', 'password', 'refreshToken', 'token', ...skip]);
  return Object.entries(record)
    .filter(([key, value]) => !hidden.has(key) && value != null && value !== '')
    .map(([key, value]) => {
      if (typeof value === 'object') return [key, show(value)] as [string, string];
      return [key, String(value)] as [string, string];
    });
}
