import { useState } from 'react';
import { Pencil, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  EMAIL_TO_NAME,
  USER_ID_TO_EMAIL,
  getAdminDisplayName,
} from '@/lib/adminDisplayNames';

interface Props {
  contractorId: string;
  value: string | null;
  onSaved: (newValue: string | null) => void;
}

// Build admin options: prefer uuid value so it links back to auth user when possible
const EMAIL_TO_USER_ID: Record<string, string> = Object.fromEntries(
  Object.entries(USER_ID_TO_EMAIL).map(([uid, email]) => [email, uid])
);

const ADMIN_OPTIONS = Object.entries(EMAIL_TO_NAME).map(([email, name]) => ({
  value: EMAIL_TO_USER_ID[email] || email,
  label: name,
}));

export const HiredByEditor = ({ contractorId, value, onSaved }: Props) => {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (next: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from('contractor_assignments')
      .update({ hired_by: next })
      .eq('id', contractorId);
    setSaving(false);
    if (error) {
      toast.error('Failed to update Hired By');
      return;
    }
    toast.success('Hired By updated');
    onSaved(next);
    setOpen(false);
    setManual('');
  };

  return (
    <div className="flex items-center gap-1.5 group">
      <span className="text-sm whitespace-nowrap">
        {value ? getAdminDisplayName(value) : <span className="text-muted-foreground">Kristine{"\n"}</span>}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-3" align="start">
          <div className="space-y-1.5">
            <Label className="text-xs">Select admin</Label>
            <div className="grid grid-cols-2 gap-1">
              {ADMIN_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={value === opt.value ? 'default' : 'outline'}
                  size="sm"
                  disabled={saving}
                  className="h-8 text-xs justify-start"
                  onClick={() => save(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Or type a name</Label>
            <div className="flex gap-1.5">
              <Input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Enter name"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manual.trim()) save(manual.trim());
                }}
              />
              <Button
                size="icon"
                className="h-8 w-8"
                disabled={!manual.trim() || saving}
                onClick={() => save(manual.trim())}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs w-full text-muted-foreground"
              disabled={saving}
              onClick={() => save(null)}
            >
              Clear
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
