import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface FormattedNotesProps {
  content: string;
  className?: string;
}

/**
 * Renders notes with markdown-style formatting:
 * - **bold** or __underline__
 * - *italic*
 * - [link text](url)
 * - • bullet points
 */
export function FormattedNotes({ content, className = '' }: FormattedNotesProps) {
  const formattedHtml = useMemo(() => {
    if (!content) return '';
    
    let html = content
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
    
    // Sanitize the HTML
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['strong', 'em', 'u', 'a', 'br'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <div 
      className={`text-sm text-muted-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
}
