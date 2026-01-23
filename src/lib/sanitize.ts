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

export const sanitizeHtml = (html: string): string => {
  // First fix any mojibake encoding issues
  const fixedHtml = fixMojibake(html);
  
  return DOMPurify.sanitize(fixedHtml, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
    ALLOWED_ATTR: ['href', 'target', 'style', 'class'],
    ALLOW_DATA_ATTR: false,
  });
};
