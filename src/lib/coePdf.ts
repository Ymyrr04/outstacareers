import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import logoAsset from '@/assets/outsta-logo-full.png.asset.json';
import signatureAsset from '@/assets/adam-signature.png.asset.json';

export interface CoePdfData {
  salutation: string;
  fullName: string;
  role: string;
  startDate: string;
  hours: string;
  income: string;
  todayDate: string;
}

/** Break text into lines that fit maxWidth, at word boundaries. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Draw a line justified to maxWidth; the last line of a paragraph is left-aligned. */
export function drawJustified(
  page: PDFPage,
  line: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
  isLastLine: boolean,
) {
  const words = line.split(' ').filter(Boolean);
  if (isLastLine || words.length < 2) {
    page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0) });
    return;
  }
  const wordsWidth = words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, size), 0);
  const gap = (maxWidth - wordsWidth) / (words.length - 1);
  let cursor = x;
  for (const word of words) {
    page.drawText(word, { x: cursor, y, size, font, color: rgb(0, 0, 0) });
    cursor += font.widthOfTextAtSize(word, size) + gap;
  }
}

const fetchBytes = async (url: string): Promise<Uint8Array | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

export async function generateCoePdf(data: CoePdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const LEFT = 72;
  const RIGHT = 523;
  const WIDTH = RIGHT - LEFT; // 451
  const SIZE = 11;
  const LINE = 16;

  // Logo
  const logoBytes = await fetchBytes(logoAsset.url);
  if (logoBytes) {
    const logo = await doc.embedPng(logoBytes);
    const logoWidth = 130;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    page.drawImage(logo, { x: 110, y: 780 - logoHeight, width: logoWidth, height: logoHeight });
  }

  // Date, right aligned
  const dateWidth = regular.widthOfTextAtSize(data.todayDate, SIZE);
  page.drawText(data.todayDate, { x: RIGHT - dateWidth, y: 690, size: SIZE, font: regular });

  // Title, centred
  const title = 'CERTIFICATE OF EMPLOYMENT';
  const titleWidth = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, { x: (595 - titleWidth) / 2, y: 610, size: 14, font: bold });

  // First paragraph, with the name bold mid-sentence
  const namePhrase = `${data.salutation} ${data.fullName}`;
  const before = 'This is to certify that ';
  const after = ` has been working for OutSta, part of Zoomployee LLC as a ${data.role} on a contractual basis (status: contractor) from ${data.startDate}, and renders ${data.hours} hours of service per week, with an average income of $${data.income} generated every month.`;

  // Build tokens with their font so we can wrap/justify with mixed runs.
  type Token = { text: string; font: PDFFont };
  const tokens: Token[] = [
    ...before.trim().split(/\s+/).map((t) => ({ text: t, font: regular })),
    ...namePhrase.split(/\s+/).map((t) => ({ text: t, font: bold })),
    ...after.trim().split(/\s+/).map((t) => ({ text: t, font: regular })),
  ];

  const spaceWidth = regular.widthOfTextAtSize(' ', SIZE);
  const tokenLines: Token[][] = [];
  let lineTokens: Token[] = [];
  let lineWidth = 0;
  for (const token of tokens) {
    const w = token.font.widthOfTextAtSize(token.text, SIZE);
    const extra = lineTokens.length ? spaceWidth + w : w;
    if (lineWidth + extra > WIDTH && lineTokens.length) {
      tokenLines.push(lineTokens);
      lineTokens = [token];
      lineWidth = w;
    } else {
      lineTokens.push(token);
      lineWidth += extra;
    }
  }
  if (lineTokens.length) tokenLines.push(lineTokens);

  let y = 540;
  tokenLines.forEach((lineToks, i) => {
    const isLast = i === tokenLines.length - 1;
    const wordsWidth = lineToks.reduce((s, t) => s + t.font.widthOfTextAtSize(t.text, SIZE), 0);
    const gap =
      isLast || lineToks.length < 2 ? spaceWidth : (WIDTH - wordsWidth) / (lineToks.length - 1);
    let x = LEFT;
    for (const t of lineToks) {
      page.drawText(t.text, { x, y, size: SIZE, font: t.font });
      x += t.font.widthOfTextAtSize(t.text, SIZE) + gap;
    }
    y -= LINE;
  });

  // Second paragraph
  y -= 24;
  const second =
    "This certificate is issued upon the contractor's request without any prejudice, guarantee, or responsibility on the part of OutSta.";
  const secondLines = wrapText(second, regular, SIZE, WIDTH);
  secondLines.forEach((line, i) => {
    drawJustified(page, line, LEFT, y, regular, SIZE, WIDTH, i === secondLines.length - 1);
    y -= LINE;
  });

  // Regards
  y -= 24;
  page.drawText('With best regards,', { x: LEFT, y, size: SIZE, font: regular });

  // Signature
  y -= 14;
  const sigBytes = await fetchBytes(signatureAsset.url);
  if (sigBytes) {
    const sig = await doc.embedPng(sigBytes);
    const sigWidth = 150;
    const sigHeight = (sig.height / sig.width) * sigWidth;
    y -= sigHeight;
    page.drawImage(sig, { x: LEFT, y, width: sigWidth, height: sigHeight });
  } else {
    y -= 40;
  }

  y -= 10 + SIZE;
  page.drawText('Adam Tabari', { x: LEFT, y, size: SIZE, font: regular });
  y -= LINE;
  page.drawText('Owner and Founder of OutSta, part of Zoomployee LLC', {
    x: LEFT,
    y,
    size: SIZE,
    font: regular,
  });

  y -= 20 + SIZE;
  page.drawText('3029 NE 188th St, Suite 1108 Aventura,', { x: LEFT, y, size: SIZE, font: regular });
  y -= LINE;
  page.drawText('Florida 33180, US adam@outsta.io', { x: LEFT, y, size: SIZE, font: regular });

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}
