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
const BATCH_INTERVAL = 1500; // Process batches every 1.5 seconds

export function useBackgroundExport() {
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const batchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredRef = useRef(false);
  const isProcessingBatchRef = useRef(false);

  const processBatch = useCallback(async (jobId: string) => {
    if (isProcessingBatchRef.current) return;
    isProcessingBatchRef.current = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session for batch processing');
        isProcessingBatchRef.current = false;
        return;
      }

      const response = await supabase.functions.invoke('export-applicants', {
        body: { action: 'process-batch', jobId },
      });

      if (response.error) {
        console.error('Batch processing error:', response.error);
        isProcessingBatchRef.current = false;
        return;
      }

      const result = response.data;
      
      if (result.status === 'completed') {
        setExportJob(prev => prev ? {
          ...prev,
          status: 'completed',
          processed_items: prev.total_items
        } : null);
        setIsPolling(false);
        // Stop batch processing
        if (batchIntervalRef.current) {
          clearInterval(batchIntervalRef.current);
          batchIntervalRef.current = null;
        }
      } else if (result.status === 'failed') {
        setExportJob(prev => prev ? {
          ...prev,
          status: 'failed',
          error_message: result.error
        } : null);
        setIsPolling(false);
        if (batchIntervalRef.current) {
          clearInterval(batchIntervalRef.current);
          batchIntervalRef.current = null;
        }
      } else if (result.continue) {
        // Update progress
        setExportJob(prev => prev ? {
          ...prev,
          processed_items: result.processed_items,
          total_items: result.total_items
        } : null);
      }
    } catch (error) {
      console.error('Failed to process batch:', error);
    } finally {
      isProcessingBatchRef.current = false;
    }
  }, []);

  const startExport = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('export-applicants', {
        body: { action: 'start' },
      });

      if (response.error) throw response.error;

      const { jobId, totalItems } = response.data;
      
      setExportJob({ 
        id: jobId, 
        status: 'processing', 
        total_items: totalItems || 0, 
        processed_items: 0, 
        file_url: null,
        error_message: null 
      });
      setIsPolling(true);

      // Start batch processing
      batchIntervalRef.current = setInterval(() => {
        processBatch(jobId);
      }, BATCH_INTERVAL);

      // Process first batch immediately
      processBatch(jobId);

      return jobId;
    } catch (error) {
      console.error('Failed to start export:', error);
      throw error;
    }
  }, [processBatch]);

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
        if (batchIntervalRef.current) {
          clearInterval(batchIntervalRef.current);
          batchIntervalRef.current = null;
        }
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
    if (batchIntervalRef.current) {
      clearInterval(batchIntervalRef.current);
      batchIntervalRef.current = null;
    }
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Poll for status updates (backup, in case batch processing is being done by another tab)
  useEffect(() => {
    if (isPolling && exportJob?.id) {
      pollIntervalRef.current = setInterval(() => {
        checkStatus(exportJob.id);
      }, 3000);

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

  // Restore pending export on mount and resume batch processing
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
          
          // If job failed or completed, clear it and show appropriate state
          if (job.status === 'failed') {
            console.log('Export job was failed, clearing...');
            localStorage.removeItem(STORAGE_KEY);
            setExportJob(prev => prev ? { ...prev, status: 'failed', error_message: job.error_message } : null);
            setIsRestoring(false);
            return;
          }
          
          if (job.status === 'completed') {
            console.log('Export job was completed');
            setIsRestoring(false);
            return;
          }
          
          // Job is still processing, resume
          setIsPolling(true);
          // Resume batch processing
          batchIntervalRef.current = setInterval(() => {
            processBatch(pendingJobId);
          }, BATCH_INTERVAL);
          // Process first batch immediately
          processBatch(pendingJobId);
          setIsRestoring(false);
        })
        .catch((err) => {
          console.error('Failed to restore export job:', err);
          localStorage.removeItem(STORAGE_KEY);
          setExportJob(null);
          setIsRestoring(false);
        });
    } else {
      setIsRestoring(false);
    }
  }, [checkStatus, processBatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (batchIntervalRef.current) {
        clearInterval(batchIntervalRef.current);
      }
    };
  }, []);

  return {
    exportJob,
    isExporting: exportJob?.status === 'processing' || exportJob?.status === 'pending',
    isCompleted: exportJob?.status === 'completed',
    isFailed: exportJob?.status === 'failed',
    isRestoring,
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
