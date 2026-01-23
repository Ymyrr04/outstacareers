import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

interface CommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void;
  onTabPress?: () => boolean; // Return true if handled externally (e.g., mention selection)
  compact?: boolean;
}

export interface CommentEditorRef {
  focus: () => void;
  clear: () => void;
}

export const CommentEditor = forwardRef<CommentEditorRef, CommentEditorProps>(({
  value,
  onChange,
  placeholder = "Add a comment...",
  disabled = false,
  onSubmit,
  onTabPress,
  compact = true
}, ref) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

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
        openOnClick: true,
        autolink: true, // Auto-detect links while typing
        linkOnPaste: true, // Auto-convert pasted URLs to links
        HTMLAttributes: {
          class: 'text-primary hover:underline cursor-pointer',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-3 py-2 ${compact ? 'min-h-[36px]' : 'min-h-[80px]'}`,
      },
      handleKeyDown: (view, event) => {
        // Handle Tab for mention auto-complete
        if (event.key === 'Tab' && onTabPress) {
          const handled = onTabPress();
          if (handled) {
            event.preventDefault();
            return true;
          }
        }
        // Submit on Enter (without shift)
        if (event.key === 'Enter' && !event.shiftKey && onSubmit) {
          const content = view.state.doc.textContent.trim();
          if (content) {
            event.preventDefault();
            onSubmit();
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        // Check if we have HTML content
        const htmlContent = event.clipboardData?.getData('text/html');
        if (htmlContent && htmlContent.includes('<')) {
          // Convert ordered lists to unordered lists in HTML
          if (htmlContent.includes('<ol') || htmlContent.includes('<OL')) {
            event.preventDefault();
            const convertedHtml = htmlContent
              .replace(/<ol([^>]*)>/gi, '<ul$1>')
              .replace(/<\/ol>/gi, '</ul>');
            
            const editorInstance = (view as any).editor;
            if (editorInstance) {
              editorInstance.chain().focus().insertContent(convertedHtml).run();
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
        
        // Check for bullet point patterns
        const bulletPattern = /^[\s]*[•▪▸►○●·∙◦]\s*/;
        const dashPattern = /^[\s]*-\s+/;
        const numberedPattern = /^[\s]*\d+[\.\)]\s+/;
        
        const bulletCount = nonEmptyLines.filter(line => bulletPattern.test(line) || dashPattern.test(line)).length;
        const numberedCount = nonEmptyLines.filter(line => numberedPattern.test(line)).length;
        
        const hasBullets = bulletCount >= 2;
        const hasNumbers = numberedCount >= 2;
        
        if (hasBullets || hasNumbers) {
          event.preventDefault();
          
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
          
          const editorInstance = (view as any).editor;
          if (editorInstance && html) {
            editorInstance.chain().focus().insertContent(html).run();
            return true;
          }
        }
        
        return false;
      },
    },
  });

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    clear: () => editor?.commands.clearContent(),
  }));

  useEffect(() => {
    if (editor && value !== editor.getHTML() && value !== (editor.getHTML() === '<p></p>' ? '' : editor.getHTML())) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

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

    if (editor.state.selection.empty) {
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
    <div className="border rounded-md overflow-hidden bg-background flex-1">
      {/* Compact Toolbar */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 border-b bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${editor.isActive('bold') ? 'bg-muted' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${editor.isActive('italic') ? 'bg-muted' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${editor.isActive('underline') ? 'bg-muted' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={disabled}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-3 w-3" />
        </Button>
        
        <div className="w-px h-4 bg-border mx-0.5" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${editor.isActive('bulletList') ? 'bg-muted' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          title="Bullet List"
        >
          <List className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${editor.isActive('orderedList') ? 'bg-muted' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          title="Numbered List"
        >
          <ListOrdered className="h-3 w-3" />
        </Button>
        
        <div className="w-px h-4 bg-border mx-0.5" />
        
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 w-6 p-0 ${editor.isActive('link') ? 'bg-muted' : ''}`}
              disabled={disabled}
              title="Insert Link"
            >
              <LinkIcon className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="comment-link-url" className="text-xs">URL</Label>
                <Input
                  id="comment-link-url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInsertLink();
                    }
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                {editor.isActive('link') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      editor.chain().focus().unsetLink().run();
                      setLinkPopoverOpen(false);
                    }}
                  >
                    Remove
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleInsertLink}
                  disabled={!linkUrl}
                >
                  Insert
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        <span className="ml-auto text-[10px] text-muted-foreground pr-1">
          Enter to send
        </span>
      </div>
      
      {/* Editor Content */}
      <EditorContent 
        editor={editor} 
        className="[&_.ProseMirror]:min-h-[36px] [&_.ProseMirror]:max-h-[300px] [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror_p]:my-0 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-4 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-4 [&_.ProseMirror_li]:my-0"
      />
      
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
});

CommentEditor.displayName = 'CommentEditor';
