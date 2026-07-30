import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, ArrowRight, Loader2, Plus, X } from "lucide-react";

export interface RoleEntry {
  role: string;
  years: number;
  months: number;
}
export interface IndustryEntry {
  industry: string;
  years: number;
  months: number;
}
export interface ToolEntry {
  tool: string;
  years: number;
  months: number;
}

export interface WrapUpResponses {
  previous_roles: RoleEntry[];
  total_years_experience: string;
  highlight_skills: string[];
  industries: IndustryEntry[];
  tools: ToolEntry[];
  other_suitable_roles: string;
  salary_expectation: string;
  career_goals: string;
  additional_details: string;
}

const EMPTY: WrapUpResponses = {
  previous_roles: [{ role: "", years: 0, months: 0 }],
  total_years_experience: "",
  highlight_skills: [""],
  industries: [{ industry: "", years: 0, months: 0 }],
  tools: [{ tool: "", years: 0, months: 0 }],
  other_suitable_roles: "",
  salary_expectation: "",
  career_goals: "",
  additional_details: "",
};

const SAMPLE: WrapUpResponses = {
  previous_roles: [
    { role: "Social Media Manager", years: 2, months: 6 },
    { role: "Executive Assistant", years: 1, months: 0 },
  ],
  total_years_experience: "5",
  highlight_skills: ["Cold calling", "Invoicing", "Data analysis"],
  industries: [{ industry: "Legal", years: 1, months: 3 }],
  tools: [{ tool: "QuickBooks", years: 3, months: 0 }],
  other_suitable_roles: "Executive Assistant, Customer Support",
  salary_expectation: "$800 – $1,200/month",
  career_goals: "Grow into an operations lead role.",
  additional_details: "Available to start immediately.",
};

const YEARS = Array.from({ length: 21 }, (_, i) => i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const TOTAL_YEARS = Array.from({ length: 31 }, (_, i) => i);

interface WrapUpStepProps {
  onSubmit: (responses: WrapUpResponses) => void;
  submitting?: boolean;
  previewMode?: boolean;
}

function DurationSelects({
  years,
  months,
  onChange,
}: {
  years: number;
  months: number;
  onChange: (patch: { years?: number; months?: number }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Years</span>
        <Select value={String(years)} onValueChange={(v) => onChange({ years: Number(v) })}>
          <SelectTrigger className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50 max-h-60">
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Months</span>
        <Select value={String(months)} onValueChange={(v) => onChange({ months: Number(v) })}>
          <SelectTrigger className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50 max-h-60">
            {MONTHS.map((m) => (
              <SelectItem key={m} value={String(m)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
    >
      <Plus className="w-4 h-4 mr-1" />
      Add another
    </Button>
  );
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove entry"
      className="text-muted-foreground hover:text-foreground shrink-0"
    >
      <X className="w-4 h-4" />
    </Button>
  );
}

export function WrapUpStep({ onSubmit, submitting = false, previewMode = false }: WrapUpStepProps) {
  const [values, setValues] = useState<WrapUpResponses>(previewMode ? SAMPLE : EMPTY);

  const set = <K extends keyof WrapUpResponses>(key: K, value: WrapUpResponses[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const clean = (): WrapUpResponses => ({
    ...values,
    previous_roles: values.previous_roles.filter((r) => r.role.trim()),
    highlight_skills: values.highlight_skills.map((s) => s.trim()).filter(Boolean),
    industries: values.industries.filter((i) => i.industry.trim()),
    tools: values.tools.filter((t) => t.tool.trim()),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
        <div className="flex items-center gap-2 text-primary font-medium">
          <Sparkles className="w-5 h-5" />
          <span className="text-lg">A Few Final Details</span>
        </div>
        <p className="text-sm text-muted-foreground">
          These are optional, but they help us match you with other roles that fit your background.
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. Previous roles */}
        <div className="space-y-3">
          <Label>Previous roles / job titles you've held (with previous clients or employers)</Label>
          {values.previous_roles.map((row, idx) => (
            <div key={idx} className="rounded-lg bg-muted/50 border p-3">
              <div className="flex items-start gap-2">
                <div className="grid gap-3 sm:grid-cols-2 flex-1">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Role / Job title</span>
                    <Input
                      value={row.role}
                      onChange={(e) => {
                        const next = [...values.previous_roles];
                        next[idx] = { ...row, role: e.target.value };
                        set("previous_roles", next);
                      }}
                      placeholder="e.g. Social Media Manager"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Experience</span>
                    <DurationSelects
                      years={row.years}
                      months={row.months}
                      onChange={(patch) => {
                        const next = [...values.previous_roles];
                        next[idx] = { ...row, ...patch };
                        set("previous_roles", next);
                      }}
                    />
                  </div>
                </div>
                <RemoveButton
                  disabled={values.previous_roles.length === 1}
                  onClick={() =>
                    set("previous_roles", values.previous_roles.filter((_, i) => i !== idx))
                  }
                />
              </div>
            </div>
          ))}
          <AddButton
            onClick={() =>
              set("previous_roles", [...values.previous_roles, { role: "", years: 0, months: 0 }])
            }
          />
        </div>

        {/* 2. Total years */}
        <div className="space-y-2">
          <Label>Total years of relevant experience</Label>
          <Select
            value={values.total_years_experience}
            onValueChange={(v) => set("total_years_experience", v)}
          >
            <SelectTrigger className="bg-background sm:max-w-xs">
              <SelectValue placeholder="Select years" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-60">
              {TOTAL_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y} {y === 1 ? "year" : "years"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Combined across all roles listed above</p>
        </div>

        {/* 3. Skills */}
        <div className="space-y-3">
          <Label>Skills you want to highlight for other roles</Label>
          {values.highlight_skills.filter((s) => s.trim()).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {values.highlight_skills.map((s, i) =>
                s.trim() ? (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    {s}
                    <button
                      type="button"
                      aria-label={`Remove ${s}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const next = values.highlight_skills.filter((_, idx) => idx !== i);
                        set("highlight_skills", next.length ? next : [""]);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ) : null
              )}
            </div>
          )}
          {values.highlight_skills.map((s, idx) => (
            <div key={idx} className="rounded-lg bg-muted/50 border p-3 flex items-center gap-2">
              <Input
                value={s}
                onChange={(e) => {
                  const next = [...values.highlight_skills];
                  next[idx] = e.target.value;
                  set("highlight_skills", next);
                }}
                placeholder="e.g. Cold calling, Invoicing"
                className="bg-background"
              />
              <RemoveButton
                disabled={values.highlight_skills.length === 1}
                onClick={() =>
                  set("highlight_skills", values.highlight_skills.filter((_, i) => i !== idx))
                }
              />
            </div>
          ))}
          <AddButton onClick={() => set("highlight_skills", [...values.highlight_skills, ""])} />
        </div>

        {/* 4. Industries */}
        <div className="space-y-3">
          <Label>Industries you've previously worked in</Label>
          {values.industries.map((row, idx) => (
            <div key={idx} className="rounded-lg bg-muted/50 border p-3">
              <div className="flex items-start gap-2">
                <div className="grid gap-3 sm:grid-cols-2 flex-1">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Industry</span>
                    <Input
                      value={row.industry}
                      onChange={(e) => {
                        const next = [...values.industries];
                        next[idx] = { ...row, industry: e.target.value };
                        set("industries", next);
                      }}
                      placeholder="e.g. Legal, Medical, Locksmith"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Experience</span>
                    <DurationSelects
                      years={row.years}
                      months={row.months}
                      onChange={(patch) => {
                        const next = [...values.industries];
                        next[idx] = { ...row, ...patch };
                        set("industries", next);
                      }}
                    />
                  </div>
                </div>
                <RemoveButton
                  disabled={values.industries.length === 1}
                  onClick={() => set("industries", values.industries.filter((_, i) => i !== idx))}
                />
              </div>
            </div>
          ))}
          <AddButton
            onClick={() => set("industries", [...values.industries, { industry: "", years: 0, months: 0 }])}
          />
        </div>

        {/* 5. Tools */}
        <div className="space-y-3">
          <Label>Software / tools you're proficient in</Label>
          {values.tools.map((row, idx) => (
            <div key={idx} className="rounded-lg bg-muted/50 border p-3">
              <div className="flex items-start gap-2">
                <div className="grid gap-3 sm:grid-cols-2 flex-1">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Software or tool</span>
                    <Input
                      value={row.tool}
                      onChange={(e) => {
                        const next = [...values.tools];
                        next[idx] = { ...row, tool: e.target.value };
                        set("tools", next);
                      }}
                      placeholder="e.g. QuickBooks, HubSpot, Excel"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Experience</span>
                    <DurationSelects
                      years={row.years}
                      months={row.months}
                      onChange={(patch) => {
                        const next = [...values.tools];
                        next[idx] = { ...row, ...patch };
                        set("tools", next);
                      }}
                    />
                  </div>
                </div>
                <RemoveButton
                  disabled={values.tools.length === 1}
                  onClick={() => set("tools", values.tools.filter((_, i) => i !== idx))}
                />
              </div>
            </div>
          ))}
          <AddButton
            onClick={() => set("tools", [...values.tools, { tool: "", years: 0, months: 0 }])}
          />
        </div>

        {/* 6. Other suitable roles */}
        <div className="space-y-2">
          <Label>What other roles do you think you'd be a good fit for?</Label>
          <Textarea
            value={values.other_suitable_roles}
            onChange={(e) => set("other_suitable_roles", e.target.value)}
            placeholder="e.g. Executive Assistant, Customer Support, Bookkeeper"
            rows={2}
          />
        </div>

        {/* 7. Salary */}
        <div className="space-y-2">
          <Label>Expected monthly salary (range is fine)</Label>
          <Input
            value={values.salary_expectation}
            onChange={(e) => set("salary_expectation", e.target.value)}
            placeholder="e.g. $800 – $1,200/month"
          />
        </div>

        {/* 8. Career goals */}
        <div className="space-y-2">
          <Label>What are your career goals for the next 2 years?</Label>
          <Textarea
            value={values.career_goals}
            onChange={(e) => set("career_goals", e.target.value)}
            placeholder="Share your professional goals and where you'd like to grow..."
            rows={3}
          />
        </div>

        {/* 9. Anything else */}
        <div className="space-y-2">
          <Label>Anything else you'd like to share?</Label>
          <Textarea
            value={values.additional_details}
            onChange={(e) => set("additional_details", e.target.value)}
            placeholder="Anything else you'd like us to know..."
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={() => onSubmit(clean())} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Finish Interview
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
