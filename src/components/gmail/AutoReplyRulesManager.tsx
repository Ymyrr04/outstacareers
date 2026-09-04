import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

interface AutoReplyRule {
  id: string;
  name: string;
  match_type: "contains" | "equals" | "starts_with";
  subject_keyword: string;
  body_html: string;
  is_enabled: boolean;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MATCH_TYPES = [
  { value: "contains", label: "Subject contains" },
  { value: "equals", label: "Subject is exactly" },
  { value: "starts_with", label: "Subject starts with" },
] as const;

const emptyForm = { name: "", match_type: "contains" as AutoReplyRule["match_type"], subject_keyword: "", body_html: "" };

const MERGE_TAGS = [
  { tag: "{first_name}", label: "First name" },
  { tag: "{last_name}", label: "Last name" },
  { tag: "{full_name}", label: "Full name" },
  { tag: "{email}", label: "Email" },
] as const;

export default function AutoReplyRulesManager({ open, onOpenChange }: Props) {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AutoReplyRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    const ta = bodyRef.current;
    if (!ta) {
      setForm((f) => ({ ...f, body_html: f.body_html + tag }));
      return;
    }
    const start = ta.selectionStart ?? form.body_html.length;
    const end = ta.selectionEnd ?? form.body_html.length;
    const next = form.body_html.slice(0, start) + tag + form.body_html.slice(end);
    setForm({ ...form, body_html: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const fetchRules = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("auto_reply_rules")
      .select("id, name, match_type, subject_keyword, body_html, is_enabled, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load rules: " + error.message);
    setRules(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchRules();
  }, [open]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (rule: AutoReplyRule) => {
    setEditing(rule);
    setForm({ name: rule.name, match_type: rule.match_type, subject_keyword: rule.subject_keyword, body_html: rule.body_html });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.subject_keyword.trim() || !form.body_html.trim()) {
      toast.error("Name, subject keyword, and reply body are all required.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      match_type: form.match_type,
      subject_keyword: form.subject_keyword.trim(),
      body_html: form.body_html,
    };
    let error;
    if (editing) {
      ({ error } = await (supabase as any).from("auto_reply_rules").update(payload).eq("id", editing.id));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      ({ error } = await (supabase as any).from("auto_reply_rules").insert({ ...payload, created_by: userData.user?.id }));
    }
    setSaving(false);
    if (error) {
      toast.error("Failed to save rule: " + error.message);
      return;
    }
    toast.success(editing ? "Rule updated" : "Rule created");
    setFormOpen(false);
    fetchRules();
  };

  const toggleEnabled = async (rule: AutoReplyRule) => {
    const { error } = await (supabase as any).from("auto_reply_rules").update({ is_enabled: !rule.is_enabled }).eq("id", rule.id);
    if (error) toast.error("Failed to update rule: " + error.message);
    else setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r)));
  };

  const handleDelete = async (rule: AutoReplyRule) => {
    if (!confirm(`Delete the rule "${rule.name}"?`)) return;
    const { error } = await (supabase as any).from("auto_reply_rules").delete().eq("id", rule.id);
    if (error) toast.error("Failed to delete rule: " + error.message);
    else {
      toast.success("Rule deleted");
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#0ABEDF]" /> Auto-Reply Rules
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          When an incoming email's subject matches a rule, a reply is sent automatically about 5 minutes later,
          from your connected Gmail. Each sender only receives one auto-reply per rule, and replies stay in the
          same email thread.
        </p>

        {formOpen ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">{editing ? "Edit rule" : "New rule"}</h3>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Rule name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Application received"
                className="w-full h-8 px-3 text-xs rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Match</label>
                <select
                  value={form.match_type}
                  onChange={(e) => setForm({ ...form, match_type: e.target.value as AutoReplyRule["match_type"] })}
                  className="w-full h-8 px-2 text-xs rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {MATCH_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Subject keyword</label>
                <input
                  value={form.subject_keyword}
                  onChange={(e) => setForm({ ...form, subject_keyword: e.target.value })}
                  placeholder="e.g. application received"
                  className="w-full h-8 px-3 text-xs rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Reply body (HTML allowed)</label>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-muted-foreground mr-1">Insert:</span>
                {MERGE_TAGS.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => insertTag(t.tag)}
                    title={`Inserts ${t.tag} — replaced with the sender's ${t.label.toLowerCase()} when the reply is sent`}
                    className="px-2 py-0.5 rounded-full border border-border text-[10px] font-mono hover:bg-muted"
                  >
                    {t.tag}
                  </button>
                ))}
              </div>
              <textarea
                ref={bodyRef}
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                rows={6}
                placeholder="Hi {first_name},<br><br>Thank you for reaching out…"
                className="w-full px-3 py-2 text-xs rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setFormOpen(false)}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                {editing ? "Save changes" : "Create rule"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                onClick={openNew}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700"
              >
                <Plus className="w-3.5 h-3.5" /> New rule
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No rules yet. Create your first auto-reply rule above.
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <button
                      onClick={() => toggleEnabled(rule)}
                      title={rule.is_enabled ? "Disable rule" : "Enable rule"}
                      className={`mt-0.5 w-8 h-4.5 rounded-full relative transition-colors flex-shrink-0 ${rule.is_enabled ? "bg-cyan-600" : "bg-muted"}`}
                      style={{ height: 18 }}
                    >
                      <span
                        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${rule.is_enabled ? "left-4" : "left-0.5"}`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{rule.name}</span>
                        {!rule.is_enabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Off</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {MATCH_TYPES.find((m) => m.value === rule.match_type)?.label} "{rule.subject_keyword}"
                      </p>
                    </div>
                    <button onClick={() => openEdit(rule)} className="p-1.5 rounded-md hover:bg-muted" title="Edit">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(rule)} className="p-1.5 rounded-md hover:bg-muted" title="Delete">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
