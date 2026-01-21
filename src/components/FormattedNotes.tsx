import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface FormattedNotesProps {
  content: string;
  className?: string;
}

/**
 * Renders notes with HTML formatting from WYSIWYG editor.
 * Falls back to markdown-style parsing for legacy content.
 */
export function FormattedNotes({ content, className = '' }: FormattedNotesProps) {
  const formattedHtml = useMemo(() => {
    if (!content) return '';
    
    // Check if content is already HTML (from TipTap editor)
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    
    let html: string;
    
    if (isHtml) {
      // Content is already HTML, just sanitize it
      html = content;
    } else {
      // Legacy markdown content - convert to HTML
      html = content
        // Escape HTML first
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Convert markdown to HTML
        // Bold: **text** (must come before italic)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Underline: __text__
        .replace(/__(.+?)__/g, '<u>$1</u>')
        // Italic: *text* (single asterisk, not already part of **)
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        // Links: [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>')
        // Line breaks
        .replace(/\n/g, '<br />');
    }
    
    // Sanitize the HTML
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 'a', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <div 
      className={`text-sm text-foreground prose prose-sm max-w-none [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:text-primary [&_a]:hover:underline ${className}`}
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
}
