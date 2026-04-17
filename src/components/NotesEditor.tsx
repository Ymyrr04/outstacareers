import { WysiwygEditor } from '@/components/WysiwygEditor';

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  autoFocus?: boolean;
}

export function NotesEditor({ 
  value, 
  onChange, 
  placeholder = "Add notes...",
  disabled = false,
  minHeight = "100px",
  autoFocus = false,
}: NotesEditorProps) {
  return (
    <WysiwygEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      minHeight={minHeight}
      autoFocus={autoFocus}
    />
  );
}
