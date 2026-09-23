export interface HelpArticle {
  id: string;
  topic: string;
  question: string;
  keywords: string[];
  answer: string[];
}

export const HELP_TOPICS = [
  'Applicants',
  'Pipeline',
  'Clients',
  'Contractors',
  'Timesheets',
  'Contracts',
  'Legal Docs',
  'Admin',
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  // Applicants
  { id: 'find-applicant', topic: 'Applicants', question: 'How do I find a specific applicant?', keywords: ['search', 'find', 'applicant', 'candidate', 'lookup', 'name', 'email'], answer: ['Open the Applicants tab and type a name, email or phone number in the search box.', 'You can also use Boolean search (AND, OR, NOT, quotes) to search inside CVs, e.g. "medical billing" AND bilingual.'] },
  { id: 'change-status', topic: 'Applicants', question: 'How do I change an applicant\'s status?', keywords: ['status', 'reject', 'archive', 'talent pool', 'move', 'change'], answer: ['Open the applicant and pick a new status from the status dropdown, or drag their card to another column on the Kanban board.', 'Every change is saved in the status history, so you can always see who moved them and when.'] },
  { id: 'cv-score', topic: 'Applicants', question: 'What do the CV, IV and QA scores mean?', keywords: ['score', 'cv', 'iv', 'qa', 'rating', 'color', 'green', 'red', 'amber'], answer: ['CV = how well the CV matches the role. IV = the interview assessment score. QA = the typing/written assessment score.', 'Green is strong, amber is average, red is weak. Unscored CVs are scored automatically in the background.'] },
  { id: 'rescore', topic: 'Applicants', question: 'A CV has no score or a wrong score — what do I do?', keywords: ['rescore', 'score', 'missing', 'wrong', 'cv', 'rescan'], answer: ['Open the applicant and use the "Rescore" option. It reads the PDF again (including scanned CVs) and updates the score.'] },
  { id: 'bulk-upload', topic: 'Applicants', question: 'How do I upload several CVs at once?', keywords: ['bulk', 'upload', 'cv', 'multiple', 'import', 'pdf'], answer: ['Use the Bulk Upload CV option on the Applicants tab. Only PDF files are accepted.', 'Contact details (name, email, phone) are read from each CV automatically.'] },
  { id: 'repeat', topic: 'Applicants', question: 'What does the "9x applied" badge mean?', keywords: ['applied', 'badge', 'repeat', 'times', 'history', 'duplicate'], answer: ['It shows how many times this person has applied. Hover or click it to see which roles they applied for.'] },
  { id: 'notes', topic: 'Applicants', question: 'How do I add notes to a candidate?', keywords: ['note', 'notes', 'comment', 'interview notes'], answer: ['Open the applicant and add a note in the Notes section. Every note is timestamped and shows who wrote it.'] },
  { id: 'profiles', topic: 'Applicants', question: 'Can a candidate have more than one profile?', keywords: ['profile', 'additional', 'multiple', 'skills', 'copy'], answer: ['Yes. Open the candidate and add an additional profile (e.g. one for Medical Billing, one for Customer Service). You can copy any profile to your clipboard with one click.'] },

  // Pipeline
  { id: 'kanban', topic: 'Pipeline', question: 'How does the Kanban board work?', keywords: ['kanban', 'board', 'funnel', 'drag', 'columns', 'stage'], answer: ['Pick a role at the top, then drag candidate cards between columns to move them through the stages.', 'Right-click (or use the card menu) for quick actions like Send Pre-pitch or Link to Client Pipeline.'] },
  { id: 'availability', topic: 'Pipeline', question: 'How do I check if a bench candidate is available?', keywords: ['available', 'availability', 'check in', 'checked in', 'bench'], answer: ['Use the availability check from the candidate card. They receive an email with Yes/No buttons.', 'Their answer appears on the card automatically within about a minute — no refresh needed.'] },
  { id: 'link-client', topic: 'Pipeline', question: 'How do I link a candidate to a client request?', keywords: ['link', 'client', 'pipeline', 'request', 'pitch', 'send candidate'], answer: ['On the Kanban board, open the card menu and choose "Link to Client Pipeline".', 'Pick the client request, choose which profile to use if there are several (it pastes in automatically), edit the note, then click "Link & comment".', 'Other admins get an email just like a normal comment.'] },
  { id: 'linked-badge', topic: 'Pipeline', question: 'How do I see which clients a candidate was already sent to?', keywords: ['linked', 'before', 'previously', 'badge', 'clients', 'history'], answer: ['Cards show a cyan badge with the client name (or "N clients"). Hover it for details.', 'The link window also warns you with "Already linked before" if you pick them again.'] },
  { id: 'prepitch', topic: 'Pipeline', question: 'What is "Send Pre-pitch"?', keywords: ['pre-pitch', 'prepitch', 'pitch', 'send'], answer: ['It sends the candidate\'s profile to a client before a formal interview, so the client can say if they\'re interested.'] },

  // Clients
  { id: 'hiring-request', topic: 'Clients', question: 'How do I create or track a hiring request?', keywords: ['hiring request', 'request', 'client', 'new role', 'sourcing'], answer: ['Open the client and add a hiring request. Move it through the stages (Sourcing, Pitch, Scheduled Interview, etc.).', 'You can duplicate an existing request to save time.'] },
  { id: 'comments', topic: 'Clients', question: 'How do comments on hiring requests work?', keywords: ['comment', 'mention', '@', 'reaction', 'notify'], answer: ['Open a hiring request and write a comment. Type @ to mention another admin — they get an email.', 'Linked candidates appear as a cyan chip in the comment; click it to preview their details.'] },
  { id: 'analytics', topic: 'Clients', question: 'Where are the client analytics?', keywords: ['analytics', 'retention', 'growth', 'report', 'export', 'csv'], answer: ['Open the Clients area and go to Analytics. You\'ll see growth, retention and bilingual breakdowns, and can export to CSV.', 'The internal OutSta team is excluded from these numbers.'] },

  // Contractors
  { id: 'contractor-status', topic: 'Contractors', question: 'How do contractor statuses work?', keywords: ['contractor', 'status', 'active', 'inactive', 'ended'], answer: ['Each contractor has a status on the Contractors tab (e.g. Active, Inactive). Change it from the row\'s status dropdown.', 'Some statuses update automatically, e.g. when an end date passes.'] },
  { id: 'hired', topic: 'Contractors', question: 'What happens when I move someone to Hired?', keywords: ['hired', 'hire', 'assign', 'assignment', 'onboard'], answer: ['A window opens asking which client they\'re assigned to, their rate and start date. They then appear on the Contractors tab.'] },
  { id: 'bulk-email', topic: 'Contractors', question: 'How do I email many contractors at once?', keywords: ['bulk', 'email', 'send', 'contractors', 'message', 'templates'], answer: ['On the Contractors tab, select contractors and use the bulk email option. You can use a saved template from the Templates button.'] },
  { id: 'post-hire', topic: 'Contractors', question: 'What is the post-hire pipeline?', keywords: ['post-hire', 'onboarding', 'milestones', 'kanban'], answer: ['It\'s a board that tracks onboarding steps after someone is hired (contract, setup, first day, etc.). Drag cards as each step is done.'] },
  { id: 'internal-team', topic: 'Contractors', question: 'Why can\'t I see the Internal Team section?', keywords: ['internal team', 'outsta', 'hidden', 'missing'], answer: ['The Internal Team section is private. Ask a super admin to switch on "Internal Team" for you in Tab Permissions.'] },

  // Timesheets
  { id: 'timesheets', topic: 'Timesheets', question: 'How do contractor timesheets work?', keywords: ['timesheet', 'hours', 'portal', 'weekly', 'pl'], answer: ['Contractors log weekly hours in their portal. You review them in the PL tab.', 'Submitted timesheets lock at 12:00 PM ET the following Sunday.'] },
  { id: 'portal-login', topic: 'Timesheets', question: 'A contractor can\'t log into the portal — what now?', keywords: ['portal', 'login', 'password', 'reset', 'contractor', 'cant log in'], answer: ['New portal accounts start with the default password. The contractor can use "Forgot password" on the portal login page to reset it.'] },
  { id: 'unlock', topic: 'Timesheets', question: 'A timesheet is locked but needs a fix', keywords: ['locked', 'unlock', 'edit', 'timesheet', 'deadline'], answer: ['Timesheets lock after the Sunday noon ET deadline. An admin can still adjust the hours from the PL tab.'] },

  // Contracts
  { id: 'send-contract', topic: 'Contracts', question: 'How do I send a contract for signing?', keywords: ['contract', 'send', 'sign', 'agreement', 'envelope'], answer: ['Go to Contracts and click "Send New Contract". Pick a template, enter the recipient, and send.', 'They get a signing link by email; you countersign afterwards.'] },
  { id: 'find-contract', topic: 'Contracts', question: 'How do I find a signed contract?', keywords: ['find', 'search', 'signed', 'completed', 'contract', 'download'], answer: ['In Contracts, open the Completed tab and use the search box (name, email or template). Click "Download Signed" to get the PDF.'] },
  { id: 'resend', topic: 'Contracts', question: 'The recipient lost the signing link', keywords: ['resend', 'link', 'lost', 'signing', 'reminder'], answer: ['Find the contract in the Active tab and click "Resend", or "Link" to copy the signing link yourself.'] },
  { id: 'audit', topic: 'Contracts', question: 'How do I prove when a contract was signed?', keywords: ['audit', 'trail', 'proof', 'signed', 'when'], answer: ['Click "Audit" on the contract to see every step: sent, opened, signed and countersigned, with times.'] },

  // Legal Docs
  { id: 'legal-docs', topic: 'Legal Docs', question: 'Where do I see contractor document requests?', keywords: ['legal', 'docs', 'request', 'coe', 'certificate', 'document'], answer: ['On the Contractors tab, click "Legal Docs". The number on the button shows pending requests.', 'Use the tabs (Pending, In Progress, Completed) and change the status from each row.'] },
  { id: 'coe', topic: 'Legal Docs', question: 'How do I create a Certificate of Employment?', keywords: ['coe', 'certificate of employment', 'employment', 'generate'], answer: ['In Legal Docs, click "Generate COE" on the request. Details are filled in for you — pick Mr./Ms. and fill anything marked "Missing".', 'Click Generate, check the preview, then "Approve".'] },
  { id: 'pdc', topic: 'Legal Docs', question: 'How do I create a Pay Deposit Certificate?', keywords: ['pdc', 'pay deposit', 'deposit', 'certificate'], answer: ['In Legal Docs, click "Generate PDC". The deposit is worked out as rate × hours × 2, but you can change it.', 'Generate, check the preview, then "Approve".'] },
  { id: 'send-docs', topic: 'Legal Docs', question: 'How do I send the documents to the contractor?', keywords: ['send', 'documents', 'approve', 'ready', 'email'], answer: ['After approving, each document shows a green "Ready". Click "Send N documents" to email them all in one reply (Mark is copied).', 'The request is then marked Completed automatically.'] },

  // Admin
  { id: 'add-admin', topic: 'Admin', question: 'How do I add a new admin?', keywords: ['add admin', 'new admin', 'create', 'account', 'user', 'invite'], answer: ['Go to Tab Permissions and click "Add Admin". Enter their email and a temporary password.', 'Public sign-up is turned off, so this is the only way to add someone.'] },
  { id: 'permissions', topic: 'Admin', question: 'How do I control which tabs an admin can see?', keywords: ['permission', 'tabs', 'access', 'hide', 'show', 'visible'], answer: ['Go to Tab Permissions and switch each tab on or off per admin.'] },
  { id: 'password', topic: 'Admin', question: 'I forgot my password', keywords: ['forgot', 'password', 'reset', 'login', 'sign in'], answer: ['On the sign-in page click "Forgot password" and follow the email link.'] },
  { id: 'emails', topic: 'Admin', question: 'Emails aren\'t sending from my account', keywords: ['email', 'gmail', 'not sending', 'app password', 'inbox', 'sync'], answer: ['Your Gmail app password has probably expired. Create a new one in your Google account and ask to have it updated.'] },
  { id: 'notifications', topic: 'Admin', question: 'Which emails will I get notified about?', keywords: ['notification', 'notify', 'email', 'mention', 'alert'], answer: ['You get an email when someone mentions you, comments on or links a candidate to a hiring request, or assigns something to you.'] },
];

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9@\s-]/g, ' ');

export function searchHelp(query: string): HelpArticle[] {
  const q = normalize(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const scored = HELP_ARTICLES.map((a) => {
    const question = normalize(a.question);
    const kw = a.keywords.map(normalize);
    const body = normalize(a.answer.join(' '));
    let score = 0;
    for (const k of kw) if (q.includes(k)) score += 5;
    for (const w of words) {
      if (kw.some((k) => k.includes(w))) score += 3;
      if (question.includes(w)) score += 2;
      if (body.includes(w)) score += 1;
    }
    return { a, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, 6).map((x) => x.a);
}
