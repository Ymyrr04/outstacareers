import { test } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { addClientProfileSection, canAddProfileSection, isStandardProfileSectionTitle, loadClientProfileSections, clientProfileSectionsHtml, isRetiredProfileSectionTitle } from './clientProfileSections';

test('new profiles preserve legacy description under overview after the top fields', () => {
  const sections = loadClientProfileSections(null, '<p>Existing company facts</p>');
  strictEqual(sections.length, 6);
  strictEqual(sections[2].content, '<p>Existing company facts</p>');
  ok(sections.filter(section => section.id !== 'default-0').every(section => section.content === ''));
});

test('additional sections are retained on reload without replacing existing answers', () => {
  const sections = loadClientProfileSections(null, 'Existing description');
  const added = addClientProfileSection(sections, ' Extra criteria ', 'custom-1');
  strictEqual(added.length, 7);
  strictEqual(sections.length, 6);
  deepStrictEqual(loadClientProfileSections(added, null), added);
  strictEqual(added[4].title, 'Extra criteria');
  strictEqual(added[5].title, 'MATCHING CRITERIA');
  strictEqual(added[6].title, 'OTHERS');
  strictEqual(added[2].content, 'Existing description');
});

test('blank or duplicate section names do not create sections and HTML escapes added headings', () => {
  const sections = loadClientProfileSections(null, null);
  strictEqual(addClientProfileSection(sections, '  ', 'blank').length, 6);
  strictEqual(addClientProfileSection(sections, 'others', 'dupe').length, 6);
  strictEqual(addClientProfileSection(sections, 'MATCHING CRITERIA', 'dupe2').length, 6);
  ok(!canAddProfileSection(sections, ' Matching Criteria '));
  ok(canAddProfileSection(sections, 'Extra criteria'));
  ok(clientProfileSectionsHtml([{ id: 'safe', title: '<script>', content: '<p>Saved facts</p>' }]).includes('&lt;script&gt;'));
});

test('Rate and Time zone lead existing profiles without duplicating fields or losing saved content', () => {
  const existing = [{ id: 'overview', title: 'CLIENT OVERVIEW', content: 'Saved overview' }, { id: 'rate', title: 'Rate', content: '$12/hour' }];
  const loaded = loadClientProfileSections(existing, null);
  deepStrictEqual(loaded.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW', 'MATCHING CRITERIA', 'OTHERS']);
  strictEqual(loaded[0].content, '$12/hour');
  strictEqual(loaded[2].content, 'Saved overview');
  deepStrictEqual(loadClientProfileSections(loaded, null), loaded);
});

test('profiles saved with OTHERS but no matching criteria gain it above others', () => {
  const stored = [
    { id: 'overview', title: 'CLIENT OVERVIEW', content: '<p>Facts</p>' },
    { id: 'extra', title: 'Extra criteria', content: '<p>Kept</p>' },
    { id: 'profile-field-others', title: 'OTHERS', content: '<p>Kept notes</p>' },
  ];
  const loaded = loadClientProfileSections(stored, null);
  deepStrictEqual(loaded.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW', 'Extra criteria', 'MATCHING CRITERIA', 'OTHERS']);
  strictEqual(loaded[5].content, '<p>Kept notes</p>');
  strictEqual(loaded[5].id, 'profile-field-others');
  deepStrictEqual(loadClientProfileSections(loaded, null), loaded);
});

test('retired character and chemistry sections never show and a stored matching criteria answer moves above others', () => {
  const stored = [
    { id: 'overview', title: 'CLIENT OVERVIEW', content: '<p>Saved facts</p>' },
    { id: 'matching', title: 'MATCHING CRITERIA', content: '<p>Old answer</p>' },
    { id: 'character', title: 'Character — Values & Work Ethic', content: '<p>Old answer</p>' },
    { id: 'chemistry', title: 'Chemistry — Working Style Compatibility', content: '<p>Old answer</p>' },
    { id: 'extra', title: 'Extra criteria', content: '<p>Kept</p>' },
  ];
  const loaded = loadClientProfileSections(stored, null);
  deepStrictEqual(loaded.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW', 'Extra criteria', 'MATCHING CRITERIA', 'OTHERS']);
  strictEqual(loaded[2].content, '<p>Saved facts</p>');
  strictEqual(loaded[3].content, '<p>Kept</p>');
  strictEqual(loaded[4].id, 'matching');
  strictEqual(loaded[4].content, '<p>Old answer</p>');
  ok(!clientProfileSectionsHtml(loaded).includes('Values &amp; Work Ethic'));
  ok(!clientProfileSectionsHtml(loaded).includes('Working Style Compatibility'));
});

test('new profiles end with matching criteria then others and retired names cannot be added back', () => {
  const fresh = loadClientProfileSections(null, null);
  deepStrictEqual(fresh.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW', 'CLIENT PERSONALITY & WORKING STYLE', 'MATCHING CRITERIA', 'OTHERS']);
  strictEqual(addClientProfileSection(fresh, 'character - values & work ethic', 'nope').length, 6);
  strictEqual(addClientProfileSection(fresh, 'Chemistry — Working Style Compatibility', 'nope2').length, 6);
  ok(isRetiredProfileSectionTitle('Chemistry — Working Style Compatibility'));
  ok(!isRetiredProfileSectionTitle('Extra criteria'));
  ok(isStandardProfileSectionTitle('matching criteria'));
  ok(!isStandardProfileSectionTitle('Extra criteria'));
});
