import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { defaultsToCalendarOnMove } from './stageNoteCalendar';

describe('stage note calendar default', () => {
  it('ticks Add to calendar when moving a candidate out of Qualified', () => {
    strictEqual(defaultsToCalendarOnMove('Qualified'), true);
  });
  it('leaves Add to calendar unticked for every other origin stage', () => {
    for (const previousStatus of ['For Review', 'For Interview', 'SIV', 'Hired', 'Bench']) {
      strictEqual(defaultsToCalendarOnMove(previousStatus), false, previousStatus);
    }
  });
});
