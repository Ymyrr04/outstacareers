import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generate a simple session ID for tracking
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

// Simple hash function for privacy
const hashString = async (str: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

export const useAnalytics = () => {
  const hasTrackedPageView = useRef(false);

  const trackEvent = useCallback(async (
    eventType: 'page_view' | 'job_view' | 'apply_click',
    jobId?: string
  ) => {
    try {
      const sessionId = getSessionId();
      const userAgent = navigator.userAgent;
      const pagePath = window.location.pathname;
      const referrer = document.referrer || null;
      
      // Create a pseudo IP hash from user agent and session for uniqueness
      const ipHash = await hashString(userAgent + sessionId);

      await supabase.from('analytics_events').insert({
        event_type: eventType,
        job_id: jobId || null,
        page_path: pagePath,
        referrer: referrer,
        user_agent: userAgent,
        ip_hash: ipHash,
        session_id: sessionId,
      });
    } catch (error) {
      console.error('Analytics tracking error:', error);
    }
  }, []);

  const trackPageView = useCallback(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackEvent('page_view');
    }
  }, [trackEvent]);

  const trackJobView = useCallback((jobId: string) => {
    trackEvent('job_view', jobId);
  }, [trackEvent]);

  const trackApplyClick = useCallback((jobId: string) => {
    trackEvent('apply_click', jobId);
  }, [trackEvent]);

  return {
    trackPageView,
    trackJobView,
    trackApplyClick,
  };
};

// Hook for automatic page view tracking
export const usePageViewTracking = () => {
  const { trackPageView } = useAnalytics();

  useEffect(() => {
    trackPageView();
  }, [trackPageView]);
};
