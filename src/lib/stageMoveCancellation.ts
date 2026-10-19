export interface ReversibleStageMove {
  applicantId: string;
  newStatus: string;
  previousStatus: string;
}

// Restore only the move awaiting its note, never overwrite a later admin move.
export async function cancelStageMove(
  move: ReversibleStageMove,
  persist: (id: string, expectedStatus: string, originalStatus: string) => Promise<boolean>,
  restoreLocal: (id: string, status: string) => void,
) {
  const restored = await persist(move.applicantId, move.newStatus, move.previousStatus);
  if (!restored) throw new Error('The candidate’s stage has changed. Refresh the pipeline before trying again.');
  restoreLocal(move.applicantId, move.previousStatus);
}