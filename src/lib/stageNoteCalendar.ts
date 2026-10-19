// A candidate moving out of Qualified is normally being scheduled, so the
// note dialog opens with the calendar section already ticked.
export function defaultsToCalendarOnMove(previousStatus: string) {
  return previousStatus === 'Qualified';
}
