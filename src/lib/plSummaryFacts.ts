import { type HistRow, isContractorRow, rowHours, num, markupOf } from '@/lib/historicalData';

// Compact, deterministic facts for the analyst summary: headcount, standard-hours mix (40 vs 50),
// submitted-hours averages and markup. No names, contact details or client data are sent to AI.
export function summaryDatasets(rowsA: HistRow[], rowsB: HistRow[], basis: 'gross' | 'after') {
  void basis;
  const round = (n: number) => Math.round(n * 100) / 100;
  const dataset = (all: HistRow[]) => {
    const rows = all.filter(isContractorRow);
    const people = new Set<string>();
    const weeks = new Set<string>();
    type G = { people: Set<string>; contractorWeeks: number; hours: number; mSum: number; mHours: number };
    const mk = (): G => ({ people: new Set(), contractorWeeks: 0, hours: 0, mSum: 0, mHours: 0 });
    const groups: Record<'standard40' | 'standard50' | 'otherStandard', G> = { standard40: mk(), standard50: mk(), otherStandard: mk() };
    let totalHours = 0, mSum = 0, mHours = 0, contractorWeeks = 0, fallbackRows = 0;
    for (const r of rows) {
      const name = (r.contractor_name ?? '').trim().toLowerCase();
      if (!name) continue;
      people.add(name);
      weeks.add(r.week_start?.slice(0, 10) ?? '');
      const std = num(r.hours);
      const g = groups[std === 40 ? 'standard40' : std === 50 ? 'standard50' : 'otherStandard'];
      const h = rowHours(r);
      const m = markupOf(r);
      g.people.add(name); g.contractorWeeks++; g.hours += h;
      totalHours += h; contractorWeeks++;
      if (m != null && h > 0) { g.mSum += m * h; g.mHours += h; mSum += m * h; mHours += h; }
      if (r.actual_hours == null) fallbackRows++;
    }
    const summarise = (g: G) => ({
      uniqueContractors: g.people.size,
      contractorWeeks: g.contractorWeeks,
      submittedHours: round(g.hours),
      avgSubmittedHoursPerContractorWeek: g.contractorWeeks ? round(g.hours / g.contractorWeeks) : null,
      markupPerHour: g.mHours ? round(g.mSum / g.mHours) : null,
    });
    return {
      weeksInRange: weeks.size,
      uniqueContractorsInRange: people.size,
      contractorWeeks,
      totalSubmittedHours: round(totalHours),
      avgSubmittedHoursPerContractorWeek: contractorWeeks ? round(totalHours / contractorWeeks) : null,
      markupPerHour: mHours ? round(mSum / mHours) : null,
      byStandardHours: { standard40: summarise(groups.standard40), standard50: summarise(groups.standard50), otherStandard: summarise(groups.otherStandard) },
      rowsUsingSheetHoursFallback: fallbackRows,
    };
  };
  return {
    staffingA: dataset(rowsA),
    staffingB: dataset(rowsB),
    interpretation: 'Standard hours = the contractor\'s contracted weekly hours (40 or 50). Submitted hours = actual hours logged. A higher share of 50-hour contractors naturally raises average submitted hours. Markup per hour = client rate minus contractor rate, hour-weighted, before fees.',
  };
}
