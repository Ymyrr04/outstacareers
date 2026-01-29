import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useCallback, useRef } from 'react';

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
}

export function WysiwygEditor({
  value,
  onChange,
  placeholder = "Add notes...",
  disabled = false,
  minHeight = "100px"
}: WysiwygEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [bubbleMenuPos, setBubbleMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isHoveringMenu, setIsHoveringMenu] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const bubbleMenuRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track mouse down/up to show toolbar only after selection is complete
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Don't hide menu if clicking inside it
      if (bubbleMenuRef.current && bubbleMenuRef.current.contains(e.target as Node)) {
        return;
      }
      
      setIsMouseDown(true);
      setShowBubbleMenu(false);
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
    
    const handleMouseUp = () => {
      setIsMouseDown(false);
      // Show bubble menu with delay after mouse is released (if there's a selection)
      if (hasSelection) {
        showTimeoutRef.current = setTimeout(() => {
          setShowBubbleMenu(true);
        }, 150); // 150ms delay
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, [hasSelection]);

  // Track mouse position ONLY during selection (before menu is shown)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      
      // Only update position while dragging (before menu appears)
      // Once showBubbleMenu is true, stop tracking - the position is locked
      if (isMouseDown && hasSelection && !showBubbleMenu && editorRef.current) {
        const editorRect = editorRef.current.getBoundingClientRect();
        
        // Position relative to editor, centered on mouse X
        let left = e.clientX - editorRect.left;
        const menuHalfWidth = 120;
        left = Math.max(menuHalfWidth, Math.min(left, editorRect.width - menuHalfWidth));
        
        // Position above the mouse cursor
        const top = e.clientY - editorRect.top - 50;
        
        setBubbleMenuPos({ top: Math.max(0, top), left });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isMouseDown, hasSelection, showBubbleMenu]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary hover:underline cursor-pointer',
        },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Convert empty paragraph to empty string
      onChange(html === '<p></p>' ? '' : html);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from === to || editor.state.selection.empty) {
        setHasSelection(false);
        setShowBubbleMenu(false);
        setBubbleMenuPos(null);
        if (showTimeoutRef.current) {
          clearTimeout(showTimeoutRef.current);
        }
        return;
      }
      
      setHasSelection(true);
      
      // Set initial position based on current mouse position (will be shown after mouseup)
      if (editorRef.current) {
        const editorRect = editorRef.current.getBoundingClientRect();
        let left = mousePos.current.x - editorRect.left;
        const menuHalfWidth = 120;
        left = Math.max(menuHalfWidth, Math.min(left, editorRect.width - menuHalfWidth));
        const top = mousePos.current.y - editorRect.top - 50;
        setBubbleMenuPos({ top: Math.max(0, top), left });
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none px-3 py-2',
        style: `min-height: ${minHeight}`,
      },
      handlePaste: (view, event) => {
        // Check if we have HTML content
        const htmlContent = event.clipboardData?.getData('text/html');
        if (htmlContent && htmlContent.includes('<')) {
          // Convert ordered lists to unordered lists in HTML
          if (htmlContent.includes('<ol') || htmlContent.includes('<OL')) {
            event.preventDefault();
            // Replace <ol> with <ul> and </ol> with </ul>
            const convertedHtml = htmlContent
              .replace(/<ol([^>]*)>/gi, '<ul$1>')
              .replace(/<\/ol>/gi, '</ul>');
            
            const editor = (view as any).editor;
            if (editor) {
              editor.chain().focus().insertContent(convertedHtml).run();
              return true;
            }
          }
          return false; // Let TipTap handle HTML paste natively
        }
        
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;
        
        // Split into lines
        const lines = text.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim());
        if (nonEmptyLines.length === 0) return false;
        
        // Check for bullet point patterns: •, -, *, ▪, ▸, ►, ○, ●, · (middle dot)
        const bulletPattern = /^[\s]*[•▪▸►○●·∙◦]\s*/;
        const dashPattern = /^[\s]*-\s+/;
        const numberedPattern = /^[\s]*\d+[\.\)]\s+/;
        
        // Count how many lines match each pattern
        const bulletCount = nonEmptyLines.filter(line => bulletPattern.test(line) || dashPattern.test(line)).length;
        const numberedCount = nonEmptyLines.filter(line => numberedPattern.test(line)).length;
        
        // Only intercept if we have a clear list structure (at least 3 list items)
        const hasBullets = bulletCount >= 3;
        const hasNumbers = numberedCount >= 3;
        
        if (hasBullets || hasNumbers) {
          event.preventDefault();
          
          // Process lines, preserving non-list content as paragraphs
          let html = '';
          let currentList: string[] = [];
          let listType: 'ul' | 'ol' | null = null;
          
          const flushList = () => {
            if (currentList.length > 0 && listType) {
              html += `<${listType}>${currentList.map(item => `<li>${item}</li>`).join('')}</${listType}>`;
              currentList = [];
              listType = null;
            }
          };
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              flushList();
              continue;
            }
            
            if (bulletPattern.test(line) || dashPattern.test(line)) {
              if (listType !== 'ul') {
                flushList();
                listType = 'ul';
              }
              currentList.push(trimmed.replace(bulletPattern, '').replace(dashPattern, '').trim());
            } else if (numberedPattern.test(line)) {
              // Convert numbered lists to bullet points by default
              if (listType !== 'ul') {
                flushList();
                listType = 'ul';
              }
              currentList.push(trimmed.replace(numberedPattern, '').trim());
            } else {
              flushList();
              html += `<p>${trimmed}</p>`;
            }
          }
          
          flushList();
          
          // Insert the processed HTML
          const editor = (view as any).editor;
          if (editor && html) {
            editor.chain().focus().insertContent(html).run();
            return true;
          }
        }
        
        // Let TipTap handle normal paste
        return false;
      },
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML() && value !== (editor.getHTML() === '<p></p>' ? '' : editor.getHTML())) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  const handleInsertLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    
    let url = linkUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // If there's a selection, turn it into a link
    if (editor.state.selection.empty) {
      // No selection, insert the URL as link text
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
    
    setLinkUrl('');
    setLinkPopoverOpen(false);
  }, [editor, linkUrl]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-md overflow-hidden bg-background relative" ref={editorRef}>
      {/* Floating Bubble Menu - appears when text is selected and mouse is released */}
      {showBubbleMenu && bubbleMenuPos && (
        <div 
          ref={bubbleMenuRef}
          className="absolute z-50 flex items-center gap-0.5 p-1 bg-background border rounded-lg shadow-lg animate-fade-in"
          style={{ 
            top: bubbleMenuPos.top, 
            left: bubbleMenuPos.left,
            transform: 'translateX(-50%)',
          }}
          onMouseEnter={() => setIsHoveringMenu(true)}
          onMouseLeave={() => setIsHoveringMenu(false)}
          onMouseDown={(e) => e.preventDefault()} // Prevent losing selection when clicking toolbar
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive('underline') ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 px-2 gap-1 ${editor.isActive('link') ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => setLinkPopoverOpen(true)}
            title="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            <span className="text-xs">Link</span>
          </Button>
        </div>
      )}

      {/* Static Toolbar */}
      <div className="flex items-center gap-0.5 p-1 border-b bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${editor.isActive('underline') ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={disabled}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-8 px-2 gap-1 ${editor.isActive('link') ? 'bg-primary text-primary-foreground' : ''}`}
              disabled={disabled}
              title="Insert Link (Ctrl+K)"
            >
              <LinkIcon className="h-4 w-4" />
              <span className="text-xs">Link</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="link-url">URL</Label>
                <Input
                  id="link-url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInsertLink();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                {editor.isActive('link') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      editor.chain().focus().unsetLink().run();
                      setLinkPopoverOpen(false);
                    }}
                  >
                    Remove Link
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleInsertLink}
                  disabled={!linkUrl}
                >
                  Insert Link
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Editor Content */}
      <div 
        className="overflow-y-auto" 
        style={{ maxHeight: minHeight === "100px" ? "200px" : `calc(${minHeight} * 2)` }}
      >
        <EditorContent 
          editor={editor} 
          className="[&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:p-3 [&_.ProseMirror_p]:my-1 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_li]:my-0.5"
          style={{ minHeight }}
        />
      </div>
      
      {/* Placeholder styles */}
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: '${placeholder}';
          color: hsl(var(--muted-foreground));
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
