interface PayoneerSubmission {
  week_ending_date: string;
  total_hours: number;
  incentive_amount: number;
  contractor: {
    hourly_rate: number | null;
    payoneer_email: string | null;
    applicant: { full_name: string } | null;
  } | null;
}

const csvCell = (value: string) => /[",\r\n]/.test(value)
  ? `"${value.replace(/"/g, '""')}"`
  : value;

export function payoneerExtractionCSV(rows: PayoneerSubmission[]): string {
  const headers = ['Name', 'Payoneer Email address', 'Invoice Amount', 'Bonus Amount', 'Invoice Week'];
  return [headers.join(','), ...rows.map((row) => [
    row.contractor?.applicant?.full_name || '',
    row.contractor?.payoneer_email || '',
    row.contractor?.hourly_rate != null
      ? (Number(row.total_hours) * Number(row.contractor.hourly_rate)).toFixed(2)
      : '',
    Number(row.incentive_amount || 0).toFixed(2),
    row.week_ending_date,
  ].map(csvCell).join(','))].join('\r\n');
}