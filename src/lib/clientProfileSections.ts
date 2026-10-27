export interface ClientProfileSection {
  id: string;
  title: string;
  content: string;
}

const defaultTitles = [
  'CLIENT OVERVIEW',
  'CLIENT PERSONALITY & WORKING STYLE',
];

const normalizeTitle = (title: string) =>
  title.trim().toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');

// Retired profile sections: hidden from every profile, even when an older
// client record still stores them.
const retiredTitles = new Set([
  'matching criteria',
  'character - values & work ethic',
  'chemistry - working style compatibility',
]);

export function isRetiredProfileSectionTitle(title: string): boolean {
  return retiredTitles.has(normalizeTitle(title));
}

function withTopFields(sections: ClientProfileSection[]): ClientProfileSection[] {
  const fields = ['Rate', 'Time zone'].map((title, index) =>
    sections.find(section => section.title.trim().toLowerCase() === title.toLowerCase()) ||
    { id: `profile-field-${index}`, title, content: '' });
  const fieldIds = new Set(fields.map(field => field.id));
  return [...fields, ...sections.filter(section => !fieldIds.has(section.id))];
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

export function addClientProfileSection(sections: ClientProfileSection[], title: string, id: string): ClientProfileSection[] {
  return title.trim() && !isRetiredProfileSectionTitle(title) ? [...sections, { id, title: title.trim(), content: '' }] : sections;
}

export function clientProfileSectionsHtml(sections: ClientProfileSection[]): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return sections.map(section => `<h3>${escape(section.title)}</h3>${section.content}`).join('\n');
}
