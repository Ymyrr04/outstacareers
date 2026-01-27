import DOMPurify from 'dompurify';

// Fix UTF-8 mojibake (characters double-encoded as Latin-1)
const fixMojibake = (text: string): string => {
  if (!text) return text;
  
  // Common mojibake replacements (UTF-8 interpreted as Latin-1)
  const replacements: [RegExp, string][] = [
    [/â€™/g, "'"],      // Right single quote
    [/â€˜/g, "'"],      // Left single quote  
    [/â€œ/g, '"'],      // Left double quote
    [/â€[]/g, '"'],      // Right double quote
    [/â€"/g, '—'],      // Em dash
    [/â€"/g, '–'],      // En dash
    [/â€¦/g, '…'],      // Ellipsis
    [/Â /g, ' '],       // Non-breaking space artifact
    [/Â·/g, '·'],       // Middle dot
    [/â€¢/g, '•'],      // Bullet
    [/Ã©/g, 'é'],       // e acute
    [/Ã¨/g, 'è'],       // e grave
    [/Ã /g, 'à'],       // a grave
    [/Ã¢/g, 'â'],       // a circumflex
    [/Ã®/g, 'î'],       // i circumflex
    [/Ã´/g, 'ô'],       // o circumflex
    [/Ã»/g, 'û'],       // u circumflex
    [/Ã§/g, 'ç'],       // c cedilla
    [/Ã±/g, 'ñ'],       // n tilde
  ];
  
  let fixed = text;
  for (const [pattern, replacement] of replacements) {
    fixed = fixed.replace(pattern, replacement);
  }
  
  return fixed;
};

// Clean email reply content by removing MIME attachment data, base64 content, and headers
export const cleanEmailReplyContent = (content: string): string => {
  if (!content) return content;
  
  let cleaned = content;
  
  // Remove Content-Disposition lines (attachment headers)
  cleaned = cleaned.replace(/Content-Disposition:\s*[^\n]*/gi, '');
  
  // Remove Content-ID lines
  cleaned = cleaned.replace(/Content-ID:\s*[^\n]*/gi, '');
  
  // Remove X-Attachment-Id lines
  cleaned = cleaned.replace(/X-Attachment-Id:\s*[^\n]*/gi, '');
  
  // Remove Content-Type lines
  cleaned = cleaned.replace(/Content-Type:\s*[^\n]*/gi, '');
  
  // Remove Content-Transfer-Encoding lines
  cleaned = cleaned.replace(/Content-Transfer-Encoding:\s*[^\n]*/gi, '');
  
  // Remove MIME boundary markers
  cleaned = cleaned.replace(/--[a-zA-Z0-9_=-]+--?/g, '');
  
  // Remove base64 encoded blocks (long strings of alphanumeric characters without spaces)
  // Base64 blocks typically have 60+ chars per line with no spaces
  cleaned = cleaned.replace(/^[A-Za-z0-9+/=]{60,}$/gm, '');
  
  // Remove remaining isolated base64-like lines (shorter ones that might be attachment chunks)
  cleaned = cleaned.replace(/\n[A-Za-z0-9+/=]{40,}\n/g, '\n');
  
  // Remove filename references that look like attachment metadata
  cleaned = cleaned.replace(/filename="[^"]+"/gi, '');
  cleaned = cleaned.replace(/name="[^"]+"/gi, '');
  
  // Clean up multiple consecutive newlines/breaks
  cleaned = cleaned.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Remove empty div tags
  cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
};

export const sanitizeHtml = (html: string): string => {
  // First fix any mojibake encoding issues
  const fixedHtml = fixMojibake(html);
  
  return DOMPurify.sanitize(fixedHtml, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
    ALLOWED_ATTR: ['href', 'target', 'style', 'class'],
    ALLOW_DATA_ATTR: false,
  });
};

// Sanitize email reply content - cleans MIME artifacts then sanitizes HTML
export const sanitizeEmailReply = (html: string): string => {
  const cleaned = cleanEmailReplyContent(html);
  return sanitizeHtml(cleaned);
};
