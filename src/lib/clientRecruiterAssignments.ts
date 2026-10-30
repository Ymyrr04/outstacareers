export const CLIENT_RECRUITER_EMAILS = [
  'czarina@outsta.io',
  'kristine@outsta.io',
  'eduardo@outsta.io',
  'christian@outsta.io',
];

export function countClientRecruiterAssignments(
  requests: ReadonlyArray<{ pipeline_stage: string; assigned_admin_id: string | null }>,
  admins: ReadonlyArray<{ user_id: string; email: string }>,
) {
  const activeStages = ['sourcing', 'pitch', 'scheduled_interview'];
  const counts: Record<string, number> = Object.fromEntries(CLIENT_RECRUITER_EMAILS.map(email => [email, 0]));
  const adminEmails = new Map(admins.map(admin => [admin.user_id, admin.email.toLowerCase()]));
  for (const request of requests) {
    if (!activeStages.includes(request.pipeline_stage)) continue;
    const email = request.assigned_admin_id ? adminEmails.get(request.assigned_admin_id) : undefined;
    if (email && Object.hasOwn(counts, email)) counts[email] += 1;
  }
  return counts;
}