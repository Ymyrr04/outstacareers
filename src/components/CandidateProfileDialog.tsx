import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { CandidateProfileSection } from '@/components/CandidateProfileSection';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { Loader2, Copy, Plus, Save, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface AdditionalProfile {
  id: string;
  title: string;
  content: string;
}

interface CandidateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
}

export function CandidateProfileDialog({ open, onOpenChange, applicantId, applicantName }: CandidateProfileDialogProps) {
  const [candidateProfile, setCandidateProfile] = useState<string | null>(null);
  const [additionalProfiles, setAdditionalProfiles] = useState<AdditionalProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profileRes, addlRes] = await Promise.all([
      supabase.from('applicants_prescreen').select('candidate_profile').eq('id', applicantId).single(),
      supabase.from('candidate_additional_profiles').select('id, title, content').eq('applicant_id', applicantId).order('created_at', { ascending: true }),
    ]);
    setCandidateProfile(profileRes.data?.candidate_profile ?? null);
    setAdditionalProfiles((addlRes.data as AdditionalProfile[]) || []);
    setLoading(false);
  }, [applicantId]);

  useEffect(() => {
    if (open) {
      fetchData();
      setIsAddingNew(false);
      setEditingId(null);
    }
  }, [open, fetchData]);

  const handleAddProfile = async () => {
    if (!newContent || newContent === '<p></p>') {
      toast.error('Profile content cannot be empty');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('candidate_additional_profiles').insert({
      applicant_id: applicantId,
      title: newTitle.trim(),
      content: newContent,
      created_by: user?.id || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Failed to add profile');
    } else {
      toast.success('Additional profile added');
      setIsAddingNew(false);
      setNewTitle('');
      setNewContent('');
      fetchData();
    }
  };

  const handleUpdateProfile = async (profileId: string) => {
    if (!editContent || editContent === '<p></p>') {
      toast.error('Profile content cannot be empty');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('candidate_additional_profiles')
      .update({ title: editTitle.trim(), content: editContent, updated_at: new Date().toISOString() })
      .eq('id', profileId);
    setSaving(false);
    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated');
      setEditingId(null);
      fetchData();
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    const { error } = await supabase.from('candidate_additional_profiles').delete().eq('id', profileId);
    if (error) {
      toast.error('Failed to delete profile');
    } else {
      toast.success('Profile deleted');
      fetchData();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Candidate Profile — {applicantName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Main Profile */}
            <CandidateProfileSection
              applicantId={applicantId}
              candidateProfile={candidateProfile}
              onUpdate={(newProfile) => setCandidateProfile(newProfile)}
            />

            {/* Additional Profiles */}
            {additionalProfiles.map((profile) => (
              <div key={profile.id} className="p-4 bg-green-50/50 dark:bg-green-950/20 rounded-lg border border-green-200/50 dark:border-green-800/30">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">
                    {profile.title || 'Additional Profile'}
                  </h4>
                  {editingId !== profile.id && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                        const tmp = document.createElement('div');
                        tmp.innerHTML = profile.content;
                        const plainText = tmp.innerText || tmp.textContent || '';
                        const blob = new Blob([profile.content], { type: 'text/html' });
                        const textBlob = new Blob([plainText], { type: 'text/plain' });
                        navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })]);
                        toast.success('Profile copied');
                      }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                        setEditingId(profile.id);
                        setEditTitle(profile.title);
                        setEditContent(profile.content);
                        setIsAddingNew(false);
                      }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDeleteProfile(profile.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {editingId === profile.id ? (
                  <div className="space-y-3">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Profile title (e.g. VA Profile, CSR Profile)"
                      className="text-sm"
                    />
                    <NotesEditor value={editContent} onChange={setEditContent} placeholder="Edit profile..." minHeight="100px" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleUpdateProfile(profile.id)} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <FormattedNotes content={profile.content} />
                )}
              </div>
            ))}

            {/* Add New Additional Profile */}
            {isAddingNew ? (
              <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Profile title (e.g. VA Profile, CSR Profile)"
                  className="text-sm"
                />
                <NotesEditor value={newContent} onChange={setNewContent} placeholder="Write additional profile..." minHeight="120px" />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setIsAddingNew(false); setNewTitle(''); setNewContent(''); }}>
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddProfile} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Profile
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { setIsAddingNew(true); setEditingId(null); }} className="gap-1.5 w-full">
                <Plus className="w-3.5 h-3.5" />
                Add Additional Profile
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
