import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tag as TagIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
  initialTags?: string[];
  /** All tags known in the system (for suggestions & duplicate detection). */
  knownTags: string[];
  onSaved?: (newTags: string[]) => void;
}

const normalize = (s: string) => s.trim().toLowerCase();

export function TagEditorDialog({
  open,
  onOpenChange,
  applicantId,
  applicantName,
  initialTags,
  knownTags,
  onSaved,
}: TagEditorDialogProps) {
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTags(initialTags || []);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialTags]);

  const currentSet = useMemo(() => new Set(tags.map(normalize)), [tags]);

  const suggestions = useMemo(() => {
    const q = normalize(input);
    return knownTags
      .filter(t => !currentSet.has(normalize(t)))
      .filter(t => (q ? normalize(t).includes(q) : true))
      .slice(0, 8);
  }, [input, knownTags, currentSet]);

  const existingMatch = useMemo(() => {
    const q = normalize(input);
    if (!q) return null;
    return knownTags.find(t => normalize(t) === q) || null;
  }, [input, knownTags]);

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Reuse existing canonical spelling when the tag already exists in the system.
    const canonical = knownTags.find(t => normalize(t) === normalize(trimmed)) || trimmed;
    if (currentSet.has(normalize(canonical))) {
      setInput('');
      return;
    }
    setTags(prev => [...prev, canonical]);
    setInput('');
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    } else if (e.key === ',') {
      e.preventDefault();
      addTag(input);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ tags })
      .eq('id', applicantId);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Failed to save tags');
      return;
    }
    toast.success('Tags updated');
    onSaved?.(tags);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="w-4 h-4" />
            Tags — {applicantName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md border bg-muted/30">
            {tags.length === 0 && (
              <span className="text-xs text-muted-foreground">No tags yet.</span>
            )}
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:bg-background/60 rounded-sm p-0.5"
                  aria-label={`Remove ${tag}`}
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
              placeholder="Type a tag, press Enter to add..."
            />
            {input.trim() && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {existingMatch ? (
                  <>Existing tag detected — will reuse <span className="font-medium">"{existingMatch}"</span>.</>
                ) : (
                  <>Will create new tag <span className="font-medium">"{input.trim()}"</span>.</>
                )}
              </p>
            )}
          </div>

          {suggestions.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(tag => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border border-border/60 bg-background",
                      "hover:bg-accent hover:text-accent-foreground transition-colors"
                    )}
                  >
                    + {tag}
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
