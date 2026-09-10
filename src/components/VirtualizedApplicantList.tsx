import React, { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Eye, Trash2, GripVertical, Loader2, FileText, Download, Mail, History, Send, Phone, MessageCircle, MapPin, Clock, Check, X, RefreshCw, Briefcase } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { ApplicantSourceBadge } from '@/components/ApplicantSourceBadge';
import { CopyableText } from '@/components/CopyableText';
import { ApplicationHistoryBadge } from '@/components/ApplicationHistoryBadge';
import type { PaginatedApplicant } from '@/hooks/usePaginatedApplicants';
import { formatDate } from "@/lib/dateFormat";

interface VirtualizedApplicantListProps {
  applicants: PaginatedApplicant[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  statusOptions: readonly string[];
  onUpdateStatus: (id: string, status: string) => void;
  onViewDetails: (id: string) => void;
  onDelete: (id: string) => void;
  onPreviewCv: (id: string, path: string, name: string, cvText: string | null) => void;
  onDownloadCv: (id: string, path: string, name: string) => void;
  onToggleStar: (id: string) => void;
  onSendEmail: (applicant: { id: string; full_name: string; email: string; job_title: string; status: string }) => void;
  onViewHistory: (applicant: { id: string; name: string; email: string }) => void;
  onSendInvite: (applicant: { full_name: string; email: string; job_title: string }) => void;
  onRescoreCv: (id: string) => void;
  expandedApplicant: string | null;
  expandingApplicantId: string | null;
  loadingPreview: boolean;
  downloadingCv: string | null;
  rescoring: string | null;
  unreadCounts: Record<string, number>;
  totalCount: number;
  renderExpandedContent?: (applicant: PaginatedApplicant) => React.ReactNode;
}

const ESTIMATED_ROW_HEIGHT = 180; // Base height for collapsed cards
const EXPANDED_ROW_HEIGHT = 600; // Approximate height for expanded cards

export const VirtualizedApplicantList = ({
  applicants,
  loading,
  hasMore,
  onLoadMore,
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
  onRescoreCv,
  expandedApplicant,
  expandingApplicantId,
  renderExpandedContent,
  loadingPreview,
  downloadingCv,
  rescoring,
  unreadCounts,
  totalCount,
}: VirtualizedApplicantListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate row height dynamically based on expansion state
  const getRowHeight = useCallback((index: number) => {
    const applicant = applicants[index];
    if (!applicant) return ESTIMATED_ROW_HEIGHT;
    return expandedApplicant === applicant.id ? EXPANDED_ROW_HEIGHT : ESTIMATED_ROW_HEIGHT;
  }, [applicants, expandedApplicant]);

  const virtualizer = useVirtualizer({
    count: applicants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => applicants[index]?.id || index.toString(),
    overscan: 5, // Render 5 extra items above and below
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Load more when scrolling near the bottom
  useEffect(() => {
    const [lastItem] = [...virtualizer.getVirtualItems()].reverse();
    if (!lastItem) return;
    
    if (lastItem.index >= applicants.length - 5 && hasMore && !loading) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), applicants.length, hasMore, loading, onLoadMore]);

  // Re-measure when expanded applicant changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedApplicant, virtualizer]);

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

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-2">
      {/* Header showing loaded count */}
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

      {/* Virtualized list container */}
      <div
        ref={parentRef}
        className="h-[calc(100vh-320px)] overflow-auto rounded-lg border"
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

            const isExpanded = expandedApplicant === applicant.id;
            const isExpanding = expandingApplicantId === applicant.id;
            const isNew = applicant.status === 'For Review' && !applicant.details_viewed_at;
            const scoreDisplay = getScoreDisplay(applicant);
            const unreadCount = unreadCounts[applicant.id] || 0;

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
                <Card className={`transition-shadow ${isExpanded ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      {/* Drag handle */}
                      <div className="flex-shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground/70 self-center">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {/* Star */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStar(applicant.id);
                            }}
                            className={`p-0.5 rounded transition-colors ${
                              applicant.is_starred 
                                ? 'text-yellow-500 hover:text-yellow-600' 
                                : 'text-muted-foreground/30 hover:text-yellow-400'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${applicant.is_starred ? 'fill-current' : ''}`} />
                          </button>

                          {/* Name */}
                          <h4 className="font-semibold truncate">{applicant.full_name}</h4>

                          {/* Badges */}
                          {isNew && (
                            <Badge className="bg-amber-500 text-white text-xs">NEW</Badge>
                          )}
                          {scoreDisplay ? (
                            <Badge className={`${getScoreColor(scoreDisplay.score)} text-white text-xs`}>
                              {scoreDisplay.label}: {scoreDisplay.score}
                            </Badge>
                          ) : applicant.cv_file_url ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-5 px-2 text-xs gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRescoreCv(applicant.id);
                                    }}
                                    disabled={rescoring === applicant.id}
                                  >
                                    {rescoring === applicant.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3 h-3" />
                                    )}
                                    Score
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>CV needs scoring. Click to process.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
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

                        {/* Job title */}
                        <div className="flex items-center gap-1 text-xs text-foreground mb-1">
                          <Briefcase className="w-3 h-3" />
                          <span className="truncate max-w-[300px] font-bold">{applicant.job_title}</span>
                        </div>

                        {/* Info row */}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                          <CopyableText text={applicant.email} className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span className="truncate max-w-[200px]">{applicant.email}</span>
                          </CopyableText>
                          {applicant.phone && (
                            <CopyableText text={applicant.phone} className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{applicant.phone}</span>
                            </CopyableText>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[150px]">{applicant.location}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(applicant.submitted_at)}
                          </span>
                        </div>

                        {/* Quick requirements */}
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          {[
                            { key: 'home_office', label: 'Home Office', value: applicant.home_office },
                            { key: 'laptop_or_pc', label: 'Laptop/PC', value: applicant.laptop_or_pc },
                            { key: 'good_internet', label: 'Good Internet', value: applicant.good_internet },
                            { key: 'us_timezone_ok', label: 'US Timezone', value: applicant.us_timezone_ok },
                          ].map(({ key, label, value }) => (
                            <span key={key} className={`flex items-center gap-0.5 ${value ? 'text-green-600' : 'text-red-500'}`}>
                              {value ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Status dropdown */}
                        <Select
                          value={applicant.status}
                          onValueChange={(v) => onUpdateStatus(applicant.id, v)}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((status) => (
                              <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-1">
                          {applicant.cv_file_url && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onPreviewCv(applicant.id, applicant.cv_file_url!, applicant.full_name, applicant.cv_text)}
                                disabled={loadingPreview}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onDownloadCv(applicant.id, applicant.cv_file_url!, applicant.full_name)}
                                disabled={downloadingCv === applicant.id}
                              >
                                {downloadingCv === applicant.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                              </Button>
                            </>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onSendEmail({ 
                              id: applicant.id, 
                              full_name: applicant.full_name, 
                              email: applicant.email,
                              job_title: applicant.job_title,
                              status: applicant.status
                            })}
                          >
                            <Mail className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 relative"
                            onClick={() => onViewHistory({ id: applicant.id, name: applicant.full_name, email: applicant.email })}
                          >
                            <History className="w-4 h-4" />
                            {unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onSendInvite({ 
                              full_name: applicant.full_name, 
                              email: applicant.email,
                              job_title: applicant.job_title
                            })}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* View/Expand button */}
                        <Button
                          variant={isExpanded ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => onViewDetails(applicant.id)}
                          disabled={isExpanding}
                        >
                          {isExpanding ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-1" />
                              {isExpanded ? 'Collapse' : 'View'}
                            </>
                          )}
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onDelete(applicant.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanding skeleton */}
                    {isExpanding && (
                      <div className="mt-4 pt-4 border-t animate-pulse">
                        <div className="flex items-center gap-2 mb-4">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          <span className="text-sm">Loading applicant details...</span>
                        </div>
                        <div className="space-y-4">
                          <Skeleton className="h-10 w-full" />
                          <div className="grid grid-cols-4 gap-4">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                          </div>
                        </div>
                      </div>
                    )}

                    {isExpanded && !isExpanding && (
                      <div className="mt-4 pt-4 border-t">
                        {renderExpandedContent ? (
                          renderExpandedContent(applicant)
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            <p className="text-center py-8">
                              Detailed view is rendered in parent component for full functionality
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Loading indicator at bottom */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {/* End of list message */}
        {!hasMore && applicants.length > 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            All {totalCount} applicants loaded
          </div>
        )}
      </div>
    </div>
  );
};
