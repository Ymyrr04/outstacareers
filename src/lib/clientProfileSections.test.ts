import { test } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { addClientProfileSection, loadClientProfileSections, clientProfileSectionsHtml } from './clientProfileSections';

test('new profiles provide five sections and preserve legacy description in the first', () => {
  const sections = loadClientProfileSections(null, '<p>Existing company facts</p>');
  strictEqual(sections.length, 5);
  strictEqual(sections[0].content, '<p>Existing company facts</p>');
  ok(sections.slice(1).every(section => section.content === ''));
});
test('additional sections are retained on reload without replacing existing answers', () => {
  const sections = loadClientProfileSections(null, 'Existing description');
  const added = addClientProfileSection(sections, ' Extra criteria ', 'custom-1');
  strictEqual(added.length, 6);
  strictEqual(sections.length, 5);
  deepStrictEqual(loadClientProfileSections(added, null), added);
  strictEqual(added[5].title, 'Extra criteria');
  strictEqual(added[0].content, 'Existing description');
});
test('blank section names do not create sections and HTML escapes added headings', () => {
  const sections = loadClientProfileSections(null, null);
  strictEqual(addClientProfileSection(sections, '  ', 'blank').length, 5);
  ok(clientProfileSectionsHtml([{ id: 'safe', title: '<script>', content: '<p>Saved facts</p>' }]).includes('&lt;script&gt;'));
});