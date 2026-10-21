import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Edit2, Loader2, Save } from 'lucide-react';

interface ClientProfileTabProps {
  clientId: string;
  profile: string | null;
  onUpdate: () => void;
}

export function ClientProfileTab({ clientId, profile, onUpdate }: ClientProfileTabProps) {
  const [savedProfile, setSavedProfile] = useState(profile || '');
  const [draft, setDraft] = useState(profile || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSavedProfile(profile || '');
  }, [profile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from('clients')
        .update({ client_profile: draft.trim() || null })
        .eq('id', clientId)
        .select('client_profile')
        .single();
      if (error) throw error;
      setSavedProfile(data.client_profile || '');
      setEditing(false);
      onUpdate();
      toast({ title: 'Client profile saved' });
    } catch (error) {
      toast({
        title: 'Unable to save client profile',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Client Profile</h3>
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={saveProfile}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save profile
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setDraft(savedProfile); setEditing(true); }}>
            <Edit2 className="w-4 h-4 mr-1" />
            {savedProfile ? 'Edit profile' : 'Add profile'}
          </Button>
        )}
      </div>
      {editing ? (
        <NotesEditor value={draft} onChange={setDraft} placeholder="Client summary description..." minHeight="180px" disabled={saving} />
      ) : savedProfile ? (
        <div className="min-w-0 break-words"><FormattedNotes content={savedProfile} /></div>
      ) : (
        <p className="text-sm text-muted-foreground">No client profile yet.</p>
      )}
    </div>
  );
}