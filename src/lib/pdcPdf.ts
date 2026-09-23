import { PDFDocument, StandardFonts, PDFFont } from 'pdf-lib';
import logoAsset from '@/assets/outsta-logo-full.png.asset.json';
import signatureAsset from '@/assets/adam-signature.png.asset.json';

export interface PdcPdfData {
  salutation: string;
  fullName: string;
  amount: string;
  todayDate: string;
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

export async function generatePdcPdf(data: PdcPdfData): Promise<Blob> {
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
  const title = 'CERTIFICATE OF PAY DEPOSIT';
  const titleWidth = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, { x: (595 - titleWidth) / 2, y: 610, size: 14, font: bold });

  // Body paragraph with two bold runs (name and amount)
  type Token = { text: string; font: PDFFont };
  const run = (text: string, font: PDFFont): Token[] =>
    text.trim().split(/\s+/).filter(Boolean).map((t) => ({ text: t, font }));

  const tokens: Token[] = [
    ...run('This is to certify that', regular),
    ...run(`${data.salutation} ${data.fullName}`, bold),
    ...run('has a pay security deposit of', regular),
    ...run(`$${data.amount}`, bold),
    ...run(
      'that is held by OutSta, part of Zoomployee LLC under Contract Agreement Section 6.2. signed by both parties. The pay deposit will be paid together with the last salary payment after the 2-week notice period is successfully completed at the end of the contract.',
      regular,
    ),
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
  page.drawText('Owner & Founder, OutSta, part of Zoomployee LLC', {
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
