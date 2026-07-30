import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseBooleanSearch, applyBooleanFilter } from '@/lib/booleanSearchParser';

interface InterviewSession {
  id: string;
  status: string;
  experience_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  situational_score: number | null;
  personality_score: number | null;
  overall_score: number | null;
  ai_summary: string | null;
  ai_strengths: string[] | null;
  ai_concerns: string[] | null;
  completed_at: string | null;
}

interface ToolMatch {
  tool: string;
  found: boolean;
  context?: string;
}

interface ExperienceHighlight {
  role: string;
  company?: string;
  duration?: string;
  relevance: string;
}

interface RecommendedRole {
  role: string;
  fit_score: number;
  reason?: string;
}

interface AssessmentDetails {
  matched_tools: ToolMatch[];
  missing_tools: string[];
  experience_highlights: ExperienceHighlight[];
  strengths: string[];
  concerns: string[];
  recommended_roles?: RecommendedRole[];
}

export interface PaginatedApplicant {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  home_office: boolean;
  noise_canceling_headset: boolean;
  laptop_or_pc: boolean;
  good_internet: boolean;
  internet_speed: string;
  power_backup: boolean;
  can_work_40_50: boolean;
  us_timezone_ok: boolean;
  start_availability: string;
  has_experience: boolean;
  currently_working: boolean;
  location: string;
  job_title: string;
  job_id: string | null;
  apply_url: string;
  status: string;
  submitted_at: string;
  notes: string | null;
  role_experience_score: number | null;
  skills_tools_score: number | null;
  availability_setup_score: number | null;
  bonus_red_flag_score: number | null;
  total_score: number | null;
  ranking_status: string | null;
  ai_summary: string | null;
  cv_file_url: string | null;
  cv_text: string | null;
  vocaroo_link: string | null;
  voice_recording_url: string | null;
  ai_assessment_details: AssessmentDetails | null;
  extracted_skills: string[] | null;
  extracted_tools: string[] | null;
  years_of_experience: number | null;
  interview_session: InterviewSession | null;
  job_source: string | null;
  is_available: boolean | null;
  availability_checked_at: string | null;
  original_job_id: string | null;
  original_job_title: string | null;
  reprofiled_at: string | null;
  candidate_profile: string | null;
  details_viewed_at: string | null;
  is_starred: boolean;
  device_type: string | null;
}

interface UsePaginatedApplicantsOptions {
  pageSize?: number;
  status?: string;
  statuses?: string[];
  searchTerm?: string;
  sortBy?: 'newest' | 'oldest' | 'score-desc' | 'score-asc' | 'starred';
  enabled?: boolean;
}

export const usePaginatedApplicants = (options: UsePaginatedApplicantsOptions = {}) => {
  const { pageSize = 50, status, statuses, searchTerm, sortBy = 'newest', enabled = true } = options;
  const { toast } = useToast();
  
  const [applicants, setApplicants] = useState<PaginatedApplicant[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  // Cache interview sessions to avoid refetching
  const interviewSessionsCache = useRef<Record<string, InterviewSession>>({});

  const fetchPage = useCallback(async (page: number, append = false) => {
    if (!enabled) return;
    
    setLoading(true);
    
    try {
      // Build query
      let query = supabase
        .from('applicants_prescreen')
        .select('*', { count: 'exact' });
      
      // Filter by status if provided
      if (status) {
        query = query.eq('status', status);
      } else if (statuses && statuses.length > 0) {
        query = query.in('status', statuses);
      }
      
      // Apply search filter with Boolean operator support
      if (searchTerm && searchTerm.trim()) {
        const parsed = parseBooleanSearch(searchTerm.trim());
        query = applyBooleanFilter(query, parsed);
      }
      
      // Apply sorting
      if (sortBy === 'score-desc') {
        query = query.order('total_score', { ascending: false, nullsFirst: false });
      } else if (sortBy === 'score-asc') {
        query = query.order('total_score', { ascending: true, nullsFirst: true });
      } else if (sortBy === 'starred') {
        query = query.order('is_starred', { ascending: false, nullsFirst: false })
                     .order('total_score', { ascending: false, nullsFirst: false });
      } else if (sortBy === 'oldest') {
        query = query.order('submitted_at', { ascending: true });
      } else {
        // Default: newest first
        query = query.order('submitted_at', { ascending: false });
      }
      
      // Add pagination
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);
      
      const { data: applicantsData, error: applicantsError, count } = await query;

      if (applicantsError) {
        toast({
          title: 'Error',
          description: 'Failed to fetch applicants',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Set total count from the first fetch
      if (count !== null) {
        setTotalCount(count);
        setHasMore((page + 1) * pageSize < count);
      }

      // Fetch interview sessions for this batch
      const applicantIds = (applicantsData || []).map(a => a.id);
      
      if (applicantIds.length > 0) {
        // Only fetch sessions we don't have cached
        const uncachedIds = applicantIds.filter(id => !interviewSessionsCache.current[id]);
        
        if (uncachedIds.length > 0) {
          // Chunk IDs into batches of 100 to avoid URL length limits
          const CHUNK_SIZE = 100;
          const chunks: string[][] = [];
          for (let i = 0; i < uncachedIds.length; i += CHUNK_SIZE) {
            chunks.push(uncachedIds.slice(i, i + CHUNK_SIZE));
          }
          
          // Fetch sessions for all chunks in parallel
          const sessionPromises = chunks.map(chunk =>
            supabase
              .from('interview_sessions')
              .select('*')
              .in('applicant_id', chunk)
              .order('completed_at', { ascending: false, nullsFirst: false })
          );
          
          const results = await Promise.all(sessionPromises);
          
          // Group sessions by applicant_id, prioritizing completed sessions
          const sessionsByApplicant: Record<string, any> = {};
          
          results.forEach(({ data: sessionsData }) => {
            if (sessionsData) {
              sessionsData.forEach(session => {
                const existing = sessionsByApplicant[session.applicant_id];
                // Prefer completed sessions over in-progress ones
                if (!existing || 
                    (session.status === 'completed' && existing.status !== 'completed') ||
                    (session.status === 'completed_manual_review' && existing.status === 'in_progress')) {
                  sessionsByApplicant[session.applicant_id] = session;
                }
              });
            }
          });
          
          Object.values(sessionsByApplicant).forEach(session => {
            interviewSessionsCache.current[session.applicant_id] = {
              id: session.id,
              status: session.status,
              experience_score: session.experience_score,
              technical_score: session.technical_score,
              communication_score: session.communication_score,
              situational_score: session.situational_score,
              personality_score: session.personality_score,
              overall_score: session.overall_score,
              ai_summary: session.ai_summary,
              ai_strengths: session.ai_strengths,
              ai_concerns: session.ai_concerns,
              completed_at: session.completed_at
            };
          });
        }
      }

      // Combine applicants with their interview sessions
      const applicantsWithInterviews = (applicantsData || []).map(item => ({
        ...item,
        ai_assessment_details: item.ai_assessment_details as unknown as AssessmentDetails | null,
        interview_session: interviewSessionsCache.current[item.id] || null
      }));
      
      if (append) {
        setApplicants(prev => [...prev, ...applicantsWithInterviews]);
      } else {
        setApplicants(applicantsWithInterviews);
      }
      
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching applicants:', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, pageSize, status, statuses, searchTerm, sortBy, toast]);

  // Reset when filters change
  useEffect(() => {
    if (enabled) {
      interviewSessionsCache.current = {};
      setApplicants([]);
      setCurrentPage(0);
      setHasMore(true);
      fetchPage(0);
    }
  }, [enabled, status, statuses, searchTerm, sortBy]);

  // Load next page
  const loadNextPage = useCallback(() => {
    if (!loading && hasMore) {
      fetchPage(currentPage + 1, true);
    }
  }, [loading, hasMore, currentPage, fetchPage]);

  // Reset and refetch
  const refetch = useCallback(() => {
    interviewSessionsCache.current = {};
    setApplicants([]);
    setCurrentPage(0);
    setHasMore(true);
    fetchPage(0);
  }, [fetchPage]);

  // Update a single applicant in the list
  const updateApplicant = useCallback((id: string, updates: Partial<PaginatedApplicant>) => {
    setApplicants(prev => prev.map(a => 
      a.id === id ? { ...a, ...updates } : a
    ));
  }, []);

  // Remove applicant from list
  const removeApplicant = useCallback((id: string) => {
    setApplicants(prev => prev.filter(a => a.id !== id));
    setTotalCount(prev => prev - 1);
  }, []);

  return {
    applicants,
    loading,
    totalCount,
    currentPage,
    hasMore,
    loadNextPage,
    refetch,
    updateApplicant,
    removeApplicant,
    pageSize,
  };
};
