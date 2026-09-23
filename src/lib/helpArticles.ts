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
  'Contracts',
  'Legal Docs',
  'Interviews',
  'Talent Pool',
  'Sourcing',
  'Email & Inbox',
  'Funnel',
  'Troubleshooting',
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
  { id: 'kanban', topic: 'Pipeline', question: 'How does the Kanban board work?', keywords: ['kanban', 'board', 'funnel', 'drag', 'columns', 'stage'], answer: ['Pick a role at the top, then drag candidate cards between columns to move them through the stages.', 'Use the card menu for quick actions like Send Pre-pitch or Link to Client Pipeline.'] },
  { id: 'availability', topic: 'Pipeline', question: 'How do I check if a bench candidate is available?', keywords: ['available', 'availability', 'check in', 'checked in', 'bench'], answer: ['Use the availability check from the candidate card. They receive an email with Yes/No buttons.', 'Their answer appears on the card automatically within about a minute — no refresh needed.'] },
  { id: 'link-client', topic: 'Pipeline', question: 'How do I link a candidate to a client request?', keywords: ['link', 'client', 'pipeline', 'request', 'pitch', 'send candidate'], answer: ['On the Kanban board, open the card menu and choose "Link to Client Pipeline".', 'Pick the client request, choose which profile to use if there are several (it pastes into the note automatically), edit the note, then click "Link & comment".', 'Other admins get an email just like a normal comment.'] },
  { id: 'linked-badge', topic: 'Pipeline', question: 'How do I see which clients a candidate was already sent to?', keywords: ['linked', 'before', 'previously', 'badge', 'clients', 'history'], answer: ['Cards show a cyan badge with the client name (or "N clients"). Hover it for details.', 'The link window also warns you with "Already linked before" if you pick them again.'] },
  { id: 'prepitch', topic: 'Pipeline', question: 'What is "Send Pre-pitch"?', keywords: ['pre-pitch', 'prepitch', 'pitch', 'send'], answer: ['It sends the candidate\'s profile to a client before a formal interview, so the client can say if they\'re interested.'] },

  // Clients
  { id: 'hiring-request', topic: 'Clients', question: 'How do I create or track a hiring request?', keywords: ['hiring request', 'request', 'client', 'new role', 'sourcing'], answer: ['Open the client and add a hiring request. Move it through the stages (Sourcing, Pitch, Scheduled Interview, etc.).', 'You can duplicate an existing request to save time.'] },
  { id: 'comments', topic: 'Clients', question: 'How do comments on hiring requests work?', keywords: ['comment', 'mention', '@', 'reaction', 'notify'], answer: ['Open a hiring request and write a comment. Type @ to mention another admin — they get an email.', 'Linked candidates appear as a cyan chip in the comment; click it to preview their details without leaving the page.'] },
  { id: 'analytics', topic: 'Clients', question: 'Where are the client analytics?', keywords: ['analytics', 'retention', 'growth', 'report', 'export', 'csv'], answer: ['Open the Clients area and go to Analytics. You\'ll see growth, retention and bilingual breakdowns, and can export to CSV.', 'The internal OutSta team is excluded from these numbers and shown separately.'] },
  { id: 'client-detail', topic: 'Clients', question: 'How are a client\'s contractors grouped?', keywords: ['active', 'previous', 'contractors', 'client detail', 'grouped'], answer: ['On the client detail page, contractors are split into Active and Previous based on their assignment status.', 'The internal OutSta team appears as its own "Internal Team" section and is not counted in the client numbers.'] },

  // Contractors
  { id: 'contractor-status', topic: 'Contractors', question: 'How do contractor statuses work?', keywords: ['contractor', 'status', 'active', 'inactive', 'ended'], answer: ['Each contractor has a status on the Contractors tab (e.g. Active, Inactive). Change it from the row\'s status dropdown.', 'Some statuses update automatically, e.g. when an end date passes.'] },
  { id: 'hired', topic: 'Contractors', question: 'What happens when I move someone to Hired?', keywords: ['hired', 'hire', 'assign', 'assignment', 'onboard'], answer: ['A window opens asking which client they\'re assigned to, their rate and start date. They then appear on the Contractors tab.'] },
  { id: 'bulk-email', topic: 'Contractors', question: 'How do I email many contractors at once?', keywords: ['bulk', 'email', 'send', 'contractors', 'message', 'templates'], answer: ['On the Contractors tab, select contractors and use the bulk email option. You can use a saved template from the Templates button.'] },
  { id: 'post-hire', topic: 'Contractors', question: 'What is the post-hire pipeline?', keywords: ['post-hire', 'onboarding', 'milestones', 'kanban'], answer: ['It\'s a board that tracks onboarding steps after someone is hired (contract, setup, first day, etc.). Drag cards as each step is done.'] },
  { id: 'internal-team', topic: 'Contractors', question: 'Why can\'t I see the Internal Team section?', keywords: ['internal team', 'outsta', 'hidden', 'missing'], answer: ['The Internal Team section is private. It\'s visible to super admins, and other admins only if it\'s switched on for them in Tab Permissions.'] },
  { id: 'contractor-filters', topic: 'Contractors', question: 'How do I filter the contractors list?', keywords: ['filter', 'column', 'sort', 'contractors list', 'narrow'], answer: ['Use the column filters on the Contractors tab to narrow the list by client, status and more.', 'The contractor\'s contact details can be edited from their row, and WhatsApp numbers open as wa.me links.'] },
  { id: 'cv-preview', topic: 'Contractors', question: 'Can I view a CV without downloading it?', keywords: ['cv', 'preview', 'view', 'pdf', 'image'], answer: ['Yes — clicking a CV opens it as a high-quality image preview inside the dashboard, so you don\'t need to download the PDF.'] },

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

  // Interviews
  { id: 'interview-start', topic: 'Interviews', question: 'How does the interview assessment work?', keywords: ['interview', 'assessment', 'voice', 'questions', 'start', 'session'], answer: ['The candidate gets an interview link. The assessment has 3 voice questions and 1 written question, each with a timer.', 'Scores from the interview feed into the IV score you see on the applicant.'] },
  { id: 'interview-paste', topic: 'Interviews', question: 'Can candidates paste answers during the interview?', keywords: ['paste', 'copy', 'cheat', 'typing', 'wpm', 'integrity'], answer: ['No — pasting is blocked in written answers, and typing speed (WPM) is tracked.', 'Anything pasted during an interview gets highlighted in amber when you review it.'] },
  { id: 'interview-resume', topic: 'Interviews', question: 'A candidate lost connection mid-interview — what happens?', keywords: ['resume', 'lost', 'connection', 'interrupted', 'session', 'expired'], answer: ['Interview sessions are kept, so the candidate can resume where they left off using the same link.'] },

  // Talent Pool
  { id: 'talent-pool-join', topic: 'Talent Pool', question: 'How does someone join the talent pool?', keywords: ['talent pool', 'join', 'signup', 'sign up', 'pipeline'], answer: ['They sign up through the /talent-pool page, which walks them through a structured 9-step application.', 'Once in, they appear in the dashboard with the "Talent Pool" status.'] },
  { id: 'talent-pool-move', topic: 'Talent Pool', question: 'How do I move someone out of the talent pool?', keywords: ['talent pool', 'move', 'out', 'status', 'remove'], answer: ['Open the applicant and change their status like any other status change — e.g. move them onto a role\'s pipeline.', 'Status changes are tracked in the status history.'] },

  // Sourcing
  { id: 'external-scout', topic: 'Sourcing', question: 'What is the External Scout?', keywords: ['scout', 'external', 'apollo', 'sourcing', 'find candidates'], answer: ['The External Scout finds candidates outside the existing database using Apollo.', 'Imported candidates appear with placeholder details until their full information is filled in.'] },
  { id: 'import-external', topic: 'Sourcing', question: 'How do I import an external candidate?', keywords: ['import', 'external', 'candidate', 'apollo', 'add'], answer: ['From the External Scout, pick candidates and import them — they land in the Applicants tab like normal applicants, marked as externally sourced.'] },

  // Email & Inbox
  { id: 'email-threading', topic: 'Email & Inbox', question: 'How do email replies stay in one thread?', keywords: ['email', 'thread', 'reply', 'inbox', 'gmail'], answer: ['Replies sent from the dashboard include threading headers, so they group into the same conversation in Gmail.', 'Incoming replies are synced back into the inbox automatically.'] },
  { id: 'email-sync-stopped', topic: 'Email & Inbox', question: 'My emails stopped syncing — what do I do?', keywords: ['email', 'sync', 'stopped', 'not working', 'gmail', 'app password'], answer: ['The Gmail app password has usually expired. Create a new one in your Google account and ask a super admin to update it.', 'Syncing resumes once the new password is saved.'] },
  { id: 'email-sender', topic: 'Email & Inbox', question: 'Whose email address do messages go out from?', keywords: ['sender', 'from', 'email address', 'account', 'send as'], answer: ['Emails go out from the Gmail account connected to your admin user. Each admin can have their own connected account.'] },

  // Funnel
  { id: 'funnel-view', topic: 'Funnel', question: 'What does the recruitment funnel show?', keywords: ['funnel', 'recruiter dash', 'conversion', 'stages', 'historical'], answer: ['It shows how many candidates sit at each stage for a selected role, and how they convert from stage to stage.', 'Changing the role on the funnel also updates the historical data filter, and vice versa.'] },

  // Troubleshooting
  { id: 'stuck-page', topic: 'Troubleshooting', question: 'Something looks stuck or outdated', keywords: ['stuck', 'old', 'outdated', 'refresh', 'not updating', 'broken'], answer: ['First, refresh the page — most "stuck" views are just an old copy of the data.', 'Availability answers and some badges update on their own within about a minute.', 'If it\'s still wrong after a refresh, send a screenshot to the team so it can be checked.'] },
  { id: 'contact', topic: 'Troubleshooting', question: 'Who do I contact if something is broken?', keywords: ['contact', 'help', 'broken', 'error', 'support', 'who'], answer: ['Message the team with what you were doing and a screenshot of the error. Include the candidate or client name if it involves a specific record.'] },
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
