import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { announcementSchema, validateAnnouncementFile, unreadAnnouncements, type PortalAnnouncement } from './portalAnnouncements';
test('announcements support text', () => {
  strictEqual(announcementSchema.parse({ title: 'Update', body_html: '<p>Message</p>' }).body_html, '<p>Message</p>');
});
test('announcements support uploaded images', () => {
  strictEqual(validateAnnouncementFile({ name: 'notice.png', type: 'image/png', size: 100 }), null);
});
test('announcements support document attachments', () => {
  strictEqual(validateAnnouncementFile({ name: 'notice.pdf', type: 'application/pdf', size: 100 }), null);
});
test('new announcements pop up until read and remain available to reread', () => {
  const a: PortalAnnouncement = { id: 'a', title: 'Update', body_html: 'Message', created_at: '2026-10-29', published_at: '2026-10-29T12:45:00Z', portal_announcement_files: [] };
  const items = [a];
  deepStrictEqual(unreadAnnouncements(items, []), [a]);
  deepStrictEqual(unreadAnnouncements(items, [{ announcement_id: 'a', published_at: '2026-10-29T12:45:00Z' }]), []);
  strictEqual(items.length, 1);
});