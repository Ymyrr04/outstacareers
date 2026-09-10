import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { TemplateBuilder } from "./TemplateBuilder";
import { formatDate } from "@/lib/dateFormat";

interface Template {
  id: string;
  name: string;
  description: string | null;
  pdf_path: string;
  page_count: number;
  is_active: boolean;
  created_at: string;
}

export const TemplatesPanel = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contract_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setTemplates(data as Template[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    if (!file || !name) return toast.error("Name and PDF are required");
    if (file.type !== "application/pdf") return toast.error("PDF only");
    setUploading(true);
    try {
      // Count pages with pdfjs
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pageCount = pdf.numPages;

      const path = `${crypto.randomUUID()}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("contract-templates").upload(path, file, {
        contentType: "application/pdf",
      });
      if (upErr) throw upErr;

      const { data: tpl, error: insErr } = await supabase
        .from("contract_templates")
        .insert({ name, description: description || null, pdf_path: path, page_count: pageCount })
        .select()
        .single();
      if (insErr) throw insErr;

      toast.success("Template uploaded");
      setUploadOpen(false);
      setName(""); setDescription(""); setFile(null);
      await load();
      setEditingId(tpl.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template? Sent envelopes will keep their copy.")) return;
    const { error } = await supabase.from("contract_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  };

  if (editingId) {
    return <TemplateBuilder templateId={editingId} onBack={() => { setEditingId(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setUploadOpen(true)} className="gap-2"><Upload className="w-4 h-4" /> Upload PDF Template</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No templates yet. Upload a PDF to get started.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map(t => (
            <Card key={t.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.page_count} page{t.page_count !== 1 ? "s" : ""} • {formatDate(t.created_at)}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditingId(t.id)} className="gap-1"><Pencil className="w-3 h-3" /> Edit Fields</Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload PDF Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contractor Agreement v2" />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">PDF file</label>
              <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
