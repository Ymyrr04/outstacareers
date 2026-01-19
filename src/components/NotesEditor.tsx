import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { RichTextToolbar } from '@/components/RichTextToolbar';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-2">
      <RichTextToolbar
        value={value}
        onChange={onChange}
        textareaRef={textareaRef}
        disabled={disabled}
      />
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-background"
        style={{ minHeight }}
      />
    </div>
  );
}
