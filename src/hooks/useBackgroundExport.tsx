import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ExportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_items: number;
  processed_items: number;
  file_url: string | null;
  error_message: string | null;
}

export function useBackgroundExport() {
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startExport = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('export-applicants', {
        body: { action: 'start' },
      });

      if (response.error) throw response.error;

      const { jobId } = response.data;
      setExportJob({ 
        id: jobId, 
        status: 'processing', 
        total_items: 0, 
        processed_items: 0, 
        file_url: null,
        error_message: null 
      });
      setIsPolling(true);

      return jobId;
    } catch (error) {
      console.error('Failed to start export:', error);
      throw error;
    }
  }, []);

  const checkStatus = useCallback(async (jobId: string) => {
    try {
      const response = await supabase.functions.invoke('export-applicants', {
        body: { action: 'status', jobId },
      });

      if (response.error) throw response.error;
      
      const job = response.data as ExportJob;
      setExportJob(job);

      if (job.status === 'completed' || job.status === 'failed') {
        setIsPolling(false);
      }

      return job;
    } catch (error) {
      console.error('Failed to check export status:', error);
      throw error;
    }
  }, []);

  const downloadExport = useCallback(async (jobId: string) => {
    try {
      const response = await supabase.functions.invoke('export-applicants', {
        body: { action: 'download', jobId },
      });

      if (response.error) throw response.error;

      const { url } = response.data;
      if (url) {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Failed to download export:', error);
      throw error;
    }
  }, []);

  const clearExport = useCallback(() => {
    setExportJob(null);
    setIsPolling(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Poll for status updates
  useEffect(() => {
    if (isPolling && exportJob?.id) {
      pollIntervalRef.current = setInterval(() => {
        checkStatus(exportJob.id);
      }, 2000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [isPolling, exportJob?.id, checkStatus]);

  // Persist export job ID in localStorage to survive refresh
  useEffect(() => {
    if (exportJob?.id && exportJob.status === 'processing') {
      localStorage.setItem('pendingExportJobId', exportJob.id);
    } else if (exportJob?.status === 'completed' || exportJob?.status === 'failed') {
      localStorage.removeItem('pendingExportJobId');
    }
  }, [exportJob]);

  // Check for pending export on mount
  useEffect(() => {
    const pendingJobId = localStorage.getItem('pendingExportJobId');
    if (pendingJobId) {
      setIsPolling(true);
      checkStatus(pendingJobId).catch(() => {
        localStorage.removeItem('pendingExportJobId');
        setIsPolling(false);
      });
    }
  }, [checkStatus]);

  return {
    exportJob,
    isExporting: exportJob?.status === 'processing' || exportJob?.status === 'pending',
    isCompleted: exportJob?.status === 'completed',
    isFailed: exportJob?.status === 'failed',
    progress: exportJob ? {
      processed: exportJob.processed_items,
      total: exportJob.total_items,
      percentage: exportJob.total_items > 0 
        ? Math.round((exportJob.processed_items / exportJob.total_items) * 100) 
        : 0
    } : null,
    startExport,
    downloadExport,
    clearExport,
  };
}
