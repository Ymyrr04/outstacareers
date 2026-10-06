import { type HistRow, isContractorRow, rowHours, num, markupOf } from '@/lib/historicalData';

// Compact, deterministic datasets retain contractor and client mix without sending names or contact details to AI.
export function summaryDatasets(rowsA: HistRow[], rowsB: HistRow[], basis: 'gross' | 'after') {
  const eligibleA = rowsA.filter(isContractorRow), eligibleB = rowsB.filter(isContractorRow);
  const names = [...new Set([...eligibleA, ...eligibleB].map((r) => (r.contractor_name ?? '').trim().toLowerCase()))].sort();
  const ids = new Map(names.map((name, i) => [name, `Contractor ${i + 1}`]));
  const round = (n: number) => Math.round(n * 100) / 100;
  const dataset = (rows: HistRow[]) => {
    const contractors = new Map<string, number[]>();
    const clients = new Map<string, number[]>();
    const weeks = new Map<string, Set<string>>();
    const missing = { actualHoursFallbackRows: 0, missingClientRateRows: 0, missingContractorRateRows: 0 };
    for (const row of rows) {
      const name = (row.contractor_name ?? '').trim().toLowerCase();
      const id = ids.get(name);
      if (!id) continue;
      const week = row.week_start?.slice(0, 10) ?? '';
      const h = rowHours(row);
      const income = num(basis === 'gross' ? row.client_billing : row.income_after_3_percent);
      const expense = num(basis === 'gross' ? row.contractor_cost : row.expense_after_1_percent);
      const pairedHours = markupOf(row) != null && h > 0 ? h : 0;
      const values = [h, income, expense, income - expense, pairedHours,
        num(row.client_rate) * pairedHours, num(row.contractor_rate) * pairedHours];
      const company = (row.company ?? '').trim() || 'Unspecified client';
      for (const [map, key] of [[contractors, id], [clients, company]] as const) {
        const totals = map.get(key) ?? values.map(() => 0);
        values.forEach((value, i) => { totals[i] += value; });
        map.set(key, totals);
      }
      const seen = weeks.get(id) ?? new Set<string>();
      seen.add(week); weeks.set(id, seen);
      if (row.actual_hours == null) missing.actualHoursFallbackRows++;
      if (row.client_rate == null) missing.missingClientRateRows++;
      if (row.contractor_rate == null) missing.missingContractorRateRows++;
    }
    return {
      rowCount: rows.length, uniqueContractors: contractors.size, missing,
      contractorColumns: ['anonymousContractor', 'weeksPresent', 'hours', 'income', 'expense', 'incomeMinusExpense', 'hoursWithBothRates', 'clientRateTimesHours', 'contractorRateTimesHours'],
      contractors: [...contractors].sort(([a], [b]) => a.localeCompare(b)).map(([id, values]) => [id, weeks.get(id)?.size ?? 0, ...values.map(round)]),
      clientColumns: ['client', 'hours', 'income', 'expense', 'incomeMinusExpense', 'hoursWithBothRates', 'clientRateTimesHours', 'contractorRateTimesHours'],
      clients: [...clients].sort(([a], [b]) => a.localeCompare(b)).map(([client, values]) => [client, ...values.map(round)]),
    };
  };
  const datasetA = dataset(eligibleA), datasetB = dataset(eligibleB);
  const idsA = new Set(datasetA.contractors.map((r) => r[0]));
  const idsB = new Set(datasetB.contractors.map((r) => r[0]));
  const cohort = (records: (string | number)[][], include: (id: string) => boolean) => {
    const selected = records.filter((r) => include(String(r[0])));
    const sum = (index: number) => round(selected.reduce((total, r) => total + Number(r[index]), 0));
    return { uniqueContractors: selected.length, hours: sum(2), income: sum(3), expense: sum(4), incomeMinusExpense: sum(5) };
  };
  return {
    datasetA, datasetB,
    cohorts: {
      presentInBothA: cohort(datasetA.contractors, (id) => idsB.has(id)),
      presentInBothB: cohort(datasetB.contractors, (id) => idsA.has(id)),
      presentOnlyInA: cohort(datasetA.contractors, (id) => !idsB.has(id)),
      presentOnlyInB: cohort(datasetB.contractors, (id) => !idsA.has(id)),
    },
    interpretation: 'Anonymous contractor identifiers are stable across A and B. Present only in A/B means present only in that selected dataset, NOT proven hires or departures. Rates are weighted by hoursWithBothRates. Null actual hours fall back to sheet hours. Internal, bonus and excluded contractor rows follow the existing Analytics eligibility rules. Missing financial amounts follow the report zero-value convention, not evidence of free work.',
  };
}