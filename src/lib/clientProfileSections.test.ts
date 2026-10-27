import { test } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { addClientProfileSection, loadClientProfileSections, clientProfileSectionsHtml, isRetiredProfileSectionTitle } from './clientProfileSections';

test('new profiles preserve legacy description under overview after the top fields', () => {
  const sections = loadClientProfileSections(null, '<p>Existing company facts</p>');
  strictEqual(sections.length, 4);
  strictEqual(sections[2].content, '<p>Existing company facts</p>');
  ok(sections.filter(section => section.id !== 'default-0').every(section => section.content === ''));
});
test('additional sections are retained on reload without replacing existing answers', () => {
  const sections = loadClientProfileSections(null, 'Existing description');
  const added = addClientProfileSection(sections, ' Extra criteria ', 'custom-1');
  strictEqual(added.length, 5);
  strictEqual(sections.length, 4);
  deepStrictEqual(loadClientProfileSections(added, null), added);
  strictEqual(added[4].title, 'Extra criteria');
  strictEqual(added[2].content, 'Existing description');
});
test('blank section names do not create sections and HTML escapes added headings', () => {
  const sections = loadClientProfileSections(null, null);
  strictEqual(addClientProfileSection(sections, '  ', 'blank').length, 4);
  ok(clientProfileSectionsHtml([{ id: 'safe', title: '<script>', content: '<p>Saved facts</p>' }]).includes('&lt;script&gt;'));
});

test('Rate and Time zone lead existing profiles without duplicating fields or losing saved content', () => {
  const existing = [{ id: 'overview', title: 'CLIENT OVERVIEW', content: 'Saved overview' }, { id: 'rate', title: 'Rate', content: '$12/hour' }];
  const loaded = loadClientProfileSections(existing, null);
  deepStrictEqual(loaded.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW']);
  strictEqual(loaded[0].content, '$12/hour');
  strictEqual(loaded[2].content, 'Saved overview');
  deepStrictEqual(loadClientProfileSections(loaded, null), loaded);
});

test('retired criteria sections never show, even when an older profile still stores them', () => {
  const stored = [
    { id: 'overview', title: 'CLIENT OVERVIEW', content: '<p>Saved facts</p>' },
    { id: 'matching', title: 'MATCHING CRITERIA', content: '<p>Old answer</p>' },
    { id: 'character', title: 'Character — Values & Work Ethic', content: '<p>Old answer</p>' },
    { id: 'chemistry', title: 'Chemistry — Working Style Compatibility', content: '<p>Old answer</p>' },
    { id: 'extra', title: 'Extra criteria', content: '<p>Kept</p>' },
  ];
  const loaded = loadClientProfileSections(stored, null);
  deepStrictEqual(loaded.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW', 'Extra criteria']);
  strictEqual(loaded[2].content, '<p>Saved facts</p>');
  strictEqual(loaded[3].content, '<p>Kept</p>');
  ok(!clientProfileSectionsHtml(loaded).includes('MATCHING CRITERIA'));
});

test('new profiles contain no criteria sections and retired names cannot be added back', () => {
  const fresh = loadClientProfileSections(null, null);
  deepStrictEqual(fresh.map(section => section.title), ['Rate', 'Time zone', 'CLIENT OVERVIEW', 'CLIENT PERSONALITY & WORKING STYLE']);
  strictEqual(addClientProfileSection(fresh, 'Matching Criteria', 'nope').length, 4);
  strictEqual(addClientProfileSection(fresh, 'character - values & work ethic', 'nope2').length, 4);
  ok(isRetiredProfileSectionTitle('Chemistry — Working Style Compatibility'));
  ok(!isRetiredProfileSectionTitle('Extra criteria'));
});
