import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AnnouncementContent } from './AnnouncementContent';
import { announcementVersion, unreadAnnouncements, type PortalAnnouncement } from '@/lib/portalAnnouncements';
import { ChevronRight, Loader2 } from 'lucide-react';

export function PortalAnnouncements({ showList }: { showList: boolean }) {
  const [items, setItems] = useState<PortalAnnouncement[]>([]);
  const [pending, setPending] = useState<PortalAnnouncement[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      const [announcements, reads] = await Promise.all([
        // RLS permits published messages and only this account's private sample.
        supabase.from('portal_announcements').select('*, portal_announcement_files(*)').or('published_at.not.is.null,sample_at.not.is.null').order('created_at', { ascending: false }),
        supabase.from('portal_announcement_reads').select('announcement_id, published_at'),
      ]);
      if (!live) return;
      if (announcements.error || reads.error) { setError('Announcements could not be loaded. Please refresh to try again.'); return; }
      const data = announcements.data || [];
      setItems(data); setPending(unreadAnnouncements(data, reads.data || []));
    }
    void load(); return () => { live = false; };
  }, []);
  const current = pending[0];
  const dismiss = async () => {
    const version = current && announcementVersion(current);
    if (!current || !version || busy) return;
    setBusy(true); setError('');
    const { error } = await supabase.from('portal_announcement_reads').upsert({ announcement_id: current.id, published_at: version }, { onConflict: 'user_id,announcement_id,published_at', ignoreDuplicates: true });
    if (error) setError('Could not save. Please try again.'); else setPending(p => p.slice(1));
    setBusy(false);
  };
  return <>
    {showList && <section className="max-w-3xl py-4" aria-label="Published announcements">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {items.map(a => <div key={a.id} className="border-b"><Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-3 py-4 text-left" aria-expanded={expanded === a.id} onClick={() => setExpanded(p => p === a.id ? null : a.id)}><ChevronRight className={`h-4 w-4 shrink-0 ${expanded === a.id ? 'rotate-90' : ''}`} /><span className="flex min-w-0 flex-1 flex-wrap justify-between gap-2"><span className="font-semibold break-words">{a.title}</span><time className="text-xs text-muted-foreground">{new Date(a.published_at || a.created_at).toLocaleDateString()}</time></span></Button>{expanded === a.id && <div className="px-3 pb-6"><AnnouncementContent announcement={a} /></div>}</div>)}
    </section>}
    <Dialog open={!!current} onOpenChange={v => { if (!v) void dismiss(); }}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{current?.title}</DialogTitle><DialogDescription>{current?.published_at ? new Date(current.published_at).toLocaleDateString() : 'Announcement'}</DialogDescription></DialogHeader>{current && <AnnouncementContent announcement={current} />}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end"><Button disabled={busy} onClick={dismiss}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Continue</Button></div></DialogContent></Dialog>
  </>;
}