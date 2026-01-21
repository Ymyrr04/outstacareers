import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useHiringRequests, PIPELINE_STAGES, type HiringRequest, type PipelineStage } from '@/hooks/useHiringRequests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, MessageCircle } from 'lucide-react';
import { AddHiringRequestDialog } from './AddHiringRequestDialog';
import { HiringRequestDetailDialog } from './HiringRequestDetailDialog';
import { supabase } from '@/integrations/supabase/client';

// Celebration GIFs pool
const CELEBRATION_GIFS = [
  'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif', // Confetti
  'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', // Party popper
  'https://media.giphy.com/media/xT0GqssRweIhlz209i/giphy.gif', // Checkmark
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', // Dancing
  'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif', // Fireworks
  'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', // Thumbs up
  'https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif', // Clapping
  'https://media.giphy.com/media/3oz8xRF0v9WMAUVLNK/giphy.gif', // Star burst
];

const getRandomGif = () => CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)];

// Celebration GIF component
const CelebrationPopup = ({ gifUrl, onComplete }: { gifUrl: string | null; onComplete: () => void }) => {
  useEffect(() => {
    if (gifUrl) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [gifUrl, onComplete]);

  if (!gifUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="animate-scale-in">
        <div className="relative">
          {/* Celebration GIF */}
          <img 
            src={gifUrl} 
            alt="Celebration" 
            className="w-64 h-64 object-contain drop-shadow-2xl"
          />
          {/* Success message */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full font-bold text-lg shadow-lg animate-fade-in whitespace-nowrap">
            🎉 Task Completed!
          </div>
        </div>
      </div>
    </div>
  );
};

interface AdminUser {
  user_id: string;
  email: string;
}

const INDUSTRY_COLORS: Record<string, string> = {
  'Healthcare': 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
  'Legal': 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  'E-Commerce': 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  'Financial': 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'Agriculture - Supply Chain': 'bg-lime-500/20 text-lime-700 dark:text-lime-400 border-lime-500/30',
  'Marketing and Advertising': 'bg-pink-500/20 text-pink-700 dark:text-pink-400 border-pink-500/30',
  'Consulting': 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
  'Real Estate': 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
  'Technology': 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
};

const getIndustryClass = (industry: string | null): string => {
  if (!industry) return 'bg-muted text-muted-foreground';
  return INDUSTRY_COLORS[industry] || 'bg-muted text-muted-foreground';
};

// Map emails to display names
const EMAIL_TO_NAME: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

const getDisplayName = (email: string | undefined): string => {
  if (!email) return 'Unassigned';
  const lowerEmail = email.toLowerCase();
  return EMAIL_TO_NAME[lowerEmail] || email.split('@')[0];
};

interface KanbanCardProps {
  request: HiringRequest;
  index: number;
  onClick: () => void;
  adminUsers: AdminUser[];
}

const KanbanCard = ({ request, index, onClick, adminUsers }: KanbanCardProps) => {
  const assignee = adminUsers.find(a => a.user_id === request.assigned_admin_id);
  const assigneeInitial = assignee?.email?.charAt(0).toUpperCase() || '?';
  const assigneeName = getDisplayName(assignee?.email);
  const formatDateRange = () => {
    if (!request.start_date && !request.target_end_date) return null;
    
    const start = request.start_date ? format(new Date(request.start_date), 'MMM d') : '';
    const end = request.target_end_date ? format(new Date(request.target_end_date), 'MMM d') : '';
    
    if (start && end) return `${start} – ${end}`;
    if (start) return `From ${start}`;
    if (end) return `Until ${end}`;
    return null;
  };

  const dateRange = formatDateRange();

  return (
    <Draggable draggableId={request.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`
            group p-3 rounded-lg border bg-card cursor-pointer
            transition-all duration-200 mb-2
            hover:shadow-md hover:border-primary/30
            ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/50 rotate-2' : ''}
          `}
        >
          {/* Title with job role */}
          <div className="flex items-start gap-2 mb-2">
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-tight">
              {request.client_name} {'{' + request.job_title + '}'}
              {request.source && (
                <span className="text-muted-foreground font-normal"> - from {request.source}</span>
              )}
            </p>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mb-2">
            <Badge 
              variant="outline" 
              className={`text-xs ${request.priority === 'high' ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30' : 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30'}`}
            >
              {request.priority === 'high' ? 'High' : 'Low'}
            </Badge>
            {request.industry && (
              <Badge variant="outline" className={`text-xs ${getIndustryClass(request.industry)}`}>
                {request.industry}
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`text-xs ${request.client_status === 'new' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'}`}
            >
              {request.client_status === 'new' ? 'New' : 'Existing'}
            </Badge>
          </div>

          {/* Footer with avatar, name, date, and comment count */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-default">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className={`text-[10px] ${assignee ? 'bg-primary/20 text-primary' : 'bg-muted'}`}>
                        {assigneeInitial}
                      </AvatarFallback>
                    </Avatar>
                    <span className={assignee ? 'text-foreground' : ''}>{assigneeName}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {assignee ? assignee.email : 'Unassigned'}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              {dateRange && (
                <span className="text-primary">{dateRange}</span>
              )}
              {request.comment_count > 0 && (
                <div className="flex items-center gap-1">
                  {request.comment_count}
                  <MessageCircle className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
};

export const HiringPipelineKanban = () => {
  const { requestsByStage, loading, updateStage, fetchRequests } = useHiringRequests();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<HiringRequest | null>(null);
  const [addToStage, setAddToStage] = useState<PipelineStage>('backlog');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [celebrationGif, setCelebrationGif] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdminUsers = async () => {
      const { data, error } = await supabase.functions.invoke('get-admin-users');
      if (!error && data?.adminUsers) {
        setAdminUsers(data.adminUsers);
      }
    };
    fetchAdminUsers();
  }, []);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceStage = result.source.droppableId as PipelineStage;
    const destStage = result.destination.droppableId as PipelineStage;

    if (sourceStage === destStage) return;

    // Show celebration when moving to closed
    if (destStage === 'closed' && sourceStage !== 'closed') {
      setCelebrationGif(getRandomGif());
    }

    updateStage(result.draggableId, destStage);
  };

  const handleAddTask = (stage: PipelineStage) => {
    setAddToStage(stage);
    setAddDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto">
        {PIPELINE_STAGES.map(stage => (
          <div key={stage.id} className="flex-shrink-0 w-72">
            <Skeleton className="h-8 w-full mb-4" />
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-4 overflow-x-auto h-[calc(100vh-200px)]">
          {PIPELINE_STAGES.map(stage => {
            const stageRequests = requestsByStage[stage.id] || [];
            
            return (
              <div key={stage.id} className="flex-shrink-0 w-72 flex flex-col">
                {/* Column Header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <h3 className="font-semibold text-sm">
                    {stage.label} {stage.emoji && stage.emoji}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {stageRequests.length}
                  </Badge>
                </div>

                {/* Column Content */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <ScrollArea 
                      className={`
                        flex-1 rounded-lg p-2 transition-colors
                        ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-muted/30'}
                      `}
                    >
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="min-h-[100px]"
                      >
                        {stageRequests.map((request, index) => (
                          <KanbanCard 
                            key={request.id} 
                            request={request} 
                            index={index}
                            onClick={() => setSelectedRequest(request)}
                            adminUsers={adminUsers}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>

                {/* Add Task Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground"
                  onClick={() => handleAddTask(stage.id)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add task
                </Button>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Add Request Dialog */}
      <AddHiringRequestDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        defaultStage={addToStage}
        onCreated={() => fetchRequests(false)}
      />

      {/* Detail Dialog */}
      <HiringRequestDetailDialog
        request={selectedRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
        onUpdated={() => fetchRequests(false)}
      />

      {/* Celebration Popup */}
      <CelebrationPopup 
        gifUrl={celebrationGif} 
        onComplete={() => setCelebrationGif(null)} 
      />
    </>
  );
};
