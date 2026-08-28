import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, isPast, startOfDay } from 'date-fns';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useHiringRequests, type HiringRequest } from '@/hooks/useHiringRequests';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Import admin avatars
import czaAvatar from '@/assets/team/cza.png';
import kristineAvatar from '@/assets/team/kristine.png';
import eduardoAvatar from '@/assets/team/eduardo.png';
import markAvatar from '@/assets/team/mark.png';
import liezlAvatar from '@/assets/team/liezl-new.png';

const ADMIN_AVATARS: Record<string, string> = {
  'czarina@outsta.io': czaAvatar,
  'kristine@outsta.io': kristineAvatar,
  'eduardo@outsta.io': eduardoAvatar,
  'mark@outsta.io': markAvatar,
  'liezl@outsta.io': liezlAvatar,
};
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, MessageCircle, Check, Download, Upload, ArrowUpDown, Search, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { exportPipeline } from '@/lib/exportUtils';
import { AddHiringRequestDialog } from './AddHiringRequestDialog';
import { HiringRequestDetailDialog } from './HiringRequestDetailDialog';
import { AddPipelineStageDialog } from './AddPipelineStageDialog';
import { PipelineImportDialog } from './PipelineImportDialog';
import { RecruiterAnalytics } from './RecruiterAnalytics';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

// Preload all GIFs on module load
const preloadedGifs: HTMLImageElement[] = [];
CELEBRATION_GIFS.forEach(url => {
  const img = new Image();
  img.src = url;
  preloadedGifs.push(img);
});

const getRandomGif = () => CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)];

// Celebration video URLs
const CELEBRATION_VIDEO_1 = '/videos/celebration.mp4';
const CELEBRATION_VIDEO_2 = '/videos/celebration2.mp4';
const CELEBRATION_AUDIO = '/audio/celebration-fanfare.mp3';

// Preload videos on module load
const preloadedVideos: HTMLVideoElement[] = [];
[CELEBRATION_VIDEO_1, CELEBRATION_VIDEO_2].forEach(url => {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.src = url;
  video.load();
  preloadedVideos.push(video);
});

// Preload celebration audio
const preloadedAudio = new Audio(CELEBRATION_AUDIO);
preloadedAudio.preload = 'auto';
preloadedAudio.volume = 0.5;

// Celebration Popup component - shows GIF or video based on streak
const CelebrationPopup = ({ 
  mediaUrl, 
  isVideo, 
  onComplete 
}: { 
  mediaUrl: string | null; 
  isVideo: boolean;
  onComplete: () => void;
}) => {
  useEffect(() => {
    if (!mediaUrl) return;
    // For GIFs, dismiss after 1.8s. For videos, use onEnded but add a fallback timeout
    // in case the video fails to load or play.
    const timeout = isVideo ? 5000 : 1800;
    const timer = setTimeout(() => {
      onComplete();
    }, timeout);
    return () => clearTimeout(timer);
  }, [mediaUrl, isVideo, onComplete]);

  if (!mediaUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none bg-black/20">
      <div className={isVideo ? "animate-[zoomIn_0.35s_ease-out_forwards]" : "animate-scale-in"}>
        <div className="relative">
          {isVideo ? (
            <video 
              src={mediaUrl}
              autoPlay
              muted
              playsInline
              onEnded={onComplete}
              className="w-[500px] h-[500px] object-contain drop-shadow-2xl rounded-lg"
              ref={(el) => { 
                if (el) {
                  el.playbackRate = 1.25;
                  // Start muted for autoplay compliance, then unmute for audio
                  el.play().then(() => {
                    // Unmute after playback starts to get audio
                    el.muted = false;
                  }).catch(() => {
                    // If autoplay fails completely, keep it muted
                    el.play().catch(() => {});
                  });
                }
              }}
            />
          ) : (
            <img 
              src={mediaUrl} 
              alt="Celebration" 
              className="w-64 h-64 object-contain drop-shadow-2xl"
            />
          )}
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
import { getAdminDisplayName } from '@/lib/adminDisplayNames';

interface KanbanCardProps {
  request: HiringRequest;
  index: number;
  onClick: () => void;
  adminUsers: AdminUser[];
  onComplete: (id: string) => void;
}

const KanbanCard = ({ request, index, onClick, adminUsers, onComplete }: KanbanCardProps) => {
  const isClosed = request.pipeline_stage === 'closed';
  const isLost = request.pipeline_stage === 'lost_client' || request.pipeline_stage === 'lost_outsta';
  const assignee = adminUsers.find(a => a.user_id === request.assigned_admin_id);
  const assigneeEmail = assignee?.email?.toLowerCase();
  const assigneeName = getAdminDisplayName(assignee?.email);
  const assigneeInitial = assigneeName.charAt(0).toUpperCase();
  const assigneeAvatar = assigneeEmail ? ADMIN_AVATARS[assigneeEmail] : undefined;
  const currentYear = new Date().getFullYear();
  
  // Check if a date is from a previous year
  const isFromPreviousYear = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.getFullYear() < currentYear;
  };
  
  // Format date with year if not current year
  const formatDateWithYear = (dateStr: string) => {
    const date = new Date(dateStr);
    const dateYear = date.getFullYear();
    return dateYear === currentYear 
      ? format(date, 'MMM d') 
      : format(date, 'MMM d, yyyy');
  };
  
  const formatDateRange = () => {
    // Always show start_date – target_end_date (the original timeline)
    if (!request.start_date && !request.target_end_date) return null;
    
    // Hide dates from previous years on lost stages
    if (isLost) {
      const startFromPrevYear = request.start_date && isFromPreviousYear(request.start_date);
      const endFromPrevYear = request.target_end_date && isFromPreviousYear(request.target_end_date);
      if (startFromPrevYear || endFromPrevYear) return null;
    }
    
    const start = request.start_date ? formatDateWithYear(request.start_date) : '';
    const end = request.target_end_date ? formatDateWithYear(request.target_end_date) : '';
    
    if (start && end) return `${start} – ${end}`;
    if (start) return `From ${start}`;
    if (end) return `Until ${end}`;
    return null;
  };
  const dateRange = formatDateRange();
  const isOverdue = !isClosed && request.target_end_date && isPast(startOfDay(new Date(request.target_end_date)));
  // Show closed date if in closed stage - use closed_at, fallback to updated_at for display
  const closedDate = isClosed 
    ? formatDateWithYear(request.closed_at || request.updated_at) 
    : null;

  return (
    <Draggable draggableId={request.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          style={provided.draggableProps.style}
          className={`
            group p-3 rounded-lg border bg-card cursor-grab active:cursor-grabbing
            mb-2
            ${snapshot.isDragging 
              ? 'shadow-2xl ring-2 ring-primary border-primary z-50 rotate-2 scale-[1.02]' 
              : 'shadow-sm hover:shadow-md hover:border-primary/30'
            }
          `}
        >
          {/* Title with job role */}
          <div className="flex items-start gap-2 mb-2">
            <button
              data-size="icon"
              onClick={(e) => {
                e.stopPropagation();
                if (!isClosed) {
                  onComplete(request.id);
                }
              }}
              style={{ width: 22, height: 22, padding: 0 }}
              className={`
                rounded-[2px] border flex-shrink-0 mt-0.5 flex items-center justify-center
                transition-all duration-150
                ${isClosed 
                  ? 'bg-green-500 border-green-500 text-white' 
                  : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/10'
                }
              `}
              title={isClosed ? 'Completed' : 'Mark as complete'}
            >
              {isClosed && <Check className="w-3 h-3" strokeWidth={3} />}
            </button>
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
              className={`text-xs ${
                request.priority === 'high' 
                  ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30' 
                  : request.priority === 'medium'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30'
              }`}
            >
              {request.priority === 'high' ? 'High' : request.priority === 'medium' ? 'Medium' : 'Low'}
            </Badge>
            {request.industry && (
              <Badge variant="outline" className={`text-xs ${getIndustryClass(request.industry)}`}>
                {request.industry}
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`text-xs ${
                request.client_status === 'new' 
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' 
                  : request.client_status === 'returning'
                    ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30'
                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'
              }`}
            >
              {request.client_status === 'new' ? 'New' : request.client_status === 'returning' ? 'Returning' : 'Existing'}
            </Badge>
            {request.hours_per_week && request.hours_per_week !== 'TBD' && (
              <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30">
                {request.hours_per_week}h/wk
              </Badge>
            )}
          </div>

          {/* Footer with avatar, name, date, and comment count */}
          <div className="flex items-start justify-between text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-default">
                    <Avatar className="h-6 w-6">
                      {assigneeAvatar ? (
                        <AvatarImage src={assigneeAvatar} alt={assigneeName} />
                      ) : null}
                      <AvatarFallback className={`text-xs ${assignee ? 'bg-blue-500 text-white' : 'bg-muted'}`}>
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
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              {dateRange && (
                <span className={isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}>{dateRange}</span>
              )}
              {closedDate && (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ {closedDate}
                </span>
              )}
              {request.comment_count > 0 && (
                <div className="flex items-center gap-0.5">
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
  const { requests, loading: requestsLoading, updateStage, fetchRequests } = useHiringRequests();
  const { stages, loading: stagesLoading } = usePipelineStages();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStageDialogOpen, setAddStageDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<HiringRequest | null>(null);
  const [addToStage, setAddToStage] = useState<string>('backlog');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [celebrationMedia, setCelebrationMedia] = useState<string | null>(null);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [closureCount, setClosureCount] = useState(0);
  const [stageSortBy, setStageSortBy] = useState<Record<string, 'priority' | 'target_end_date' | 'closed_at' | 'created_at'>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilterName, setClientFilterName] = useState<string | null>(null);
  const { toast } = useToast();

  const clientFilterId = searchParams.get('clientId');

  const loading = requestsLoading || stagesLoading;

  // Resolve client name from filtered requests or clients table
  useEffect(() => {
    if (!clientFilterId) {
      setClientFilterName(null);
      return;
    }
    const match = requests.find(r => r.client_id === clientFilterId);
    if (match?.client_name) {
      setClientFilterName(match.client_name);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('clients').select('company_name').eq('id', clientFilterId).single();
      if (cancelled || error) return;
      setClientFilterName(data?.company_name || 'Unknown Client');
    })();
    return () => { cancelled = true; };
  }, [clientFilterId, requests]);

  // Auto-open the request detail when filtered by client (once per clientId)
  const autoOpenedClientRef = useRef<string | null>(null);
  useEffect(() => {
    if (!clientFilterId) {
      autoOpenedClientRef.current = null;
      return;
    }
    if (autoOpenedClientRef.current === clientFilterId) return;
    const matches = requests.filter(r => r.client_id === clientFilterId);
    if (matches.length === 0) return;
    const pick = [...matches].sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
    autoOpenedClientRef.current = clientFilterId;
    setSelectedRequest(pick);
  }, [clientFilterId, requests]);
  
  // Sort function based on sort option
  const sortRequests = (items: HiringRequest[], sortOption: 'priority' | 'target_end_date' | 'closed_at' | 'created_at'): HiringRequest[] => {
    return [...items].sort((a, b) => {
      switch (sortOption) {
        case 'priority': {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        case 'target_end_date': {
          if (!a.target_end_date && !b.target_end_date) return 0;
          if (!a.target_end_date) return 1;
          if (!b.target_end_date) return -1;
          return new Date(a.target_end_date).getTime() - new Date(b.target_end_date).getTime();
        }
        case 'closed_at': {
          if (!a.closed_at && !b.closed_at) return 0;
          if (!a.closed_at) return 1;
          if (!b.closed_at) return -1;
          return new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime();
        }
        case 'created_at': {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        default:
          return 0;
      }
    });
  };

  // Get sorted requests for a stage
  const getSortedRequests = (stageSlug: string, items: HiringRequest[]): HiringRequest[] => {
    // Default to closed_at for closed column, priority for others
    const sortOption = stageSortBy[stageSlug] || (stageSlug === 'closed' ? 'closed_at' : 'priority');
    return sortRequests(items, sortOption);
  };

  // Filter requests by search term and selected client
  const filteredRequests = useMemo(() => {
    let result = requests;
    if (clientFilterId) {
      result = result.filter(r => r.client_id === clientFilterId);
    }
    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(r => {
      const assignee = adminUsers.find(a => a.user_id === r.assigned_admin_id);
      const assigneeName = getAdminDisplayName(assignee?.email).toLowerCase();
      return (
        r.job_title.toLowerCase().includes(term) ||
        (r.client_name || '').toLowerCase().includes(term) ||
        (r.industry || '').toLowerCase().includes(term) ||
        (r.source || '').toLowerCase().includes(term) ||
        assigneeName.includes(term)
      );
    });
  }, [requests, searchTerm, adminUsers, clientFilterId]);

  // Group requests by pipeline stage dynamically
  const requestsByStage = stages.reduce((acc, stage) => {
    const stageRequests = filteredRequests.filter(r => r.pipeline_stage === stage.slug);
    acc[stage.slug] = getSortedRequests(stage.slug, stageRequests);
    return acc;
  }, {} as Record<string, HiringRequest[]>);

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

    const sourceStage = result.source.droppableId;
    const destStage = result.destination.droppableId;

    if (sourceStage === destStage) return;

    // Show celebration when moving to closed
    if (destStage === 'closed' && sourceStage !== 'closed') {
      triggerCelebration();
    }

    updateStage(result.draggableId, destStage);
  };

  const handleAddTask = (stage: string) => {
    setAddToStage(stage);
    setAddDialogOpen(true);
  };

  // Trigger celebration - cycles: GIF (1st), Video1 (2nd), Video2 with audio (3rd), repeat...
  const triggerCelebration = () => {
    const newCount = closureCount + 1;
    setClosureCount(newCount);
    
    const cyclePosition = newCount % 3;
    
    if (cyclePosition === 1) {
      // 1st, 4th, 7th... → Random GIF
      setCelebrationMedia(getRandomGif());
      setIsVideoMode(false);
    } else if (cyclePosition === 2) {
      // 2nd, 5th, 8th... → Video 1
      setCelebrationMedia(CELEBRATION_VIDEO_1);
      setIsVideoMode(true);
    } else {
      // 3rd, 6th, 9th... → Video 2 with background music
      setCelebrationMedia(CELEBRATION_VIDEO_2);
      setIsVideoMode(true);
      // Play celebration fanfare audio
      preloadedAudio.currentTime = 0;
      preloadedAudio.play().catch(() => {});
    }
  };

  const handleCompleteTask = (id: string) => {
    triggerCelebration();
    updateStage(id, 'closed');
  };

  // Calculate role counts per recruiter (only active hiring stages: sourcing, pitch, scheduled-interview)
  // MUST be before any early returns to maintain hook order
  const recruiterStats = useMemo(() => {
    const activeStages = ['sourcing', 'pitch', 'scheduled_interview'];
    const activeRequests = requests.filter(r => activeStages.includes(r.pipeline_stage));
    const stats: Record<string, { name: string; count: number; avatar?: string }> = {};
    
    // Key recruiters to always show
    const keyRecruiters = ['czarina@outsta.io', 'kristine@outsta.io', 'eduardo@outsta.io'];
    keyRecruiters.forEach(email => {
      stats[email] = { 
        name: email === 'czarina@outsta.io' ? 'Cza' : email === 'kristine@outsta.io' ? 'Kristine' : 'Eduardo',
        count: 0,
        avatar: ADMIN_AVATARS[email]
      };
    });
    
    activeRequests.forEach(r => {
      const admin = adminUsers.find(a => a.user_id === r.assigned_admin_id);
      const email = admin?.email?.toLowerCase();
      if (email && keyRecruiters.includes(email)) {
        stats[email].count++;
      }
    });
    
    return Object.values(stats);
  }, [requests, adminUsers]);

  const handleExport = async () => {
    const result = await exportPipeline();
    if (result.success) {
      toast({ title: 'Success', description: `Exported ${result.count} pipeline requests` });
    } else {
      toast({ title: 'Error', description: result.error || 'Export failed', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex-shrink-0 w-72">
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
      {clientFilterId && (
        <div className="px-4 py-2 border-b bg-primary/5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">
              Showing pipeline for: {clientFilterName || 'Loading…'}
            </span>
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              {filteredRequests.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs flex-shrink-0"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('clientId');
              setSearchParams(next, { replace: true });
            }}
          >
            <X className="w-3 h-3 mr-1" />
            Clear filter
          </Button>
        </div>
      )}

      {/* Recruiter Analytics Section */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold mb-2">Recruiter Performance</h3>
        <RecruiterAnalytics requests={requests} adminUsers={adminUsers} />
      </div>

      {/* Pipeline Header with Search + Import/Export */}
      <div className="flex items-center justify-between px-4 py-1 border-b">
        <div className="flex items-center gap-4">
          {/* Recruiter Stats */}
          <div className="flex items-center gap-4">
            {recruiterStats.map(stat => (
              <div key={stat.name} className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  {stat.avatar && <AvatarImage src={stat.avatar} alt={stat.name} />}
                  <AvatarFallback className="text-[10px] bg-primary/10">{stat.name[0]}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">{stat.name}</span>
                <Badge variant="secondary" className="text-sm px-2.5 py-0.5 h-6">{stat.count}</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search pipeline..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 w-44 rounded-md border border-input bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-3 h-3 mr-1.5" />
            Import
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExport}>
            <Download className="w-3 h-3 mr-1.5" />
            Export
          </Button>
        </div>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 px-4 pt-2 pb-4 overflow-x-auto h-[calc(100vh-160px)]">
          {stages.map(stage => {
            const stageRequests = requestsByStage[stage.slug] || [];
            const currentSort = stageSortBy[stage.slug] || (stage.slug === 'closed' ? 'closed_at' : 'priority');
            
            return (
              <div key={stage.id} className="flex-shrink-0 w-72 flex flex-col">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-shrink">
                    <h3 className="font-semibold text-sm whitespace-nowrap truncate">
                      {stage.name}{stage.emoji && ` ${stage.emoji}`}
                    </h3>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {stageRequests.length}
                    </Badge>
                  </div>
                  <Select 
                    value={currentSort} 
                    onValueChange={(v) => setStageSortBy(prev => ({ ...prev, [stage.slug]: v as any }))}
                  >
                    <SelectTrigger className="h-6 w-[100px] text-[10px] px-2 flex-shrink-0">
                      <ArrowUpDown className="w-2.5 h-2.5 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="priority" className="text-xs">Priority</SelectItem>
                      <SelectItem value="target_end_date" className="text-xs">Target Date</SelectItem>
                      <SelectItem value="closed_at" className="text-xs">Closed Date</SelectItem>
                      <SelectItem value="created_at" className="text-xs">Created Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Column Content */}
                <Droppable droppableId={stage.slug}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`
                        flex-1 rounded-lg p-2 transition-all duration-150 overflow-y-auto border shadow-sm
                        ${snapshot.isDraggingOver 
                          ? 'bg-primary/10 ring-2 ring-primary/40 border-primary/40' 
                          : 'bg-muted dark:bg-muted/30 border-border'
                        }
                      `}
                    >
                      {stageRequests.map((request, index) => (
                        <KanbanCard 
                          key={request.id} 
                          request={request} 
                          index={index}
                          onClick={() => setSelectedRequest(request)}
                          adminUsers={adminUsers}
                          onComplete={handleCompleteTask}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>

                {/* Add Task Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground"
                  onClick={() => handleAddTask(stage.slug)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add task
                </Button>
              </div>
            );
          })}

          {/* Add Section Button */}
          <div className="flex-shrink-0 w-72 flex flex-col">
            <Button
              variant="outline"
              className="h-full min-h-[200px] border-dashed border-2 text-muted-foreground hover:text-foreground hover:border-primary/50 flex flex-col gap-2"
              onClick={() => setAddStageDialogOpen(true)}
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Add Section</span>
            </Button>
          </div>
        </div>
      </DragDropContext>

      {/* Add Request Dialog */}
      <AddHiringRequestDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        defaultStage={addToStage}
        onCreated={() => fetchRequests(false)}
      />

      {/* Add Pipeline Stage Dialog */}
      <AddPipelineStageDialog
        open={addStageDialogOpen}
        onOpenChange={setAddStageDialogOpen}
      />

      {/* Pipeline Import Dialog */}
      <PipelineImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={() => fetchRequests(false)}
      />

      {/* Detail Dialog */}
      <HiringRequestDetailDialog
        request={selectedRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
        onUpdated={() => fetchRequests(false)}
      />

      {/* Celebration Popup */}
      <CelebrationPopup 
        mediaUrl={celebrationMedia}
        isVideo={isVideoMode}
        onComplete={() => setCelebrationMedia(null)} 
      />
    </>
  );
};
