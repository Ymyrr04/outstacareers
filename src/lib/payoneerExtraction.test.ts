import { describe, expect, test } from 'bun:test';
import { payoneerExtractionCSV } from './payoneerExtraction';

describe('Payoneer extraction', () => {
  test('exports only the five requested fields, with invoice and bonus separate', () => {
    const csv = payoneerExtractionCSV([{
      week_ending_date: '2026-10-16', total_hours: 54.5, incentive_amount: 25,
      contractor: { hourly_rate: 8, payoneer_email: 'pay@example.com', applicant: { full_name: 'Jane Doe' } },
    }]);
    expect(csv.split('\r\n')[0].split(',')).toEqual([
      'Name', 'Payoneer Email address', 'Invoice Amount', 'Bonus Amount', 'Invoice Week',
    ]);
    expect(csv.split('\r\n')[1]).toBe('Jane Doe,pay@example.com,436.00,25.00,2026-10-16');
  });

  test('keeps missing payment details blank rather than substituting the contact email', () => {
    expect(payoneerExtractionCSV([{
      week_ending_date: '2026-10-16', total_hours: 40, incentive_amount: 0,
      contractor: { hourly_rate: null, payoneer_email: null, applicant: { full_name: 'Jane Doe' } },
    }]).split('\r\n')[1]).toBe('Jane Doe,,,0.00,2026-10-16');
  });

  test('escapes commas, quotes and line breaks in names', () => {
    expect(payoneerExtractionCSV([{
      week_ending_date: '2026-10-16', total_hours: 0, incentive_amount: 0,
      contractor: { hourly_rate: 0, payoneer_email: 'pay@example.com', applicant: { full_name: 'Doe, "Jane"' } },
    }])).toContain('"Doe, ""Jane""",pay@example.com,0.00,0.00,2026-10-16');
  });
});