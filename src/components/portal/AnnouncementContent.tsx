import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FormattedNotes } from '@/components/FormattedNotes';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import type { PortalAnnouncement } from '@/lib/portalAnnouncements';

export function AnnouncementContent({ announcement }: { announcement: PortalAnnouncement }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setUrls({}); setError(false);
    Promise.all(announcement.portal_announcement_files.map(async f => {
      const { data, error } = await supabase.storage.from('portal-announcements').createSignedUrl(f.path, 3600);
      if (error) throw error;
      return [f.id, data.signedUrl];
    })).then(entries => { if (live) setUrls(Object.fromEntries(entries)); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [announcement]);
  return <div className="space-y-4">
    <FormattedNotes content={announcement.body_html} preserveFormatting announcementImages={urls} />
    {error && <p role="alert" className="text-sm text-destructive">Files could not be loaded. Please reopen the announcement to try again.</p>}
    {announcement.portal_announcement_files.map(f => <div key={f.id} className="space-y-2">
      {f.mime_type.startsWith('image/') && urls[f.id] && !announcement.body_html.includes(`data-file-id="${f.id}"`) && <img src={urls[f.id]} alt={f.name} className="max-h-96 max-w-full object-contain rounded-md" />}
      {urls[f.id] ? <Button variant="outline" size="sm" asChild><a href={urls[f.id]} target="_blank" rel="noopener noreferrer" className="max-w-full"><Download className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">{f.name}</span></a></Button> : !error && <Loader2 aria-label="Loading file" className="h-4 w-4 animate-spin" />}
    </div>)}
  </div>;
}