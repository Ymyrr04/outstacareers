import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FormattedNotes } from '@/components/FormattedNotes';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { format } from 'date-fns';
import { formatDateTime } from "@/lib/dateFormat";

interface ApplicantNote {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export function ApplicantNotesSection({ applicantId }: { applicantId: string }) {
  const [notes, setNotes] = useState<ApplicantNote[]>([]);

  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('applicant_notes')
      .select('id, content, created_by, created_at')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false });
    setNotes((data as ApplicantNote[]) || []);
  }, [applicantId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  if (notes.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/30 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Interview Notes</p>
      {notes.map((note) => (
        <div key={note.id} className="rounded-md bg-background/60 border p-2.5 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{getAdminDisplayName(note.created_by, 'Unknown')}</span>
            <span>•</span>
            <span>{formatDateTime(note.created_at)}</span>
          </div>
          <FormattedNotes content={note.content} />
        </div>
      ))}
    </div>
  );
}
