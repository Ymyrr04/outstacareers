import type { DepositWeek } from './depositSchedule';

export type ExtractionDepositStatus = 'ongoing' | 'complete' | 'excess' | 'none';

export function extractionDepositStatus(deposit: DepositWeek, collectedHours: number, requiredHours: number): ExtractionDepositStatus {
  if (deposit.targetStatus === 'excess') return 'excess';
  if (deposit.targetStatus === 'complete') return 'complete';
  if (!deposit.isDeposit) return 'none';
  return requiredHours > 0 && collectedHours >= requiredHours - 0.0001 ? 'complete' : 'ongoing';
}

export function extractionDepositRows<T extends { depositStatus: ExtractionDepositStatus }>(rows: T[]): T[] {
  return rows.filter((row) => row.depositStatus !== 'none');
}

export function extractionExportRows<T extends { id: string; depositStatus: ExtractionDepositStatus }>(rows: T[], selectedDepositIds: Set<string>): T[] {
  return rows.filter((row) => row.depositStatus === 'none' || selectedDepositIds.has(row.id));
}

export interface PayoneerSubmission {
  week_ending_date: string;
  total_hours: number;
  incentive_amount: number;
  contractor: {
    hourly_rate: number | null;
    payoneer_email: string | null;
    applicant: { full_name: string } | null;
  } | null;
}

export interface PayoneerExtractionRow extends PayoneerSubmission {
  id: string;
  depositStatus: ExtractionDepositStatus;
  excessAmount: number;
}

const csvCell = (value: string) => /[",\r\n]/.test(value)
  ? `"${value.replace(/"/g, '""')}"`
  : value;

const invoiceAmountOf = (row: PayoneerSubmission) =>
  row.contractor?.hourly_rate != null
    ? Number(row.total_hours) * Number(row.contractor.hourly_rate)
    : null;

export function payoneerExtractionCSV(rows: PayoneerSubmission[]): string {
  const headers = ['Name', 'Payoneer Email address', 'Invoice Amount', 'Bonus Amount', 'Total', 'Invoice Week'];
  return [headers.join(','), ...rows.map((row) => {
    const invoice = invoiceAmountOf(row);
    const bonus = Number(row.incentive_amount || 0);
    return [
      row.contractor?.applicant?.full_name || '',
      row.contractor?.payoneer_email || '',
      invoice != null ? invoice.toFixed(2) : '',
      bonus.toFixed(2),
      invoice != null ? (invoice + bonus).toFixed(2) : '',
      row.week_ending_date,
    ].map(csvCell).join(',');
  })].join('\r\n');
}