// Moving a candidate from Qualified into For Interview normally means
// scheduling them, so the note dialog opens with the calendar already ticked.
export function defaultsToCalendarOnMove(previousStatus: string, newStatus: string) {
  return previousStatus === 'Qualified' && newStatus === 'For Interview';
}
