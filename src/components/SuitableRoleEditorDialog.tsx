import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Briefcase, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuitableRoleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
  initialRoles?: string[];
  /** All suitable roles known in the system (for suggestions & duplicate detection). */
  knownRoles: string[];
  onSaved?: (newRoles: string[]) => void;
}

const normalize = (s: string) => s.trim().toLowerCase();

export function SuitableRoleEditorDialog({
  open,
  onOpenChange,
  applicantId,
  applicantName,
  initialRoles,
  knownRoles,
  onSaved,
}: SuitableRoleEditorDialogProps) {
  const [roles, setRoles] = useState<string[]>(initialRoles || []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRoles(initialRoles || []);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialRoles]);

  const currentSet = useMemo(() => new Set(roles.map(normalize)), [roles]);

  const suggestions = useMemo(() => {
    const q = normalize(input);
    return knownRoles
      .filter(r => !currentSet.has(normalize(r)))
      .filter(r => (q ? normalize(r).includes(q) : true))
      .slice(0, 8);
  }, [input, knownRoles, currentSet]);

  const existingMatch = useMemo(() => {
    const q = normalize(input);
    if (!q) return null;
    return knownRoles.find(r => normalize(r) === q) || null;
  }, [input, knownRoles]);

  const addRole = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const canonical = knownRoles.find(r => normalize(r) === normalize(trimmed)) || trimmed;
    if (currentSet.has(normalize(canonical))) {
      setInput('');
      return;
    }
    setRoles(prev => [...prev, canonical]);
    setInput('');
  };

  const removeRole = (role: string) => {
    setRoles(prev => prev.filter(r => r !== role));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRole(input);
    } else if (e.key === 'Backspace' && !input && roles.length > 0) {
      setRoles(prev => prev.slice(0, -1));
    } else if (e.key === ',') {
      e.preventDefault();
      addRole(input);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ suitable_roles: roles })
      .eq('id', applicantId);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Failed to save suitable roles');
      return;
    }
    toast.success('Suitable roles updated');
    onSaved?.(roles);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Suitable Roles — {applicantName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md border bg-muted/30">
            {roles.length === 0 && (
              <span className="text-xs text-muted-foreground">No suitable roles yet.</span>
            )}
            {roles.map(role => (
              <Badge key={role} variant="secondary" className="gap-1 pr-1 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                {role}
                <button
                  onClick={() => removeRole(role)}
                  className="hover:bg-background/60 rounded-sm p-0.5"
                  aria-label={`Remove ${role}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a role, press Enter to add..."
            />
            {input.trim() && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {existingMatch ? (
                  <>Existing role detected — will reuse <span className="font-medium">"{existingMatch}"</span>.</>
                ) : (
                  <>Will create new role <span className="font-medium">"{input.trim()}"</span>.</>
                )}
              </p>
            )}
          </div>

          {suggestions.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(role => (
                  <button
                    key={role}
                    onClick={() => addRole(role)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border border-border/60 bg-background",
                      "hover:bg-accent hover:text-accent-foreground transition-colors"
                    )}
                  >
                    + {role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
