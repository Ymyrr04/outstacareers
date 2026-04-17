import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Save, Loader2, UserCircle, X, Copy } from 'lucide-react';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { toast as sonnerToast } from 'sonner';
import { copyHtmlAndWhatsApp } from '@/lib/htmlToWhatsApp';

interface CandidateProfileSectionProps {
  applicantId: string;
  candidateProfile: string | null;
  onUpdate: (newProfile: string) => void;
}

export function CandidateProfileSection({
  applicantId,
  candidateProfile,
  onUpdate,
}: CandidateProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState(candidateProfile || '');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleStartEdit = () => {
    setProfile(candidateProfile || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setProfile(candidateProfile || '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('applicants_prescreen')
        .update({ candidate_profile: profile.trim() || null })
        .eq('id', applicantId);

      if (error) throw error;

      onUpdate(profile.trim());
      setIsEditing(false);
      toast({
        title: 'Saved',
        description: 'Candidate profile updated',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-blue-600" />
          Candidate Profile
        </h4>
        {isEditing ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
              className="text-muted-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            {candidateProfile && (
              <Button
                variant="ghost"
                size="sm"
              onClick={async () => {
                  await copyHtmlAndWhatsApp(candidateProfile);
                  sonnerToast.success('Profile copied (formatted for WhatsApp too)');
                }}
                className="text-muted-foreground"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartEdit}
              className="text-blue-700 hover:text-blue-800 hover:bg-blue-100"
            >
              <Pencil className="w-4 h-4 mr-1" />
              {candidateProfile ? 'Edit' : 'Add Profile'}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <NotesEditor
          value={profile}
          onChange={setProfile}
          placeholder="Add internal profile summary...&#10;&#10;• Key strengths and positioning&#10;• Suitable clients or industries&#10;• Notable skills or experience"
          minHeight="120px"
        />
      ) : candidateProfile ? (
        <FormattedNotes content={candidateProfile} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No candidate profile yet. Click "Add Profile" to add a summary highlighting strengths, positioning, and client suitability.
        </p>
      )}
    </div>
  );
}
