import { useState, useEffect, useImperativeHandle, forwardRef, memo } from 'react';
import { NotesEditor } from '@/components/NotesEditor';

export interface ApplicantNotesEditorRef {
  getValue: () => string;
}

interface ApplicantNotesEditorProps {
  initialValue: string;
  placeholder?: string;
}

/**
 * Isolated notes editor that manages its own local state to prevent
 * parent re-renders on every keystroke. Parent reads value via ref.
 */
export const ApplicantNotesEditor = memo(forwardRef<ApplicantNotesEditorRef, ApplicantNotesEditorProps>(
  function ApplicantNotesEditor({ initialValue, placeholder = "Add notes about this applicant..." }, ref) {
    const [localValue, setLocalValue] = useState(initialValue);

    // Sync local state when initialValue changes (e.g., when switching applicants)
    useEffect(() => {
      setLocalValue(initialValue);
    }, [initialValue]);

    // Expose getValue method to parent
    useImperativeHandle(ref, () => ({
      getValue: () => localValue
    }), [localValue]);

    return (
      <NotesEditor 
        value={localValue}
        onChange={setLocalValue}
        placeholder={placeholder}
      />
    );
  }
));
