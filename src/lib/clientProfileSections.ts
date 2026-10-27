export interface ClientProfileSection {
  id: string;
  title: string;
  content: string;
}

const defaultTitles = [
  'CLIENT OVERVIEW',
  'CLIENT PERSONALITY & WORKING STYLE',
  'MATCHING CRITERIA',
  'OTHERS',
];

const normalizeTitle = (title: string) =>
  title.trim().toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');

// The sections that always close a profile, in this order. A profile that
// predates one gains it in the right place, and an older saved copy is moved
// back into position rather than left mid-profile.
const standardTailTitles = ['MATCHING CRITERIA', 'OTHERS'];

// Retired profile sections: hidden from every profile, even when an older
// client record still stores them.
const retiredTitles = new Set([
  'character - values & work ethic',
  'chemistry - working style compatibility',
]);

export function isRetiredProfileSectionTitle(title: string): boolean {
  return retiredTitles.has(normalizeTitle(title));
}

export function isStandardProfileSectionTitle(title: string): boolean {
  return standardTailTitles.some(standard => normalizeTitle(standard) === normalizeTitle(title));
}

function withTopFields(sections: ClientProfileSection[]): ClientProfileSection[] {
  const fields = ['Rate', 'Time zone'].map((title, index) =>
    sections.find(section => section.title.trim().toLowerCase() === title.toLowerCase()) ||
    { id: `profile-field-${index}`, title, content: '' });
  const fieldIds = new Set(fields.map(field => field.id));
  const middle = sections.filter(section => !fieldIds.has(section.id));
  const tail = standardTailTitles.map(title => {
    const stored = middle.find(section => normalizeTitle(section.title) === normalizeTitle(title));
    return stored
      ? { ...stored, title }
      : { id: `profile-field-${normalizeTitle(title).replace(/\s+/g, '-')}`, title, content: '' };
  });
  const tailIds = new Set(tail.map(section => section.id));
  const custom = middle.filter(section => !tailIds.has(section.id) && !isStandardProfileSectionTitle(section.title));
  return [...fields, ...custom, ...tail];
}

export function loadClientProfileSections(value: unknown, legacyProfile: string | null): ClientProfileSection[] {
  if (Array.isArray(value)) {
    const sections = value.filter((item): item is ClientProfileSection =>
      !!item && typeof item === 'object' && typeof item.id === 'string' &&
      typeof item.title === 'string' && typeof item.content === 'string')
      .filter(section => !isRetiredProfileSectionTitle(section.title));
    if (sections.length) return withTopFields(sections.map(section => ({ ...section })));
  }
  return withTopFields(defaultTitles.map((title, index) => ({
    id: `default-${index}`, title, content: index === 0 ? legacyProfile || '' : '',
  })));
}

export function canAddProfileSection(sections: ClientProfileSection[], title: string): boolean {
  const clean = title.trim();
  if (!clean || isRetiredProfileSectionTitle(clean)) return false;
  const normalized = normalizeTitle(clean);
  return ![...sections.map(section => section.title), ...standardTailTitles]
    .some(existing => normalizeTitle(existing) === normalized);
}

export function addClientProfileSection(sections: ClientProfileSection[], title: string, id: string): ClientProfileSection[] {
  if (!canAddProfileSection(sections, title)) return sections;
  const added: ClientProfileSection = { id, title: title.trim(), content: '' };
  // New sections sit above the standard closing sections so their order holds.
  const index = sections.findIndex(section => isStandardProfileSectionTitle(section.title));
  return index === -1
    ? [...sections, added]
    : [...sections.slice(0, index), added, ...sections.slice(index)];
}

export function clientProfileSectionsHtml(sections: ClientProfileSection[]): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return sections.map(section => `<h3>${escape(section.title)}</h3>${section.content}`).join('\n');
}
