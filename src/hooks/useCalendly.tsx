import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CalendlyUser {
  uri: string;
  name: string;
}

interface EventType {
  uri: string;
  name: string;
  scheduling_url: string;
  duration: number;
}

export function useCalendly() {
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<CalendlyUser | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = useCallback(() => {
    const accessToken = localStorage.getItem('calendly_access_token');
    const tokenExpiry = localStorage.getItem('calendly_token_expiry');
    const userUri = localStorage.getItem('calendly_user_uri');
    const userName = localStorage.getItem('calendly_user_name');

    if (accessToken && tokenExpiry && Number(tokenExpiry) > Date.now()) {
      setIsConnected(true);
      if (userUri && userName) {
        setUser({ uri: userUri, name: userName });
        fetchEventTypes(accessToken, userUri);
      }
    } else {
      setIsConnected(false);
      setUser(null);
    }
    setLoading(false);
  }, []);

  const fetchEventTypes = async (accessToken: string, userUri: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('calendly-auth', {
        body: { action: 'get-event-types', accessToken, userUri },
      });

      if (error) throw error;

      if (data?.collection) {
        setEventTypes(data.collection.map((et: any) => ({
          uri: et.uri,
          name: et.name,
          scheduling_url: et.scheduling_url,
          duration: et.duration,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch event types:', error);
    }
  };

  const connect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('calendly-auth', {
        body: { action: 'get-auth-url' },
      });

      if (error) throw error;

      // Redirect to Calendly authorization
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Failed to get auth URL:', error);
      throw error;
    }
  };

  const disconnect = () => {
    localStorage.removeItem('calendly_access_token');
    localStorage.removeItem('calendly_refresh_token');
    localStorage.removeItem('calendly_token_expiry');
    localStorage.removeItem('calendly_user_uri');
    localStorage.removeItem('calendly_user_name');
    setIsConnected(false);
    setUser(null);
    setEventTypes([]);
  };

  const createSchedulingLink = async (eventTypeUri: string) => {
    const accessToken = localStorage.getItem('calendly_access_token');
    if (!accessToken) throw new Error('Not connected to Calendly');

    try {
      const { data, error } = await supabase.functions.invoke('calendly-auth', {
        body: {
          action: 'create-scheduling-link',
          accessToken,
          eventTypeUri,
        },
      });

      if (error) throw error;

      return data.resource?.booking_url;
    } catch (error) {
      console.error('Failed to create scheduling link:', error);
      throw error;
    }
  };

  const getAccessToken = () => localStorage.getItem('calendly_access_token');

  return {
    isConnected,
    user,
    eventTypes,
    loading,
    connect,
    disconnect,
    createSchedulingLink,
    getAccessToken,
    checkConnection,
  };
}
