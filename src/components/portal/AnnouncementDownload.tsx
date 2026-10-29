import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import type { AnnouncementFile } from '@/lib/portalAnnouncements';

export function AnnouncementDownload({ file }: { file: AnnouncementFile }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setBlob(null); setError('');
    void supabase.storage.from('portal-announcements').download(file.path).then(({ data, error }) => {
      if (!live) return;
      if (error || !data) setError('File could not be loaded. Try again.');
      else setBlob(data);
    }).catch(() => { if (live) setError('File could not be loaded. Try again.'); });
    return () => { live = false; };
  }, [file.path, attempt]);

  const download = async () => {
    if (!blob) return;
    setError('');
    const downloadable = new File([blob], file.name, { type: blob.type || file.mime_type });
    if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [downloadable] })) {
      try { await navigator.share({ files: [downloadable], title: file.name }); return; }
      catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return <div className="space-y-1">
    <Button variant="outline" size="sm" className="max-w-full" disabled={!blob && !error}
      onClick={() => { if (error && !blob) setAttempt(a => a + 1); else void download(); }}>
      {error && !blob ? <RefreshCw className="mr-2 h-4 w-4 shrink-0" /> : blob ? <Download className="mr-2 h-4 w-4 shrink-0" /> : <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />}
      <span className="truncate">{file.name}</span>
    </Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}