import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { announcementVersion, announcementSchema, canDismissAnnouncement, validateAnnouncementFile, unreadAnnouncements, type PortalAnnouncement } from './portalAnnouncements';
test('announcements support text', () => {
  strictEqual(announcementSchema.parse({ title: 'Update', body_html: '<p>Message</p>' }).body_html, '<p>Message</p>');
});
test('must-read announcements cannot close until read and understood is confirmed', () => {
  const a: PortalAnnouncement = { id: 'required', title: 'Update', body_html: '', created_at: '', published_at: '2026-10-29T14:14:00Z', requires_acknowledgement: true, portal_announcement_files: [] };
  strictEqual(canDismissAnnouncement(a, false), false);
  strictEqual(canDismissAnnouncement(a, true), true);
  deepStrictEqual(unreadAnnouncements([a], [{ announcement_id: a.id, published_at: a.published_at || '', acknowledged: false }]), [a]);
  deepStrictEqual(unreadAnnouncements([a], [{ announcement_id: a.id, published_at: a.published_at || '', acknowledged: true }]), []);
});
test('general announcements allow closing without acknowledgement', () => {
  const a: PortalAnnouncement = { id: 'general', title: 'Update', body_html: '', created_at: '', published_at: '2026-10-29T14:14:00Z', requires_acknowledgement: false, portal_announcement_files: [] };
  strictEqual(canDismissAnnouncement(a, false), true);
  deepStrictEqual(unreadAnnouncements([a], [{ announcement_id: a.id, published_at: a.published_at || '', acknowledged: false }]), []);
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
test('a private sample pops up without publishing the draft and dismisses by its sample version', () => {
  const a: PortalAnnouncement = { id: 'sample', title: 'Update', body_html: 'Message', created_at: '2026-10-29', published_at: null, sample_at: '2026-10-29T13:42:00Z', sample_user_id: 'recipient', portal_announcement_files: [] };
  strictEqual(a.published_at, null);
  deepStrictEqual(unreadAnnouncements([a], []), [a]);
  deepStrictEqual(unreadAnnouncements([a], [{ announcement_id: a.id, published_at: '2026-10-29T13:42:00Z' }]), []);
  strictEqual(announcementVersion({ ...a, published_at: '2026-10-30T12:00:00Z' }), '2026-10-30T12:00:00Z');
});