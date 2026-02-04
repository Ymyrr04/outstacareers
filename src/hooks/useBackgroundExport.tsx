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

const STORAGE_KEY = 'pendingExportJobId';

export function useBackgroundExport() {
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true); // Track if we're restoring from localStorage
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredRef = useRef(false); // Prevent double restore

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
    if (exportJob?.id && (exportJob.status === 'processing' || exportJob.status === 'pending')) {
      localStorage.setItem(STORAGE_KEY, exportJob.id);
    } else if (exportJob?.status === 'completed' || exportJob?.status === 'failed') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [exportJob]);

  // Restore pending export on mount - runs once
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const pendingJobId = localStorage.getItem(STORAGE_KEY);
    if (pendingJobId) {
      console.log('Restoring export job from localStorage:', pendingJobId);
      
      // Set a placeholder export job immediately so UI shows loading state
      setExportJob({
        id: pendingJobId,
        status: 'processing',
        total_items: 0,
        processed_items: 0,
        file_url: null,
        error_message: null
      });
      
      // Fetch actual status from database
      checkStatus(pendingJobId)
        .then((job) => {
          console.log('Restored export job status:', job);
          if (job.status === 'processing' || job.status === 'pending') {
            setIsPolling(true);
          }
        })
        .catch((err) => {
          console.error('Failed to restore export job:', err);
          localStorage.removeItem(STORAGE_KEY);
          setExportJob(null);
        })
        .finally(() => {
          setIsRestoring(false);
        });
    } else {
      setIsRestoring(false);
    }
  }, [checkStatus]);

  return {
    exportJob,
    isExporting: exportJob?.status === 'processing' || exportJob?.status === 'pending',
    isCompleted: exportJob?.status === 'completed',
    isFailed: exportJob?.status === 'failed',
    isRestoring, // New: indicates if we're loading from storage
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
