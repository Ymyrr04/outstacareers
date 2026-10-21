export interface ClientProfileSection {
  id: string;
  title: string;
  content: string;
}

const defaultTitles = [
  'CLIENT OVERVIEW',
  'CLIENT PERSONALITY & WORKING STYLE',
  'MATCHING CRITERIA',
  'Character — Values & Work Ethic',
  'Chemistry — Working Style Compatibility',
];

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
      typeof item.title === 'string' && typeof item.content === 'string');
    if (sections.length) return withTopFields(sections.map(section => ({ ...section })));
  }
  return withTopFields(defaultTitles.map((title, index) => ({
    id: `default-${index}`, title, content: index === 0 ? legacyProfile || '' : '',
  })));
}

export function addClientProfileSection(sections: ClientProfileSection[], title: string, id: string): ClientProfileSection[] {
  return title.trim() ? [...sections, { id, title: title.trim(), content: '' }] : sections;
}

export function clientProfileSectionsHtml(sections: ClientProfileSection[]): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return sections.map(section => `<h3>${escape(section.title)}</h3>${section.content}`).join('\n');
}