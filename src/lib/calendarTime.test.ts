import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { autoEndTime } from './calendarTime';

describe('autoEndTime — end time follows a newly picked start time', () => {
  it('sets the end 30 minutes after the start', () => {
    strictEqual(autoEndTime('09:30'), '10:00');
    strictEqual(autoEndTime('10:00'), '10:30');
    strictEqual(autoEndTime('00:00'), '00:30');
    strictEqual(autoEndTime('13:15'), '13:45');
  });

  it('clamps to the last picker slot (11:45 PM) for late-evening starts', () => {
    strictEqual(autoEndTime('23:30'), '23:45');
    strictEqual(autoEndTime('23:45'), '23:45');
  });
});
