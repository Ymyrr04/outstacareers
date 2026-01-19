import { WysiwygEditor } from '@/components/WysiwygEditor';

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
}

export function NotesEditor({ 
  value, 
  onChange, 
  placeholder = "Add notes...",
  disabled = false,
  minHeight = "100px"
}: NotesEditorProps) {
  return (
    <WysiwygEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      minHeight={minHeight}
    />
  );
}
