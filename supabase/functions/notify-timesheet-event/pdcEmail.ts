export interface LegalEmailDocument {
  filename: string;
  base64: string;
  docType?: string;
  pdc?: { fullName: string; salutation: string; amount: string };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

export function pdcEmail(document: LegalEmailDocument) {
  const details = document.pdc;
  if (!details || typeof details.fullName !== 'string' || !details.fullName.trim() || details.fullName.length > 255 || /[\r\n]/.test(details.fullName) || !['Mr.', 'Ms.'].includes(details.salutation) || typeof details.amount !== 'string' || !/^\d+(\.\d{1,2})?$/.test(details.amount) || !Number.isFinite(Number(details.amount))) {
    throw new Error('Approved PDC name, salutation and deposit amount are required. Regenerate and approve the certificate.');
  }
  const fullName = details.fullName.trim();
  const amount = Number(details.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const text = `This is to certify that ${details.salutation} ${fullName} has a pay security deposit of $${amount} that is held by OutSta, part of Zoomployee LLC under Contract Agreement Section 6.2. signed by both parties. The pay deposit will be paid together with the last salary payment after the 2-week notice period is successfully completed at the end of the contract.`;
  return {
    subject: `Pay Deposit Certificate - ${fullName}`,
    html: `<!doctype html><html><body><p>${escapeHtml(text)}</p></body></html>`,
  };
}