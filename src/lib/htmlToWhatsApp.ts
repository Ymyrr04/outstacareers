/**
 * Converts HTML (from TipTap/WYSIWYG editor) into WhatsApp-friendly
 * plain text using WhatsApp's lightweight markdown:
 *   *bold*  _italic_  ~strikethrough~  ```mono```
 * Lists become "• item" lines, links become "text (url)".
 */
export function htmlToWhatsAppText(html: string): string {
  if (!html) return '';

  let text = html;

  // Normalize line breaks
  text = text.replace(/<br\s*\/?>(\n)?/gi, '\n');

  // Bold: <strong>/<b>  ->  *text*
  text = text.replace(/<\s*(strong|b)(\s[^>]*)?>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$3*');

  // Italic: <em>/<i>  ->  _text_
  text = text.replace(/<\s*(em|i)(\s[^>]*)?>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '_$3_');

  // Underline: WhatsApp has no underline — keep text as-is (strip tags)
  text = text.replace(/<\s*u(\s[^>]*)?>([\s\S]*?)<\s*\/\s*u\s*>/gi, '$2');

  // Strikethrough: <s>/<del>/<strike>  ->  ~text~
  text = text.replace(/<\s*(s|del|strike)(\s[^>]*)?>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '~$3~');

  // Inline code: <code>  ->  ```text```
  text = text.replace(/<\s*code(\s[^>]*)?>([\s\S]*?)<\s*\/\s*code\s*>/gi, '```$2```');

  // Links: <a href="url">text</a>  ->  text (url)
  text = text.replace(
    /<\s*a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
    (_, url, label) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
      if (!cleanLabel) return url;
      if (cleanLabel === url) return url;
      return `${cleanLabel} (${url})`;
    }
  );

  // Bullet list items
  text = text.replace(/<\s*li(\s[^>]*)?>([\s\S]*?)<\s*\/\s*li\s*>/gi, '• $2\n');

  // Headings -> bold + newline
  text = text.replace(/<\s*h[1-6](\s[^>]*)?>([\s\S]*?)<\s*\/\s*h[1-6]\s*>/gi, '*$2*\n');

  // Paragraphs and divs -> newlines
  text = text.replace(/<\s*\/\s*(p|div|ul|ol|h[1-6])\s*>/gi, '\n');
  text = text.replace(/<\s*(p|div|ul|ol)(\s[^>]*)?>/gi, '');

  // Strip any remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x2019;': '\u2019',
    '&#x2018;': '\u2018',
    '&#x201C;': '\u201C',
    '&#x201D;': '\u201D',
  };
  text = text.replace(/&[a-z#0-9]+;/gi, (m) => entities[m] ?? m);

  // Collapse 3+ newlines and trim
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Copies content to clipboard as both HTML (for rich-text apps like
 * Gmail/Docs) AND WhatsApp-friendly markdown text (for WhatsApp/Slack).
 */
export async function copyHtmlAndWhatsApp(html: string): Promise<void> {
  const waText = htmlToWhatsAppText(html);
  try {
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([waText], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
    ]);
  } catch {
    // Fallback: plain text only
    await navigator.clipboard.writeText(waText);
  }
}
