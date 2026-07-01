// Encoding utility for check-in template items so we can support
// multiple answer types (checkbox / short answer / long answer) while
// keeping the underlying storage as a simple string[] for backwards
// compatibility with existing templates and DB rows.

export type CheckinItemType = 'check' | 'short' | 'long';

const PREFIX: Record<Exclude<CheckinItemType, 'check'>, string> = {
  short: '[[short]]',
  long: '[[long]]',
};

export function parseCheckinItem(raw: string): { type: CheckinItemType; text: string } {
  if (typeof raw !== 'string') return { type: 'check', text: String(raw ?? '') };
  if (raw.startsWith(PREFIX.short)) return { type: 'short', text: raw.slice(PREFIX.short.length) };
  if (raw.startsWith(PREFIX.long)) return { type: 'long', text: raw.slice(PREFIX.long.length) };
  return { type: 'check', text: raw };
}

export function encodeCheckinItem(text: string, type: CheckinItemType): string {
  const t = text ?? '';
  if (type === 'short') return PREFIX.short + t;
  if (type === 'long') return PREFIX.long + t;
  return t;
}

export function itemTypeLabel(t: CheckinItemType): string {
  return t === 'short' ? 'Short answer' : t === 'long' ? 'Long answer' : 'Checklist';
}
