import { useEffect, useCallback, ReactNode } from 'react';
import { VirtualizedApplicantList } from './VirtualizedApplicantList';
import { usePaginatedApplicants, PaginatedApplicant } from '@/hooks/usePaginatedApplicants';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2 } from 'lucide-react';

interface PaginatedSearchResultsProps {
  searchTerm: string;
  sortBy: 'newest' | 'oldest' | 'score-desc' | 'score-asc' | 'starred';
  statuses?: string[];
  statusOptions: readonly string[];
  onUpdateStatus: (id: string, status: string) => void;
  onViewDetails: (id: string) => void;
  onNavigateToFolder?: (id: string, status: string) => void;
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
  enabled?: boolean;
  renderExpandedContent?: (applicant: PaginatedApplicant) => ReactNode;
}

export const PaginatedSearchResults = ({
  searchTerm,
  sortBy,
  statuses,
  statusOptions,
  onUpdateStatus,
  onViewDetails,
  onNavigateToFolder,
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
  loadingPreview,
  downloadingCv,
  rescoring,
  unreadCounts,
  enabled = true,
  renderExpandedContent,
}: PaginatedSearchResultsProps) => {
  const {
    applicants,
    loading,
    totalCount,
    hasMore,
    loadNextPage,
    updateApplicant,
  } = usePaginatedApplicants({
    searchTerm,
    sortBy,
    statuses,
    pageSize: 50,
    enabled,
  });

  // When status is updated, update local state
  const handleUpdateStatus = useCallback((id: string, status: string) => {
    updateApplicant(id, { status });
    onUpdateStatus(id, status);
  }, [updateApplicant, onUpdateStatus]);

  // When View/Collapse is clicked, expand inline in search results
  const handleViewDetails = useCallback((id: string) => {
    onViewDetails(id);
  }, [onViewDetails]);

  // When star is toggled, update local state
  const handleToggleStar = useCallback((id: string) => {
    const applicant = applicants.find(a => a.id === id);
    if (applicant) {
      updateApplicant(id, { is_starred: !applicant.is_starred });
    }
    onToggleStar(id);
  }, [applicants, updateApplicant, onToggleStar]);

  // Initial loading state
  if (loading && applicants.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Loading applicants...</p>
        </CardContent>
      </Card>
    );
  }

  // No results
  if (!loading && applicants.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No applicants found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? 'Try adjusting your search terms.' : 'No applicants in the system yet.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <VirtualizedApplicantList
      applicants={applicants}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadNextPage}
      statusOptions={statusOptions}
      onUpdateStatus={handleUpdateStatus}
      onViewDetails={handleViewDetails}
      onDelete={onDelete}
      onPreviewCv={onPreviewCv}
      onDownloadCv={onDownloadCv}
      onToggleStar={handleToggleStar}
      onSendEmail={onSendEmail}
      onViewHistory={onViewHistory}
      onSendInvite={onSendInvite}
      onRescoreCv={onRescoreCv}
      expandedApplicant={expandedApplicant}
      expandingApplicantId={expandingApplicantId}
      loadingPreview={loadingPreview}
      downloadingCv={downloadingCv}
      rescoring={rescoring}
      unreadCounts={unreadCounts}
      totalCount={totalCount}
      renderExpandedContent={renderExpandedContent}
    />
  );
};
