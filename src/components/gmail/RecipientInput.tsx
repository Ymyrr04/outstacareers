import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ContactType = "contractor" | "client" | "applicant";

interface Contact {
  name: string;
  email: string;
  type: ContactType;
}

const TYPE_STYLE: Record<ContactType, { bg: string; label: string }> = {
  contractor: { bg: "#0ABEDF", label: "Contractor" },
  client: { bg: "#8B5CF6", label: "Client" },
  applicant: { bg: "#F59E0B", label: "Applicant" },
};

function initials(name: string, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function splitTokens(value: string) {
  const parts = value.split(",");
  const current = parts.pop() ?? "";
  return { prefix: parts, current };
}

async function searchContacts(term: string): Promise<Contact[]> {
  const like = `%${term.replace(/[%,]/g, "")}%`;
  const out: Contact[] = [];
  const seen = new Set<string>();
  const push = (name: string | null, email: string | null, type: ContactType) => {
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: name || email, email, type });
  };

  try {
    const { data } = await supabase
      .from("contractor_assignments")
      .select("applicant_id, applicants_prescreen(full_name, email)")
      .eq("status", "Active")
      .limit(30);
    (data || []).forEach((row: any) => {
      const a = row.applicants_prescreen;
      if (!a) return;
      const hay = `${a.full_name || ""} ${a.email || ""}`.toLowerCase();
      if (hay.includes(term.toLowerCase())) push(a.full_name, a.email, "contractor");
    });
  } catch { /* ignore */ }

  try {
    const { data } = await supabase
      .from("client_portal_users")
      .select("full_name, primary_email, email")
      .or(`full_name.ilike."${like}",primary_email.ilike."${like}",email.ilike."${like}"`)
      .limit(6);
    (data || []).forEach((r: any) => push(r.full_name, r.primary_email || r.email, "client"));
  } catch { /* ignore */ }

  try {
    const { data } = await supabase
      .from("applicants_prescreen")
      .select("full_name, email")
      .or(`full_name.ilike."${like}",email.ilike."${like}"`)
      .limit(6);
    (data || []).forEach((r: any) => push(r.full_name, r.email, "applicant"));
  } catch { /* ignore */ }

  return out.slice(0, 6);
}

export function RecipientInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const dismissed = useRef(false);

  useEffect(() => {
    const { current } = splitTokens(value);
    const term = current.trim();
    if (dismissed.current) return;
    if (term.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const results = await searchContacts(term);
      if (!active) return;
      setSuggestions(results);
      setHighlight(0);
      setOpen(results.length > 0);
    }, 180);
    return () => { active = false; clearTimeout(t); };
  }, [value]);

  const select = (c: Contact) => {
    const { prefix } = splitTokens(value);
    const formatted = c.name && c.name !== c.email ? `${c.name} <${c.email}>` : c.email;
    const next = [...prefix.map((p) => p.trim()), formatted].filter(Boolean).join(", ") + ", ";
    onChange(next);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { dismissed.current = false; onChange(e.target.value); }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "Escape") { e.preventDefault(); dismissed.current = true; setOpen(false); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); select(suggestions[highlight]); }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 overflow-auto"
          style={{
            background: "#ffffff",
            border: "0.5px solid #C8F0F8",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            zIndex: 50,
            maxHeight: 200,
          }}
        >
          {suggestions.map((c, i) => (
            <button
              key={`${c.type}-${c.email}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(c)}
              onMouseEnter={() => setHighlight(i)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
              style={{ background: i === highlight ? "#E0F7FC" : "transparent" }}
            >
              <span
                className="flex items-center justify-center rounded-full text-white shrink-0"
                style={{ width: 24, height: 24, fontSize: 9, background: TYPE_STYLE[c.type].bg }}
              >
                {initials(c.name, c.email)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 12, fontWeight: 500 }}>{c.name}</span>
                <span className="block truncate text-muted-foreground" style={{ fontSize: 10 }}>{c.email}</span>
              </span>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5"
                style={{ fontSize: 9, background: `${TYPE_STYLE[c.type].bg}1A`, color: TYPE_STYLE[c.type].bg }}
              >
                {TYPE_STYLE[c.type].label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
