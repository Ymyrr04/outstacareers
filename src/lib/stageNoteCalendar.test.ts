import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { defaultsToCalendarOnMove } from './stageNoteCalendar';

describe('stage note calendar default', () => {
  it('ticks Add to calendar when moving Qualified to For Interview', () => {
    strictEqual(defaultsToCalendarOnMove('Qualified', 'For Interview'), true);
  });
  it('leaves Add to calendar unticked for every other stage move', () => {
    const moves: [string, string][] = [
      ['Qualified', 'SIV'],
      ['Qualified', 'Hired'],
      ['For Review', 'Qualified'],
      ['For Review', 'For Interview'],
      ['For Interview', 'SIV'],
      ['SIV', 'Hired'],
    ];
    for (const [previousStatus, newStatus] of moves) {
      strictEqual(defaultsToCalendarOnMove(previousStatus, newStatus), false, `${previousStatus} -> ${newStatus}`);
    }
  });
});
