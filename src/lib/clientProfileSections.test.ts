import { test } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { addClientProfileSection, loadClientProfileSections, clientProfileSectionsHtml } from './clientProfileSections';

test('new profiles preserve legacy description under overview after the top fields', () => {
  const sections = loadClientProfileSections(null, '<p>Existing company facts</p>');
  strictEqual(sections.length, 7);
  strictEqual(sections[2].content, '<p>Existing company facts</p>');
  ok(sections.filter(section => section.id !== 'default-0').every(section => section.content === ''));
});
test('additional sections are retained on reload without replacing existing answers', () => {
  const sections = loadClientProfileSections(null, 'Existing description');
  const added = addClientProfileSection(sections, ' Extra criteria ', 'custom-1');
  strictEqual(added.length, 8);
  strictEqual(sections.length, 7);
  deepStrictEqual(loadClientProfileSections(added, null), added);
  strictEqual(added[7].title, 'Extra criteria');
  strictEqual(added[2].content, 'Existing description');
});
test('blank section names do not create sections and HTML escapes added headings', () => {
  const sections = loadClientProfileSections(null, null);
  strictEqual(addClientProfileSection(sections, '  ', 'blank').length, 7);
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