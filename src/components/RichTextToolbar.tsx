import { useRef, useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bold, Italic, Underline, Link2, List, ListOrdered, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';

const SCHEDULE_TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? 'AM' : 'PM';
    const minStr = m === 0 ? '00' : '30';
    SCHEDULE_TIME_SLOTS.push(`${hour12}:${minStr} ${ampm}`);
  }
}

interface RichTextToolbarProps {
  value: string;
  onChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  disabled?: boolean;
  placeholders?: string[];
  onInsertPlaceholder?: (placeholder: string) => void;
}

export function RichTextToolbar({ value, onChange, textareaRef, disabled, placeholders, onInsertPlaceholder }: RichTextToolbarProps) {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);

  // Use ref for value to avoid recreating callbacks on every keystroke
  const valueRef = useRef(value);
  valueRef.current = value;

  // Get current selection - no dependencies on value to prevent recreating on each keystroke
  const getSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { start: 0, end: 0, text: '' };
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      text: valueRef.current.substring(textarea.selectionStart, textarea.selectionEnd)
    };
  }, [textareaRef]);

  // Wrap selected text with markers
  const wrapSelection = useCallback((before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start, end, text } = getSelection();
    const currentValue = valueRef.current;
    const newText = currentValue.substring(0, start) + before + text + after + currentValue.substring(end);
    onChange(newText);

    // Restore cursor position after the wrapped text
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + text.length + after.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [onChange, getSelection, textareaRef]);

  // Insert text at cursor
  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start, end } = getSelection();
    const currentValue = valueRef.current;
    const newText = currentValue.substring(0, start) + text + currentValue.substring(end);
    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + text.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [onChange, getSelection, textareaRef]);

  // Handle bold
  const handleBold = useCallback(() => {
    wrapSelection('**', '**');
  }, [wrapSelection]);

  // Handle italic  
  const handleItalic = useCallback(() => {
    wrapSelection('*', '*');
  }, [wrapSelection]);

  // Handle underline
  const handleUnderline = useCallback(() => {
    wrapSelection('__', '__');
  }, [wrapSelection]);

  // Handle bullet list
  const handleBulletList = useCallback(() => {
    const { text } = getSelection();
    if (text) {
      const lines = text.split('\n').map(line => `• ${line}`).join('\n');
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { start, end } = getSelection();
      const currentValue = valueRef.current;
      const newText = currentValue.substring(0, start) + lines + currentValue.substring(end);
      onChange(newText);
    } else {
      insertAtCursor('\n• ');
    }
  }, [getSelection, insertAtCursor, onChange, textareaRef]);

  // Handle numbered list
  const handleNumberedList = useCallback(() => {
    const { text } = getSelection();
    if (text) {
      const lines = text.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { start, end } = getSelection();
      const currentValue = valueRef.current;
      const newText = currentValue.substring(0, start) + lines + currentValue.substring(end);
      onChange(newText);
    } else {
      insertAtCursor('\n1. ');
    }
  }, [getSelection, insertAtCursor, onChange, textareaRef]);

  // Handle link insertion
  const handleOpenLinkPopover = useCallback(() => {
    const { text, start, end } = getSelection();
    setSelectionRange({ start, end });
    setLinkText(text);
    setLinkUrl('');
    setLinkPopoverOpen(true);
  }, [getSelection]);

  const handleInsertLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    
    const displayText = linkText.trim() || linkUrl;
    const linkMarkup = `[${displayText}](${linkUrl})`;
    
    const textarea = textareaRef.current;
    if (!textarea || !selectionRange) return;

    const currentValue = valueRef.current;
    const newText = currentValue.substring(0, selectionRange.start) + linkMarkup + currentValue.substring(selectionRange.end);
    onChange(newText);

    setLinkPopoverOpen(false);
    setLinkText('');
    setLinkUrl('');
    setSelectionRange(null);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectionRange.start + linkMarkup.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [linkText, linkUrl, onChange, textareaRef, selectionRange]);

  // Keyboard shortcut handler (Ctrl+K for link)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        handleOpenLinkPopover();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleBold();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        handleItalic();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        handleUnderline();
      }
    };

    textarea.addEventListener('keydown', handleKeyDown);
    return () => textarea.removeEventListener('keydown', handleKeyDown);
  }, [textareaRef, handleOpenLinkPopover, handleBold, handleItalic, handleUnderline]);

  return (
    <div className="flex items-center gap-1 p-1.5 border-b bg-muted/30 rounded-t-md">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={handleBold}
        disabled={disabled}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={handleItalic}
        disabled={disabled}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={handleUnderline}
        disabled={disabled}
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-3.5 w-3.5" />
      </Button>
      
      <div className="w-px h-4 bg-border mx-1" />
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={handleBulletList}
        disabled={disabled}
        title="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={handleNumberedList}
        disabled={disabled}
        title="Numbered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>
      
      <div className="w-px h-4 bg-border mx-1" />
      
      <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={handleOpenLinkPopover}
            disabled={disabled}
            title="Insert Link (Ctrl+K)"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">Link</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Display Text</Label>
              <Input
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Text to display"
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInsertLink();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLinkPopoverOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleInsertLink}
                disabled={!linkUrl.trim()}
              >
                Insert
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {placeholders && placeholders.length > 0 && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1 text-xs"
                disabled={disabled}
                title="Insert placeholder"
              >
                <span className="text-[10px]">{'{ }'}</span>
                <span className="hidden sm:inline">Insert</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">Click to insert</p>
                {placeholders.map(p => (
                  <Button
                    key={p}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 justify-start font-mono text-xs"
                    onClick={() => {
                      if (onInsertPlaceholder) {
                        onInsertPlaceholder(p);
                      } else {
                        insertAtCursor(p);
                      }
                    }}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}
      
      <span className="text-[10px] text-muted-foreground ml-auto hidden sm:block">
        Ctrl+K for link
      </span>
    </div>
  );
}
