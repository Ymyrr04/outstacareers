import { useState, useEffect, useRef, memo } from 'react';
import { NotesEditor } from '@/components/NotesEditor';

interface ApplicantNotesEditorProps {
  initialValue: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Isolated notes editor that manages its own local state to prevent
 * parent re-renders on every keystroke. Syncs value back to parent
 * via debounced onValueChange callback.
 */
export const ApplicantNotesEditor = memo(function ApplicantNotesEditor({ 
  initialValue, 
  onValueChange,
  placeholder = "Add notes about this applicant..."
}: ApplicantNotesEditorProps) {
  const [localValue, setLocalValue] = useState(initialValue);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  // Sync local state when initialValue changes (e.g., when switching applicants)
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // Debounce sync to parent to prevent re-renders on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      onValueChangeRef.current(localValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [localValue]);

  return (
    <NotesEditor 
      value={localValue}
      onChange={setLocalValue}
      placeholder={placeholder}
    />
  );
});
