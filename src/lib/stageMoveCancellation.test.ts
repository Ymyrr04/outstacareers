import { describe, it } from 'node:test';
import { deepStrictEqual, rejects } from 'node:assert';
import { cancelStageMove } from './stageMoveCancellation';

const move = { applicantId: 'candidate-1', previousStatus: 'For Review', newStatus: 'SIV' };

describe('cancel stage move', () => {
  it('restores the original tile only after the saved status is restored', async () => {
    const calls: unknown[] = [];
    await cancelStageMove(move, async (...args) => { calls.push(args); return true; }, (...args) => { calls.push(args); });
    deepStrictEqual(calls, [['candidate-1', 'SIV', 'For Review'], ['candidate-1', 'For Review']]);
  });
  it('keeps the local tile unchanged when restoring fails', async () => {
    const calls: unknown[] = [];
    await rejects(cancelStageMove(move, async () => { throw new Error('Unable to restore'); }, (...args) => { calls.push(args); }), /Unable to restore/);
    deepStrictEqual(calls, []);
  });
  it('does not overwrite another admin’s subsequent move', async () => {
    const calls: unknown[] = [];
    await rejects(cancelStageMove(move, async () => false, (...args) => { calls.push(args); }), /stage has changed/);
    deepStrictEqual(calls, []);
  });
});