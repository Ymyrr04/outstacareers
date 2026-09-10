import { useEffect, useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePaginatedApplicants, PaginatedApplicant } from '@/hooks/usePaginatedApplicants';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Star, Eye, Trash2, GripVertical, Loader2, FileText, Download, 
  Mail, History, Send, Phone, MapPin, Clock, Check, X, 
  Briefcase, FolderOpen, Smartphone, Monitor, MessageCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import { ApplicantSourceBadge } from '@/components/ApplicantSourceBadge';
import { ApplicationHistoryBadge } from '@/components/ApplicationHistoryBadge';
import { CopyableText } from '@/components/CopyableText';
import { formatDateShort } from "@/lib/dateFormat";

interface PaginatedFolderViewProps {
  status: string;
  searchTerm: string;
  sortBy: 'newest' | 'score-desc' | 'score-asc' | 'starred';
  statusOptions: readonly string[];
  onUpdateStatus: (id: string, status: string) => void;
  onViewDetails: (id: string) => void;
  onDelete: (id: string) => void;
  onPreviewCv: (path: string, name: string, cvText?: string | null) => void;
  onDownloadCv: (id: string, path: string, name: string) => void;
  onToggleStar: (id: string) => void;
  onSendEmail: (applicant: { id: string; name: string; email: string }) => void;
  onViewHistory: (applicant: { id: string; name: string; email: string }) => void;
  onSendInvite: (applicant: { id: string; name: string; email: string; jobId: string | null; jobTitle: string }) => void;
  expandedApplicant: string | null;
  expandingApplicantId: string | null;
  loadingPreview: boolean;
  downloadingCv: string | null;
  unreadCounts: Record<string, number>;
  enabled?: boolean;
  onDragStart?: (applicant: PaginatedApplicant) => void;
  onDragEnd?: () => void;
  draggedApplicantId?: string | null;
}

const ESTIMATED_ROW_HEIGHT = 160;

export const PaginatedFolderView = ({
  status,
  searchTerm,
  sortBy,
  statusOptions,
  onUpdateStatus,
  onViewDetails,
  onDelete,
  onPreviewCv,
  onDownloadCv,
  onToggleStar,
  onSendEmail,
  onViewHistory,
  onSendInvite,
  expandedApplicant,
  expandingApplicantId,
  loadingPreview,
  downloadingCv,
  unreadCounts,
  enabled = true,
  onDragStart,
  onDragEnd,
  draggedApplicantId,
}: PaginatedFolderViewProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const {
    applicants,
    loading,
    totalCount,
    hasMore,
    loadNextPage,
    updateApplicant,
  } = usePaginatedApplicants({
    status,
    searchTerm,
    sortBy,
    pageSize: 50,
    enabled,
  });

  const virtualizer = useVirtualizer({
    count: applicants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => applicants[index]?.id || index.toString(),
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Load more when near bottom
  useEffect(() => {
    const [lastItem] = [...virtualizer.getVirtualItems()].reverse();
    if (!lastItem) return;
    
    if (lastItem.index >= applicants.length - 5 && hasMore && !loading) {
      loadNextPage();
    }
  }, [virtualizer.getVirtualItems(), applicants.length, hasMore, loading, loadNextPage]);

  // Update status locally and call parent
  const handleUpdateStatus = useCallback((id: string, newStatus: string) => {
    updateApplicant(id, { status: newStatus });
    onUpdateStatus(id, newStatus);
  }, [updateApplicant, onUpdateStatus]);

  // Toggle star
  const handleToggleStar = useCallback((id: string) => {
    const applicant = applicants.find(a => a.id === id);
    if (applicant) {
      updateApplicant(id, { is_starred: !applicant.is_starred });
    }
    onToggleStar(id);
  }, [applicants, updateApplicant, onToggleStar]);

  const getScoreDisplay = (applicant: PaginatedApplicant) => {
    const cvScore = applicant.total_score;
    const interviewScore = applicant.interview_session?.overall_score;
    
    // Check for valid numeric scores (not null and not NaN)
    const hasCvScore = cvScore !== null && !isNaN(cvScore);
    const hasInterviewScore = interviewScore !== null && !isNaN(interviewScore);
    
    if (hasCvScore && hasInterviewScore) {
      return { score: Math.round((cvScore + interviewScore) / 2), label: 'Overall' };
    }
    if (hasCvScore) return { score: cvScore, label: 'CV' };
    if (hasInterviewScore) return { score: interviewScore, label: 'Interview' };
    return null;
  };

  // Initial loading
  if (loading && applicants.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading applicants...
      </div>
    );
  }

  // Empty state
  if (!loading && applicants.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No applicants in "{status}" folder.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          Showing {applicants.length} of {totalCount} applicants
        </span>
        {loading && (
          <span className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading more...
          </span>
        )}
      </div>

      <div
        ref={parentRef}
        className="h-[calc(100vh-400px)] overflow-auto rounded-lg border"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const applicant = applicants[virtualRow.index];
            if (!applicant) return null;

            const isNew = applicant.status === 'For Review' && !applicant.details_viewed_at;
            const scoreDisplay = getScoreDisplay(applicant);
            const unreadCount = unreadCounts[applicant.id] || 0;
            const isDragging = draggedApplicantId === applicant.id;

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="p-2"
              >
                <Card 
                  draggable={!expandedApplicant}
                  onDragStart={(e) => {
                    if (expandedApplicant) {
                      e.preventDefault();
                      return;
                    }
                    onDragStart?.(applicant);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', applicant.id);
                  }}
                  onDragEnd={() => onDragEnd?.()}
                  className={`transition-all ${isDragging ? 'opacity-60 scale-[0.98] shadow-lg' : 'hover:shadow-md'}`}
                >
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      {/* Drag handle */}
                      <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/70 self-center">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStar(applicant.id);
                            }}
                            className={`p-0.5 rounded transition-colors ${
                              applicant.is_starred 
                                ? 'text-yellow-500 hover:text-yellow-600' 
                                : 'text-muted-foreground/30 hover:text-yellow-400'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${applicant.is_starred ? 'fill-current' : ''}`} />
                          </button>

                          <CopyableText text={applicant.full_name} className="font-semibold truncate hover:underline" />

                          {applicant.device_type && (
                            <span className={`flex-shrink-0 ${applicant.device_type === 'mobile' ? 'text-blue-500' : 'text-gray-500'}`}>
                              {applicant.device_type === 'mobile' ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                            </span>
                          )}

                          {isNew && (
                            <Badge className="bg-amber-500 text-white text-xs">NEW</Badge>
                          )}
                          
                          {scoreDisplay && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {scoreDisplay.label}: {scoreDisplay.score}/100
                            </Badge>
                          )}
                          
                          {applicant.job_source && (
                            <ApplicantSourceBadge source={applicant.job_source} />
                          )}
                          
                          {unreadCount > 0 && (
                            <Badge className="bg-blue-500 text-white text-xs">
                              {unreadCount} unread
                            </Badge>
                          )}
                          <ApplicationHistoryBadge email={applicant.email} currentId={applicant.id} phone={applicant.phone} />
                        </div>

                        {/* Info row */}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-1 flex-wrap">
                          <CopyableText text={applicant.email} className="flex items-center gap-1 hover:underline">
                            <Mail className="w-3 h-3" />
                            <span className="truncate max-w-[180px]">{applicant.email}</span>
                          </CopyableText>
                          
                          {applicant.phone && (
                            <CopyableText text={applicant.phone} className="flex items-center gap-1 hover:underline">
                              <Phone className="w-3 h-3" />
                              {applicant.phone}
                            </CopyableText>
                          )}
                          
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            <span className="truncate max-w-[120px]">{applicant.job_title}</span>
                          </span>
                          
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{applicant.location}</span>
                          </span>
                          
                          <span className="flex items-center gap-1 text-xs">
                            <Clock className="w-3 h-3" />
                            {formatDateShort(applicant.submitted_at)}
                          </span>
                        </div>

                        {/* Quick requirements */}
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          {[
                            { key: 'home_office', label: 'Home', value: applicant.home_office },
                            { key: 'laptop_or_pc', label: 'PC', value: applicant.laptop_or_pc },
                            { key: 'good_internet', label: 'Net', value: applicant.good_internet },
                            { key: 'us_timezone_ok', label: 'US TZ', value: applicant.us_timezone_ok },
                          ].map(({ key, label, value }) => (
                            <span key={key} className={`flex items-center gap-0.5 ${value ? 'text-green-600' : 'text-red-500'}`}>
                              {value ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Select
                          value={applicant.status}
                          onValueChange={(v) => handleUpdateStatus(applicant.id, v)}
                        >
                          <SelectTrigger className="w-[110px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {applicant.cv_file_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onPreviewCv(applicant.cv_file_url!, applicant.full_name, applicant.cv_text)}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 relative"
                          onClick={() => onViewHistory({ id: applicant.id, name: applicant.full_name, email: applicant.email })}
                        >
                          <History className="w-3.5 h-3.5" />
                          {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onViewDetails(applicant.id)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDelete(applicant.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}

        {!hasMore && applicants.length > 0 && (
          <div className="text-center py-3 text-xs text-muted-foreground">
            All {totalCount} applicants loaded
          </div>
        )}
      </div>
    </div>
  );
};
