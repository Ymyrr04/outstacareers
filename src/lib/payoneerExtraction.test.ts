import { describe, it as test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { payoneerExtractionCSV, extractionDepositStatus, extractionDepositRows, extractionExportRows } from './payoneerExtraction';

describe('Payoneer extraction', () => {
  test('flags an unfinished deposit', () => {
    strictEqual(extractionDepositStatus({ isDeposit: true, depositHours: 40, weekIndex: 0 }, 40, 80), 'ongoing');
  });
  test('flags standard deposit completion only on the completing submission', () => {
    strictEqual(extractionDepositStatus({ isDeposit: true, depositHours: 40, weekIndex: 1 }, 80, 80), 'complete');
    strictEqual(extractionDepositStatus({ isDeposit: false, depositHours: 0, weekIndex: null }, 80, 80), 'none');
  });
  test('preserves explicit completion and excess flags', () => {
    strictEqual(extractionDepositStatus({ isDeposit: true, depositHours: 20, weekIndex: 1, targetStatus: 'complete' }, 40, 40), 'complete');
    strictEqual(extractionDepositStatus({ isDeposit: true, depositHours: 40, weekIndex: 1, targetStatus: 'excess' }, 80, 60), 'excess');
  });
  test('exports only individually selected submissions and permits selecting none', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    deepStrictEqual(selectedExtractionRows(rows, new Set(['b'])), [{ id: 'b' }]);
    deepStrictEqual(selectedExtractionRows(rows, new Set()), []);
  });
  test('exports only the five requested fields, with invoice and bonus separate', () => {
    const csv = payoneerExtractionCSV([{
      week_ending_date: '2026-10-16', total_hours: 54.5, incentive_amount: 25,
      contractor: { hourly_rate: 8, payoneer_email: 'pay@example.com', applicant: { full_name: 'Jane Doe' } },
    }]);
    deepStrictEqual(csv.split('\r\n')[0].split(','), [
      'Name', 'Payoneer Email address', 'Invoice Amount', 'Bonus Amount', 'Invoice Week',
    ]);
    strictEqual(csv.split('\r\n')[1], 'Jane Doe,pay@example.com,436.00,25.00,2026-10-16');
  });

  test('keeps missing payment details blank rather than substituting the contact email', () => {
    strictEqual(payoneerExtractionCSV([{
      week_ending_date: '2026-10-16', total_hours: 40, incentive_amount: 0,
      contractor: { hourly_rate: null, payoneer_email: null, applicant: { full_name: 'Jane Doe' } },
    }]).split('\r\n')[1], 'Jane Doe,,,0.00,2026-10-16');
  });

  test('escapes commas, quotes and line breaks in names', () => {
    ok(payoneerExtractionCSV([{
      week_ending_date: '2026-10-16', total_hours: 0, incentive_amount: 0,
      contractor: { hourly_rate: 0, payoneer_email: 'pay@example.com', applicant: { full_name: 'Doe, "Jane"' } },
    }]).includes('"Doe, ""Jane""",pay@example.com,0.00,0.00,2026-10-16'));
  });
});