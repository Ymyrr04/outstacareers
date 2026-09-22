import { Link2 } from 'lucide-react';
import { useCandidateLinks } from '@/hooks/useCandidateLinks';
import { formatDate } from '@/lib/dateFormat';

interface Props {
  applicantId: string;
}

/** Shows how many client requests this candidate has been linked to. */
export function LinkedClientsBadge({ applicantId }: Props) {
  const links = useCandidateLinks(applicantId);
  if (links.length === 0) return null;

  const clients = Array.from(new Set(links.map((l) => l.clientName)));
  const tooltip = links
    .map((l) => `${l.clientName}${l.jobTitle ? ` — ${l.jobTitle}` : ''} (${formatDate(l.createdAt)})`)
    .join('\n');

  return (
    <span
      title={`Linked to:\n${tooltip}`}
      className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-px rounded-[3px] bg-[#E0F7FC] text-[#066F85] border border-[#B2EEF8] dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900"
    >
      <Link2 className="w-2 h-2" />
      {clients.length === 1 ? clients[0] : `${clients.length} clients`}
    </span>
  );
}
