import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import '@/styles/announcement-typography.css';

interface FormattedNotesProps {
  content: string;
  className?: string;
  preserveFormatting?: boolean;
  announcementImages?: Record<string, string>;
}

/**
 * Renders notes with HTML formatting from WYSIWYG editor.
 * Falls back to markdown-style parsing for legacy content.
 */
export function FormattedNotes({ content, className = '', preserveFormatting = false, announcementImages }: FormattedNotesProps) {
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
    
    if (announcementImages) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('img').forEach(img => {
        const id = img.getAttribute('data-file-id') || '';
        const url = announcementImages[id];
        if (!url) { img.remove(); return; }
        img.setAttribute('src', url);
        img.setAttribute('width', String(Math.min(1200, Math.max(50, Number(img.getAttribute('width')) || 500))));
        img.removeAttribute('height');
        img.setAttribute('class', 'max-w-full h-auto');
      });
      html = doc.body.innerHTML;
    }
    // Sanitize the HTML
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 'a', 'br', 'ul', 'ol', 'li', ...(announcementImages ? ['img'] : []), ...(preserveFormatting ? ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 's'] : [])],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', ...(announcementImages ? ['src', 'alt', 'width', 'data-file-id'] : []), ...(preserveFormatting ? ['start'] : [])],
    });
  }, [content, preserveFormatting, announcementImages]);

  if (!content) {
    return null;
  }

  return (
    <div 
      className={`${preserveFormatting ? 'announcement-typography max-w-none' : 'text-sm text-foreground prose prose-sm max-w-none [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:text-primary [&_a]:hover:underline'} ${className}`}
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
}
