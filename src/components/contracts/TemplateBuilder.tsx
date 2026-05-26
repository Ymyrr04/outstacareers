import { useEffect, useRef, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Trash2, PenLine, Type, Calendar, CheckSquare, Hash } from "lucide-react";
import { toast } from "sonner";
import { renderPdfPages, RenderedPage } from "@/lib/pdfRender";

type FieldType = "signature" | "initials" | "date" | "text" | "checkbox";
type AssignedTo = "signer" | "admin" | "system";

interface Field {
  id: string;
  template_id: string;
  field_type: FieldType;
  page: number;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  label: string | null;
  required: boolean;
  assigned_to: AssignedTo;
  field_key: string | null;
  sort_order: number;
  _new?: boolean;
  _dirty?: boolean;
}

const FIELD_DEFAULTS: Record<FieldType, { w: number; h: number; label: string; icon: any }> = {
  signature: { w: 0.25, h: 0.05, label: "Signature", icon: PenLine },
  initials: { w: 0.08, h: 0.04, label: "Initials", icon: Hash },
  date: { w: 0.12, h: 0.03, label: "Date", icon: Calendar },
  text: { w: 0.2, h: 0.03, label: "Text", icon: Type },
  checkbox: { w: 0.025, h: 0.025, label: "Checkbox", icon: CheckSquare },
};

const PREFILL_KEYS: { value: string; label: string }[] = [
  { value: "date_entered_into", label: "Date entered into" },
  { value: "effective_date", label: "Effective date" },
  { value: "client_name", label: "Client name" },
  { value: "contractor_name", label: "Contractor name" },
  { value: "contractor_address", label: "Contractor address" },
  { value: "role_title", label: "Role title" },
  { value: "duration_months", label: "Duration (months)" },
  { value: "hourly_rate", label: "Hourly rate" },
  { value: "monthly_rate", label: "Monthly rate" },
  { value: "start_date", label: "Start date" },
  { value: "end_date", label: "End date" },
];

const PendingCtx = createContext<{ pending: FieldType | null; setPending: (v: FieldType | null) => void }>({ pending: null, setPending: () => {} });

export const TemplateBuilder = ({ templateId, onBack }: { templateId: string; onBack: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [pending, setPending] = useState<FieldType | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: tpl, error: tplErr } = await supabase.from("contract_templates").select("*").eq("id", templateId).single();
        if (tplErr) throw tplErr;
        setTemplateName(tpl.name);

        const { data: signed } = await supabase.storage.from("contract-templates").createSignedUrl(tpl.pdf_path, 3600);
        if (signed?.signedUrl) {
          const rendered = await renderPdfPages(signed.signedUrl, 900);
          setPages(rendered);
        }

        const { data: existing } = await supabase
          .from("contract_template_fields")
          .select("*")
          .eq("template_id", templateId)
          .order("sort_order");
        setFields((existing || []) as Field[]);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId]);

  const addField = (pageIdx: number, type: FieldType, e: React.MouseEvent) => {
    const target = pageRefs.current[pageIdx];
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x_pct = (e.clientX - rect.left) / rect.width;
    const y_pct = (e.clientY - rect.top) / rect.height;
    const def = FIELD_DEFAULTS[type];
    const newField: Field = {
      id: crypto.randomUUID(),
      template_id: templateId,
      field_type: type,
      page: pageIdx + 1,
      x_pct: Math.max(0, Math.min(1 - def.w, x_pct - def.w / 2)),
      y_pct: Math.max(0, Math.min(1 - def.h, y_pct - def.h / 2)),
      width_pct: def.w,
      height_pct: def.h,
      label: def.label,
      required: true,
      assigned_to: type === "date" ? "system" : "signer",
      field_key: null,
      sort_order: fields.length,
      _new: true,
      _dirty: true,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(newField.id);
  };

  const updateField = (id: string, patch: Partial<Field>) => {
    setFields((prev) => prev.map(f => f.id === id ? { ...f, ...patch, _dirty: true } : f));
  };

  const deleteField = async (id: string) => {
    const f = fields.find(x => x.id === id);
    if (!f) return;
    if (!f._new) {
      const { error } = await supabase.from("contract_template_fields").delete().eq("id", id);
      if (error) return toast.error(error.message);
    }
    setFields((prev) => prev.filter(x => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleDrag = (id: string, dx: number, dy: number, pageW: number, pageH: number) => {
    setFields((prev) => prev.map(f => {
      if (f.id !== id) return f;
      return {
        ...f,
        x_pct: Math.max(0, Math.min(1 - f.width_pct, f.x_pct + dx / pageW)),
        y_pct: Math.max(0, Math.min(1 - f.height_pct, f.y_pct + dy / pageH)),
        _dirty: true,
      };
    }));
  };

  const handleResize = (id: string, dx: number, dy: number, pageW: number, pageH: number) => {
    setFields((prev) => prev.map(f => {
      if (f.id !== id) return f;
      return {
        ...f,
        width_pct: Math.max(0.01, Math.min(1 - f.x_pct, f.width_pct + dx / pageW)),
        height_pct: Math.max(0.01, Math.min(1 - f.y_pct, f.height_pct + dy / pageH)),
        _dirty: true,
      };
    }));
  };


  const saveAll = async () => {
    setSaving(true);
    try {
      const dirty = fields.filter(f => f._dirty);
      for (const f of dirty) {
        const { error } = await supabase.from("contract_template_fields").upsert({
          id: f.id, template_id: f.template_id, field_type: f.field_type, page: f.page,
          x_pct: f.x_pct, y_pct: f.y_pct, width_pct: f.width_pct, height_pct: f.height_pct,
          label: f.label, required: f.required, assigned_to: f.assigned_to,
          field_key: f.field_key, sort_order: f.sort_order,
        });
        if (error) throw error;
      }
      setFields(prev => prev.map(f => ({ ...f, _new: false, _dirty: false })));
      toast.success(`Saved ${dirty.length} field${dirty.length !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selected = fields.find(f => f.id === selectedId) || null;
  const dirtyCount = fields.filter(f => f._dirty).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <PendingCtx.Provider value={{ pending, setPending }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 sticky top-0 z-20 bg-background py-2 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1"><ArrowLeft className="w-4 h-4" /> Back</Button>
            <div>
              <h3 className="font-semibold">{templateName}</h3>
              <p className="text-xs text-muted-foreground">Pick a field type, then click on the PDF to place it. Drag to move.</p>
            </div>
          </div>
          <Button onClick={saveAll} disabled={saving || dirtyCount === 0}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </Button>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-4">
          <div className="space-y-6">
            {pages.map((p) => (
              <PageCanvas
                key={p.index}
                page={p}
                fields={fields.filter(f => f.page === p.index + 1)}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                onAdd={(type, e) => addField(p.index, type, e)}
                onDrag={(id, dx, dy) => handleDrag(id, dx, dy, p.width, p.height)}
                onResize={(id, dx, dy) => handleResize(id, dx, dy, p.width, p.height)}
                registerRef={(el) => { pageRefs.current[p.index] = el; }}
              />
            ))}
          </div>

          <div className="space-y-4">
            <Card className="p-3">
              <p className="text-sm font-semibold mb-2">Field types</p>
              <p className="text-xs text-muted-foreground mb-3">Select, then click on the PDF.</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FIELD_DEFAULTS) as FieldType[]).map(t => {
                  const Icon = FIELD_DEFAULTS[t].icon;
                  return (
                    <Button key={t} variant={pending === t ? "default" : "outline"} size="sm" onClick={() => setPending(pending === t ? null : t)} className="gap-1 justify-start">
                      <Icon className="w-3 h-3" /> {FIELD_DEFAULTS[t].label}
                    </Button>
                  );
                })}
              </div>
              {pending && <p className="text-xs text-primary mt-2">Click on the PDF to place a {pending}.</p>}
            </Card>

            {selected && (
              <Card className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Field properties</p>
                  <Button size="sm" variant="ghost" onClick={() => deleteField(selected.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-medium">Label</label>
                  <Input value={selected.label ?? ""} onChange={(e) => updateField(selected.id, { label: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium">Assigned to</label>
                  <Select value={selected.assigned_to} onValueChange={(v) => updateField(selected.id, { assigned_to: v as AssignedTo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="signer">Signer (recipient)</SelectItem>
                      <SelectItem value="admin">Admin (pre-filled)</SelectItem>
                      <SelectItem value="system">System (auto-date)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selected.assigned_to === "admin" && (
                  <div>
                    <label className="text-xs font-medium">Prefill key</label>
                    <Select
                      value={PREFILL_KEYS.some((k) => k.value === selected.field_key) ? selected.field_key ?? "" : "__custom__"}
                      onValueChange={(v) => updateField(selected.id, { field_key: v === "__custom__" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select a prefill key" /></SelectTrigger>
                      <SelectContent>
                        {PREFILL_KEYS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                    {(!PREFILL_KEYS.some((k) => k.value === selected.field_key) || !selected.field_key) && (
                      <Input
                        className="mt-2"
                        value={selected.field_key ?? ""}
                        onChange={(e) => updateField(selected.id, { field_key: e.target.value })}
                        placeholder="custom_key"
                      />
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Used in send dialog to pre-fill this field.</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input id="req" type="checkbox" checked={selected.required} onChange={(e) => updateField(selected.id, { required: e.target.checked })} />
                  <label htmlFor="req" className="text-xs">Required</label>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>W <Input type="number" step="0.005" value={selected.width_pct.toFixed(3)} onChange={(e) => updateField(selected.id, { width_pct: +e.target.value })} className="h-7" /></label>
                  <label>H <Input type="number" step="0.005" value={selected.height_pct.toFixed(3)} onChange={(e) => updateField(selected.id, { height_pct: +e.target.value })} className="h-7" /></label>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PendingCtx.Provider>
  );
};

function PageCanvas({
  page, fields, selectedId, setSelectedId, onAdd, onDrag, onResize, registerRef,
}: {
  page: RenderedPage;
  fields: Field[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onAdd: (type: FieldType, e: React.MouseEvent) => void;
  onDrag: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, dx: number, dy: number) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const { pending, setPending } = useContext(PendingCtx);
  const dragRef = useRef<{ id: string; startX: number; startY: number; mode: "move" | "resize" } | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (pending) {
      onAdd(pending, e);
      setPending(null);
    } else {
      setSelectedId(null);
    }
  };

  const startInteraction = (id: string, e: React.MouseEvent, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, mode };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (dragRef.current.mode === "move") onDrag(dragRef.current.id, dx, dy);
      else onResize(dragRef.current.id, dx, dy);
      dragRef.current.startX = ev.clientX;
      dragRef.current.startY = ev.clientY;
    };
    const up = () => { dragRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      ref={registerRef}
      onClick={handleClick}
      className={`relative bg-background border rounded shadow-sm mx-auto ${pending ? "cursor-crosshair" : ""}`}
      style={{ width: page.width, maxWidth: "100%" }}
    >
      <img src={page.dataUrl} alt="" className="w-full block select-none pointer-events-none" />
      {fields.map(f => (
        <div
          key={f.id}
          onMouseDown={(e) => startInteraction(f.id, e, "move")}
          onClick={(e) => e.stopPropagation()}
          className={`absolute border-2 cursor-move flex items-center justify-center text-[10px] font-medium ${selectedId === f.id ? "border-primary bg-primary/20" : "border-primary/50 bg-primary/10"}`}
          style={{
            left: `${f.x_pct * 100}%`,
            top: `${f.y_pct * 100}%`,
            width: `${f.width_pct * 100}%`,
            height: `${f.height_pct * 100}%`,
          }}
          title={f.label || f.field_type}
        >
          <span className="truncate px-1 pointer-events-none">{f.field_type}{f.assigned_to === "admin" ? " *" : ""}</span>
          {selectedId === f.id && (
            <div
              onMouseDown={(e) => startInteraction(f.id, e, "resize")}
              className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-primary border border-background rounded-sm cursor-nwse-resize"
              title="Drag to resize"
            />
          )}
        </div>
      ))}
    </div>
  );

}
