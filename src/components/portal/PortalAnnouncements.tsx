import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AnnouncementContent } from './AnnouncementContent';
import { announcementVersion, canDismissAnnouncement, unreadAnnouncements, type PortalAnnouncement } from '@/lib/portalAnnouncements';
import { ChevronRight, Loader2 } from 'lucide-react';

export function PortalAnnouncements({ showList }: { showList: boolean }) {
  const [items, setItems] = useState<PortalAnnouncement[]>([]);
  const [pending, setPending] = useState<PortalAnnouncement[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      const [announcements, reads] = await Promise.all([
        // RLS permits published messages and only this account's private sample.
        supabase.from('portal_announcements').select('*, portal_announcement_files(*)').or('published_at.not.is.null,sample_at.not.is.null').order('created_at', { ascending: false }),
        supabase.from('portal_announcement_reads').select('announcement_id, published_at, acknowledged'),
      ]);
      if (!live) return;
      if (announcements.error || reads.error) { setError('Announcements could not be loaded. Please refresh to try again.'); return; }
      const data = announcements.data || [];
      setItems(data); setPending(unreadAnnouncements(data, reads.data || []));
    }
    void load(); return () => { live = false; };
  }, []);
  const current = pending[0];
  useEffect(() => { setAcknowledged(false); }, [current?.id]);
  const dismiss = async () => {
    const version = current && announcementVersion(current);
    if (!current || !version || busy || !canDismissAnnouncement(current, acknowledged)) return;
    setBusy(true); setError('');
    const { error } = await supabase.from('portal_announcement_reads').upsert({ announcement_id: current.id, published_at: version, acknowledged: current.requires_acknowledgement === true && acknowledged }, { onConflict: 'user_id,announcement_id,published_at' });
    if (error) setError('Could not save. Please try again.'); else setPending(p => p.slice(1));
    setBusy(false);
  };
  return <>
    {showList && <section className="max-w-3xl py-4" aria-label="Published announcements">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {items.map(a => <div key={a.id} className="border-b"><Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-3 py-4 text-left" aria-expanded={expanded === a.id} onClick={() => setExpanded(p => p === a.id ? null : a.id)}><ChevronRight className={`h-4 w-4 shrink-0 ${expanded === a.id ? 'rotate-90' : ''}`} /><span className="flex min-w-0 flex-1 flex-wrap justify-between gap-2"><span className="font-semibold break-words">{a.title}</span><time className="text-xs text-muted-foreground">{new Date(a.published_at || a.created_at).toLocaleDateString()}</time></span></Button>{expanded === a.id && <div className="px-3 pb-6"><AnnouncementContent announcement={a} /></div>}</div>)}
    </section>}
    <Dialog open={!!current} onOpenChange={v => { if (!v && !current?.requires_acknowledgement) void dismiss(); }}><DialogContent showCloseButton={!current?.requires_acknowledgement && !busy} onEscapeKeyDown={e => { if (current?.requires_acknowledgement || busy) e.preventDefault(); }} onInteractOutside={e => { if (current?.requires_acknowledgement || busy) e.preventDefault(); }} className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{current?.title}</DialogTitle><DialogDescription>{current?.published_at ? new Date(current.published_at).toLocaleDateString() : 'Announcement'}</DialogDescription></DialogHeader>{current && <AnnouncementContent announcement={current} />}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{current?.requires_acknowledgement && <div className="flex items-start gap-3 border-t pt-4"><Checkbox id="announcement-understood" checked={acknowledged} onCheckedChange={v => setAcknowledged(v === true)} disabled={busy} /><Label htmlFor="announcement-understood" className="leading-relaxed">I have read and understood this announcement.</Label></div>}<div className="flex justify-end"><Button disabled={busy || (!!current && !canDismissAnnouncement(current, acknowledged))} onClick={dismiss}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{current?.requires_acknowledgement ? 'Acknowledge and continue' : 'Close'}</Button></div></DialogContent></Dialog>
  </>;
}