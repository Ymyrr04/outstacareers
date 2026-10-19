import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StageNoteDialog } from '@/components/StageNoteDialog';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <StageNoteDialog
        pending={{
          applicantId: '00000000-0000-0000-0000-000000000000',
          candidateName: 'Check Candidate',
          newStatus: 'SIV',
        }}
        onOpenChange={() => {}}
      />
    </TooltipProvider>
  </QueryClientProvider>,
);
