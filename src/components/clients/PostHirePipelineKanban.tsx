import { useState, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useContractorPipeline, type ContractorPipelineTracking, type ContractorPipelineStage } from '@/hooks/useContractorPipeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, X, RefreshCw, Calendar, Building2, User, Clock, Mail, Send, ClipboardList, Library } from 'lucide-react';
import { differenceInDays, differenceInWeeks, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { StageEmailTemplateDialog } from './StageEmailTemplateDialog';
import { SendCheckinEmailDialog } from './SendCheckinEmailDialog';
import { StageCheckinConfigDialog } from './StageCheckinConfigDialog';
import { CheckinTemplateLibraryDialog } from './CheckinTemplateLibraryDialog';
import { formatDate } from "@/lib/dateFormat";

export const PostHirePipelineKanban = () => {
  const { stages, tracking, loading, moveToStage, fetchAll } = useContractorPipeline();
  const [searchQuery, setSearchQuery] = useState('');
  const [processingMilestones, setProcessingMilestones] = useState(false);
  const [editingStage, setEditingStage] = useState<ContractorPipelineStage | null>(null);
  const [stageCheckinTarget, setStageCheckinTarget] = useState<ContractorPipelineStage | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<{ item: ContractorPipelineTracking; stage: ContractorPipelineStage } | null>(null);
  const { toast } = useToast();

  const filteredTracking = useMemo(() => {
    // Exclude terminated and resigned contractors from the post-hire pipeline
    const base = tracking.filter(t => !['terminated', 'resigned'].includes(t.contractor?.status || ''));
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(t => {
      const name = t.contractor?.applicant?.full_name?.toLowerCase() || '';
      const company = t.contractor?.client?.company_name?.toLowerCase() || '';
      const title = t.contractor?.job_title?.toLowerCase() || '';
      return name.includes(q) || company.includes(q) || title.includes(q);
    });
  }, [tracking, searchQuery]);

  const getTrackingForStage = (stageId: string) => 
    filteredTracking.filter(t => t.current_stage_id === stageId);

  const getWeeksElapsed = (startDate: string | null | undefined) => {
    if (!startDate) return 0;
    return differenceInWeeks(new Date(), new Date(startDate));
  };

  const getDaysElapsed = (startDate: string | null | undefined) => {
    if (!startDate) return 0;
    return differenceInDays(new Date(), new Date(startDate));
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const trackingId = result.draggableId;
    const newStageId = result.destination.droppableId;
    if (result.source.droppableId === newStageId) return;
    await moveToStage(trackingId, newStageId);
  };

  const handleProcessMilestones = async () => {
    setProcessingMilestones(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-contractor-milestones');
      if (error) throw error;
      toast({ 
        title: 'Milestones processed', 
        description: data?.message || 'Contractors updated successfully' 
      });
      fetchAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingMilestones(false);
    }
  };

  if (loading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="min-w-[280px]">
            <Skeleton className="h-8 w-full mb-2" />
            <Skeleton className="h-24 w-full mb-2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)} className="h-8 text-xs">
              <Library className="w-3.5 h-3.5 mr-1.5" />
              Templates
            </Button>
          </TooltipTrigger>
          <TooltipContent>Manage reusable check-in templates</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleProcessMilestones}
              disabled={processingMilestones}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${processingMilestones ? 'animate-spin' : ''}`} />
              Process Milestones
            </Button>
          </TooltipTrigger>
          <TooltipContent>Auto-advance contractors and send check-in emails</TooltipContent>
        </Tooltip>
      </div>


      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 px-4 pb-4 overflow-x-auto flex-1">
          {stages.map(stage => {
            const stageTracking = getTrackingForStage(stage.id);
            return (
              <div key={stage.id} className="min-w-[270px] max-w-[270px] flex flex-col">
                {/* Column Header */}
                <div className="flex items-center justify-between px-2 py-1.5 mb-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{stage.emoji}</span>
                    <span className="text-xs font-semibold truncate">{stage.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setEditingStage(stage)}
                          className={`p-0.5 rounded hover:bg-background transition-colors ${
                            stage.checkin_email_subject ? 'text-primary' : 'text-muted-foreground/50'
                          }`}
                        >
                          <Mail className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {stage.checkin_email_subject ? 'Edit email template' : 'Add email template'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setStageCheckinTarget(stage)}
                          className={`p-0.5 rounded hover:bg-background transition-colors ${
                            Array.isArray((stage as any).checkin_sections) && (stage as any).checkin_sections.length > 0
                              ? 'text-primary'
                              : 'text-muted-foreground/50'
                          }`}
                        >
                          <ClipboardList className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {Array.isArray((stage as any).checkin_sections) && (stage as any).checkin_sections.length > 0
                          ? 'Edit stage check-in template'
                          : 'Add stage check-in template'}
                      </TooltipContent>
                    </Tooltip>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      {stageTracking.length}
                    </Badge>
                  </div>
                </div>


                {/* Column Content */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <ScrollArea className="flex-1 max-h-[calc(100vh-260px)]">
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[60px] space-y-2 p-1 rounded-md transition-colors ${
                          snapshot.isDraggingOver ? 'bg-primary/5 border border-dashed border-primary/30' : ''
                        }`}
                      >
                        {stageTracking.map((item, index) => (
                          <ContractorCard 
                            key={item.id} 
                            item={item} 
                            index={index}
                            daysElapsed={getDaysElapsed(item.contractor?.start_date)}
                            weeksElapsed={getWeeksElapsed(item.contractor?.start_date)}
                            onSendEmail={() => setEmailTarget({ item, stage })}
                            hasEmailTemplate={!!(
                              stage.checkin_email_subject ||
                              stage.contractor_email_subject ||
                              (Array.isArray((stage as any).checkin_sections) && (stage as any).checkin_sections.length > 0)
                            )}
                          />
                        ))}
                        {provided.placeholder}
                        {stageTracking.length === 0 && (
                          <div className="text-center py-6 text-[11px] text-muted-foreground">
                            No contractors
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <StageEmailTemplateDialog
        open={!!editingStage}
        onOpenChange={(open) => !open && setEditingStage(null)}
        stage={editingStage}
        onSaved={fetchAll}
      />

      <SendCheckinEmailDialog
        open={!!emailTarget}
        onOpenChange={(open) => !open && setEmailTarget(null)}
        contractor={emailTarget ? {
          assignmentId: emailTarget.item.contractor?.id || '',
          contractorName: emailTarget.item.contractor?.applicant?.full_name || 'Unknown',
          contractorFirstName: (emailTarget.item.contractor?.applicant?.full_name || 'Unknown').split(' ')[0],
          contractorEmail: emailTarget.item.contractor?.applicant?.email || '',
          clientId: emailTarget.item.contractor?.client_id || '',
          clientName: emailTarget.item.contractor?.client?.company_name || '',
          jobTitle: emailTarget.item.contractor?.job_title || '',
          weeksElapsed: getWeeksElapsed(emailTarget.item.contractor?.start_date),
          startDate: emailTarget.item.contractor?.start_date || null,

        } : null}
        stage={emailTarget?.stage || null}
      />

      <StageCheckinConfigDialog
        open={!!stageCheckinTarget}
        onOpenChange={(o) => !o && setStageCheckinTarget(null)}
        stageId={stageCheckinTarget?.id || null}
        stageName={stageCheckinTarget?.name}
        onSaved={fetchAll}
      />

      <CheckinTemplateLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
      />
    </div>
  );
};

interface ContractorCardProps {
  item: ContractorPipelineTracking;
  index: number;
  daysElapsed: number;
  weeksElapsed: number;
  onSendEmail: () => void;
  hasEmailTemplate: boolean;
}

const ContractorCard = ({ item, index, daysElapsed, weeksElapsed, onSendEmail, hasEmailTemplate }: ContractorCardProps) => {
  const name = item.contractor?.applicant?.full_name || 'Unknown';
  const company = item.contractor?.client?.company_name || 'Unassigned';
  const jobTitle = item.contractor?.job_title || 'No title';
  const startDate = item.contractor?.start_date;

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`rounded-lg border bg-card p-2.5 shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : 'hover:shadow-md'
          }`}
        >
          {/* Name & Company */}
          <div className="flex items-start justify-between gap-1 mb-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{name}</p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{company}</span>
              </div>
            </div>
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 flex-shrink-0">
              {weeksElapsed}w
            </Badge>
          </div>

          {/* Job Title */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1.5">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{jobTitle}</span>
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {startDate && (
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Calendar className="w-2.5 h-2.5" />
                  <span>{formatDate(startDate)}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                <span>{daysElapsed}d</span>
              </div>
            </div>
            {hasEmailTemplate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSendEmail(); }}
                    className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Send check-in to portal</TooltipContent>
              </Tooltip>
            )}
          </div>

        </div>
      )}
    </Draggable>
  );
};
