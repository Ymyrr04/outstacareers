import { z } from 'zod';
export const announcementSchema = z.object({ title: z.string().trim().min(1).max(200), body_html: z.string().max(100000) });
export const announcementFileTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
export function validateAnnouncementFile(file: { name: string; size: number; type: string }) {
  if (!file.name || file.name.length > 255 || !announcementFileTypes.includes(file.type)) return 'Choose an image, PDF, text or Office document.';
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) return 'Files must be non-empty and no larger than 20 MB.';
  return null;
}
export type AnnouncementFile = { id: string; announcement_id: string; name: string; path: string; mime_type: string; size: number };
export type PortalAnnouncement = { id: string; title: string; body_html: string; published_at: string | null; created_at: string; portal_announcement_files: AnnouncementFile[] };
export function unreadAnnouncements(items: PortalAnnouncement[], reads: { announcement_id: string; published_at: string }[]) {
  return items.filter(a => a.published_at && !reads.some(r => r.announcement_id === a.id && r.published_at === a.published_at));
}