import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText, Upload, Trash2, Download, Loader2, ChevronDown } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Resource = { id: string; title: string; file_path: string | null; file_name: string | null; created_at: string; char_count: number | null };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith('.pdf')) {
    const pdfjs: any = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      parts.push(tc.items.map((it: any) => it.str).join(' '));
    }
    return parts.join('\n\n');
  }
  if (name.endsWith('.docx')) {
    const mammoth: any = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return r.value;
  }
  if (/\.(txt|md|csv)$/.test(name)) return new TextDecoder().decode(buf);
  throw new Error('Use PDF, Word (.docx), or text files.');
}

export function RmResourcesCard() {
  const { toast } = useToast();
  const [items, setItems] = useState<Resource[]>([]);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Resource | null>(null);
  // Pending "Replace the existing one?" question; resolve(true) = replace, false = keep both.
  const [dupAsk, setDupAsk] = useState<{ title: string; resolve: (replace: boolean) => void } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('rm-resources-open') !== '0'; } catch { return true; }
  });

  const toggle = () => setExpanded((v) => {
    try { localStorage.setItem('rm-resources-open', v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });

  const load = async () => {
    const { data, error } = await supabase.from('rm_resources')
      .select('id, title, file_path, file_name, created_at, char_count').order('created_at', { ascending: false });
    if (error) toast({ title: 'Could not load resources', description: error.message, variant: 'destructive' });
    else setItems((data ?? []) as Resource[]);
  };
  useEffect(() => { load(); }, []);

  const askReplace = (title: string) => new Promise<boolean>((resolve) => setDupAsk({ title, resolve }));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const known = [...items];
    for (const file of Array.from(files)) {
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error('This file is over 20 MB. Please upload a smaller file.');
        const text = (await extractText(file)).trim();
        if (!text) throw new Error('No readable text found (scanned images can’t be read).');
        if (text.length > MAX_TEXT_CHARS) throw new Error(`This file has ${text.length.toLocaleString()} characters of text; the limit is 500,000. Please split it into smaller files.`);
        const title = file.name.replace(/\.[^.]+$/, '');
        const existing = known.find((r) => r.title.trim().toLowerCase() === title.trim().toLowerCase());
        const replace = existing ? await askReplace(existing.title) : false;

        const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]/g, '_')}`;
        const up = await supabase.storage.from('rm-resources').upload(path, file, { contentType: file.type || undefined });
        if (up.error) throw up.error;
        const fields = { file_path: path, file_name: file.name, mime_type: file.type || null, content_text: text };
        if (replace && existing) {
          const { error } = await supabase.from('rm_resources').update(fields).eq('id', existing.id);
          if (error) { await supabase.storage.from('rm-resources').remove([path]); throw error; }
          if (existing.file_path) await supabase.storage.from('rm-resources').remove([existing.file_path]);
          existing.file_path = path;
          toast({ title: `Replaced ${existing.title}`, description: 'Markbot will learn the new version within a few minutes.' });
        } else {
          const { data: row, error } = await supabase.from('rm_resources')
            .insert({ title, ...fields, uploaded_by: user?.id }).select('id, title, file_path, file_name, created_at, char_count').single();
          if (error) { await supabase.storage.from('rm-resources').remove([path]); throw error; }
          if (row) known.push(row as Resource);
          toast({ title: `Uploaded ${file.name}`, description: 'Markbot will learn it within a few minutes.' });
        }
      } catch (e: any) {
        toast({ title: `Couldn't upload ${file.name}`, description: e.message, variant: 'destructive' });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    load();
  };

  const openFile = async (r: Resource) => {
    if (!r.file_path) return;
    const { data, error } = await supabase.storage.from('rm-resources').createSignedUrl(r.file_path, 300);
    if (error) return toast({ title: 'Could not open file', description: error.message, variant: 'destructive' });
    window.open(data.signedUrl, '_blank');
  };

  const remove = async () => {
    const r = toDelete; setToDelete(null);
    if (!r) return;
    const { error } = await supabase.from('rm_resources').delete().eq('id', r.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    if (r.file_path) await supabase.storage.from('rm-resources').remove([r.file_path]);
    toast({ title: 'Resource removed', description: 'Markbot will forget it shortly.' });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> RM Resources
              {!expanded && <span className="text-xs font-normal text-muted-foreground">({items.length})</span>}
            </CardTitle>
            <CardDescription>Shared guides for recruitment managers. Every admin can open them, and Markbot uses them when answering.</CardDescription>
          </div>
        </button>
        <Button onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />} Upload
        </Button>
        <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </CardHeader>
      <p className="px-6 -mt-3 pb-3 text-xs text-muted-foreground">Everyone with admin access can read these. Don't upload files with rates or personal data.</p>
      {expanded && (
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources yet. Upload PDF, Word (.docx) or text files. For Google Docs, use File → Download → PDF or Word.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} · {(r.char_count ?? 0).toLocaleString()} characters read</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openFile(r)} aria-label="Open"><Download className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(r)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
      <AlertDialog open={!!dupAsk} onOpenChange={(o) => { if (!o && dupAsk) { dupAsk.resolve(false); setDupAsk(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the existing one?</AlertDialogTitle>
            <AlertDialogDescription>A resource named "{dupAsk?.title}" already exists. Replace it with this file, or keep both as separate resources.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { dupAsk?.resolve(false); setDupAsk(null); }}>No, keep both</AlertDialogCancel>
            <AlertDialogAction onClick={() => { dupAsk?.resolve(true); setDupAsk(null); }}>Yes, replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This removes the file for everyone and Markbot will stop using it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
