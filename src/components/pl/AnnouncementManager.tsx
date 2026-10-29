import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NotesEditor } from '@/components/NotesEditor';
import { NewsletterImage } from './NewsletterImage';
import type { Editor } from '@tiptap/core';
import { AnnouncementContent } from '@/components/portal/AnnouncementContent';
import { announcementSchema, announcementFileTypes, validateAnnouncementFile, type PortalAnnouncement } from '@/lib/portalAnnouncements';
import { useToast } from '@/hooks/use-toast';
import { Plus, Paperclip, Pencil, Eye, Send, X, Loader2 } from 'lucide-react';

export function AnnouncementManager() {
  const [items, setItems] = useState<PortalAnnouncement[]>([]);
  const [editing, setEditing] = useState<PortalAnnouncement | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PortalAnnouncement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const fileIds = useRef(new WeakMap<File, string>());
  const localUrls = useRef<string[]>([]);
  const [imageWidth, setImageWidth] = useState(500);
  const [selectedImage, setSelectedImage] = useState(false);
  useEffect(() => () => { localUrls.current.forEach(URL.revokeObjectURL); }, []);
  const insertImage = (id: string, url: string, name: string) => {
    editorRef.current?.chain().focus().insertContent({ type: 'newsletterImage', attrs: { src: url, fileId: id, alt: name, width: 500 } }).run();
  };
  const { toast } = useToast();
  const load = async () => {
    const { data, error } = await supabase.from('portal_announcements').select('*, portal_announcement_files(*)').order('created_at', { ascending: false });
    if (error) toast({ title: 'Announcements could not be loaded', variant: 'destructive' });
    else setItems(data || []);
  };
  useEffect(() => { void load(); }, []);
  const addFiles = (chosen: File[]) => {
    if (busy) return;
    const invalid = chosen.map(validateAnnouncementFile).find(Boolean);
    if (invalid) toast({ title: invalid, variant: 'destructive' });
    else {
      setFiles(prev => [...prev, ...chosen]);
      chosen.filter(f => f.type.startsWith('image/')).forEach(f => {
        const id = crypto.randomUUID(); fileIds.current.set(f, id);
        const url = URL.createObjectURL(f); localUrls.current.push(url);
        insertImage(id, url, f.name);
      });
    }
  };
  const edit = (a: PortalAnnouncement | null) => { setEditing(a); setTitle(a?.title || ''); setBody(a?.body_html || ''); setFiles([]); setRemoved([]); setOpen(true); };
  const save = async (publish: boolean) => {
    const parsed = announcementSchema.safeParse({ title, body_html: body });
    if (!parsed.success) { toast({ title: 'Add a subject (up to 200 characters) and a valid message.', variant: 'destructive' }); return; }
    setBusy(true);
    const id = editing?.id || crypto.randomUUID();
    try {
      // Keep changes private until the message and every uploaded file are ready.
      const doc = new DOMParser().parseFromString(parsed.data.body_html || '', 'text/html');
      const retainedIds = new Set([
        ...(editing?.portal_announcement_files.filter(f => !removed.includes(f.id)).map(f => f.id) || []),
        ...files.map(f => fileIds.current.get(f)).filter(Boolean),
      ]);
      doc.querySelectorAll('img').forEach(img => {
        if (!retainedIds.has(img.getAttribute('data-file-id') || '')) img.remove();
        else img.removeAttribute('src');
      });
      const { error } = await supabase.from('portal_announcements').upsert({ id, title: parsed.data.title || '', body_html: doc.body.innerHTML, published_at: null });
      if (error) throw error;
      for (const file of files) {
        const validation = validateAnnouncementFile(file); if (validation) throw new Error(validation);
        const path = `${id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('portal-announcements').upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        const { error: fileError } = await supabase.from('portal_announcement_files').insert({ id: fileIds.current.get(file) || crypto.randomUUID(), announcement_id: id, name: file.name, path, mime_type: file.type, size: file.size });
        if (fileError) { await supabase.storage.from('portal-announcements').remove([path]); throw fileError; }
      }
      if (removed.length) {
        const { error } = await supabase.from('portal_announcement_files').delete().in('id', removed); if (error) throw error;
        const paths = editing?.portal_announcement_files.filter(f => removed.includes(f.id)).map(f => f.path) || [];
        if (paths.length) await supabase.storage.from('portal-announcements').remove(paths);
      }
      if (publish) { const { error } = await supabase.from('portal_announcements').update({ published_at: new Date().toISOString() }).eq('id', id); if (error) throw error; }
      setOpen(false); await load(); toast({ title: publish ? 'Announcement published to contractor portals' : 'Draft saved' });
    } catch (e) {
      setOpen(false); await load(); toast({ title: 'Announcement remains a draft', description: e instanceof Error ? e.message : 'Please reopen it and try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };
  const unpublish = async (a: PortalAnnouncement) => {
    setBusy(true);
    const { error } = await supabase.from('portal_announcements').update({ published_at: null }).eq('id', a.id);
    if (error) toast({ title: 'Could not unpublish', variant: 'destructive' }); else await load();
    setBusy(false);
  };
  return <section className="space-y-4 py-4">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Portal announcements</h2><Button onClick={() => edit(null)}><Plus className="h-4 w-4 mr-2" />Add announcement</Button></div>
    {!items.length && <p className="text-sm text-muted-foreground">No announcements added.</p>}
    {items.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
      <div className="min-w-0"><h3 className="font-medium break-words">{a.title}</h3><p className="text-xs text-muted-foreground">{a.published_at ? `Published · ${new Date(a.published_at).toLocaleDateString()}` : 'Draft'}</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPreview(a)}><Eye className="h-4 w-4 mr-2" />Preview</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => edit(a)}><Pencil className="h-4 w-4 mr-2" />Edit</Button>{a.published_at && <Button variant="outline" size="sm" disabled={busy} onClick={() => unpublish(a)}>Unpublish</Button>}</div>
    </div>)}
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? 'Edit announcement' : 'Add announcement'}</DialogTitle><DialogDescription>Contractor portal announcement</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label htmlFor="announcement-title">Subject</Label><Input id="announcement-title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} disabled={busy} /></div>
      <Label>Message</Label>
      <div aria-label="Announcement message" className="space-y-3 rounded-md border bg-background" onDragOverCapture={e => {
        if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
      }} onDropCapture={e => {
        const chosen = Array.from(e.dataTransfer.files);
        if (chosen.length) { e.preventDefault(); e.stopPropagation(); addFiles(chosen); }
        else if (e.dataTransfer.getData('text/uri-list') || /<img\b/i.test(e.dataTransfer.getData('text/html'))) {
          e.preventDefault(); e.stopPropagation(); toast({ title: 'Save the web image first, then drop the image file here.', variant: 'destructive' });
        }
      }} onPasteCapture={e => {
        const chosen = Array.from(e.clipboardData.files);
        if (chosen.length) { e.preventDefault(); e.stopPropagation(); addFiles(chosen); }
      }}>
        <NotesEditor value={body} onChange={setBody} minHeight="180px" disabled={busy} preservePasteFormatting extensions={[NewsletterImage]} onReady={editor => {
          editorRef.current = editor;
          editor.on('selectionUpdate', () => { setSelectedImage(editor.isActive('newsletterImage')); setImageWidth(Number(editor.getAttributes('newsletterImage').width) || 500); });
          if (editing) Promise.all(editing.portal_announcement_files.filter(f => f.mime_type.startsWith('image/')).map(async f => {
            const { data } = await supabase.storage.from('portal-announcements').createSignedUrl(f.path, 3600);
            return [f.id, data?.signedUrl || ''];
          })).then(entries => {
            if (editor.isDestroyed) return;
            const urls = Object.fromEntries(entries);
            const doc = new DOMParser().parseFromString(editing.body_html, 'text/html');
            doc.querySelectorAll('img').forEach(img => img.setAttribute('src', urls[img.getAttribute('data-file-id') || ''] || ''));
            editor.commands.setContent(doc.body.innerHTML, { emitUpdate: false });
            setBody(editor.getHTML());
          });
        }} />
        {selectedImage && <div className="flex items-center gap-3 px-3 pb-3"><Label htmlFor="image-width">Image width</Label><Input id="image-width" aria-label="Image width" type="number" min={50} max={1200} value={imageWidth} className="w-24" onChange={e => { const width = Math.min(1200, Math.max(50, Number(e.target.value) || 50)); setImageWidth(width); editorRef.current?.chain().focus().updateAttributes('newsletterImage', { width }).run(); }} /><span className="text-sm text-muted-foreground">px</span><Button variant="ghost" size="icon" aria-label="Remove selected image" onClick={() => editorRef.current?.chain().focus().deleteSelection().run()}><X className="h-4 w-4" /></Button></div>}
      </div>
      <input ref={input} type="file" multiple accept={announcementFileTypes.join(',')} className="hidden" onChange={e => {
        addFiles(Array.from(e.target.files || [])); e.target.value = '';
      }} />
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Paperclip className="h-4 w-4 mr-2" />Add images or attachments</Button>
      {editing?.portal_announcement_files.filter(f => !removed.includes(f.id)).map(f => <div key={f.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{f.name}</span>{f.mime_type.startsWith('image/') && <Button variant="outline" size="sm" disabled={busy} onClick={async () => { const { data } = await supabase.storage.from('portal-announcements').createSignedUrl(f.path, 3600); if (data) insertImage(f.id, data.signedUrl, f.name); }}>Insert image</Button>}<Button variant="ghost" size="icon" disabled={busy} aria-label={`Remove ${f.name}`} onClick={() => setRemoved(p => [...p, f.id])}><X className="h-4 w-4" /></Button></div>)}
      {files.map((f, i) => <div key={i} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{f.name}</span><Button variant="ghost" size="icon" disabled={busy} aria-label={`Remove ${f.name}`} onClick={() => setFiles(p => p.filter((_, j) => i !== j))}><X className="h-4 w-4" /></Button></div>)}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="outline" disabled={busy} onClick={() => save(false)}>Save draft</Button><Button disabled={busy} onClick={() => save(true)}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Publish announcement</Button></div>
    </DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>Announcement preview</DialogDescription></DialogHeader>{preview && <AnnouncementContent announcement={preview} />}</DialogContent></Dialog>
  </section>;
}