import { WysiwygEditor } from '@/components/WysiwygEditor';
import type { Editor, Extensions } from '@tiptap/core';

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  autoFocus?: boolean;
  preservePasteFormatting?: boolean;
  extensions?: Extensions;
  onReady?: (editor: Editor) => void;
}

export function NotesEditor({ 
  value, 
  onChange, 
  placeholder = "Add notes...",
  disabled = false,
  minHeight = "100px",
  autoFocus = false,
  preservePasteFormatting = false,
  extensions,
  onReady,
}: NotesEditorProps) {
  return (
    <WysiwygEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      minHeight={minHeight}
      autoFocus={autoFocus}
      preservePasteFormatting={preservePasteFormatting}
      extensions={extensions}
      onReady={onReady}
    />
  );
}
