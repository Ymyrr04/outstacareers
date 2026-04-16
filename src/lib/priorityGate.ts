/**
 * Priority Gate
 * 
 * A lightweight cooperative scheduler that lets foreground UI work (e.g.,
 * opening the Candidate Detail Dialog) jump ahead of background fetches.
 * 
 * Background tasks call `await priorityGate.wait()` between network calls.
 * When no priority work is active, it resolves immediately (zero overhead).
 * When a priority task is running, background work pauses until it finishes.
 */

let activeCount = 0;
let pending: Promise<void> | null = null;
let resolvePending: (() => void) | null = null;

function ensurePending() {
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
  }
}

export const priorityGate = {
  /**
   * Mark the start of a high-priority task. Background callers awaiting
   * `wait()` will block until `end()` is called.
   */
  begin(): void {
    activeCount += 1;
    ensurePending();
  },

  /**
   * Mark the end of a high-priority task. When the count returns to zero,
   * any background tasks awaiting `wait()` are released.
   */
  end(): void {
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0 && resolvePending) {
      resolvePending();
      resolvePending = null;
      pending = null;
    }
  },

  /**
   * Background tasks should `await` this between heavy operations.
   * Resolves immediately when no priority work is active.
   */
  async wait(): Promise<void> {
    if (activeCount === 0) return;
    if (pending) await pending;
  },

  isActive(): boolean {
    return activeCount > 0;
  },
};
