import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addClientProfileSection, clientProfileSectionsHtml, isRetiredProfileSectionTitle, loadClientProfileSections } from '@/lib/clientProfileSections';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Edit2, Loader2, Plus, Save } from 'lucide-react';

interface ClientProfileTabProps {
  clientId: string;
  profile: string | null;
  sections: unknown;
  onUpdate: () => void;
}

export function ClientProfileTab({ clientId, profile, sections, onUpdate }: ClientProfileTabProps) {
  const [savedSections, setSavedSections] = useState(() => loadClientProfileSections(sections, profile));
  const [draft, setDraft] = useState(() => loadClientProfileSections(sections, profile));
  const [sectionTitle, setSectionTitle] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSavedSections(loadClientProfileSections(sections, profile));
  }, [profile, sections]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from('clients')
        .update({ client_profile_sections: draft.map(section => ({ ...section })), client_profile: clientProfileSectionsHtml(draft) })
        .eq('id', clientId)
        .select('client_profile, client_profile_sections')
        .single();
      if (error) throw error;
      setSavedSections(loadClientProfileSections(data.client_profile_sections, data.client_profile));
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
          <Button size="sm" variant="outline" onClick={() => { setDraft(savedSections.map(section => ({ ...section }))); setSectionTitle(''); setEditing(true); }}>
            <Edit2 className="w-4 h-4 mr-1" />
            Edit profile
          </Button>
        )}
      </div>
      <div className="space-y-5">
        {(editing ? draft : savedSections).map(section => (
          <section key={section.id} className="min-w-0 space-y-2 border-t pt-3 break-words">
            <h4 className="text-sm font-semibold">{section.title}</h4>
            {editing ? (
              <NotesEditor value={section.content} onChange={content => setDraft(current => current.map(item => item.id === section.id ? { ...item, content } : item))} placeholder="Add description..." minHeight="100px" disabled={saving} />
            ) : section.content ? <FormattedNotes content={section.content} /> : <p className="text-sm text-muted-foreground">Not added yet.</p>}
          </section>
        ))}
      </div>
      {editing ? (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor="new-profile-section">Section name</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="new-profile-section" className="flex-1 min-w-0" value={sectionTitle} onChange={event => setSectionTitle(event.target.value)} disabled={saving} placeholder="New section name" />
            <Button size="sm" variant="outline" disabled={saving || !sectionTitle.trim() || isRetiredProfileSectionTitle(sectionTitle)} onClick={() => { setDraft(current => addClientProfileSection(current, sectionTitle, crypto.randomUUID())); setSectionTitle(''); }}>
              <Plus className="w-4 h-4 mr-1" />Add section
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => { setDraft(savedSections.map(section => ({ ...section }))); setSectionTitle(''); setEditing(true); }}>
          <Plus className="w-4 h-4 mr-1" />Add section
        </Button>
      )}
    </div>
  );
}