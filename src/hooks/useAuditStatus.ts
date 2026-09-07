'use client';

import { useState, useEffect, useCallback } from 'react';
import { DevWrappedStats } from '@/types/github';

export type AuditStatus = 'IDLE' | 'ENQUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface StatusPayload {
  status?: string;
  message?: string;
  data?: unknown;
}

export function useAuditStatus() {
  const [status, setStatus] = useState<AuditStatus>('IDLE');
  const [data, setData] = useState<DevWrappedStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);

  const startAudit = useCallback(async (username: string) => {
    const handle = username.trim().toLowerCase();
    if (!handle) return;

    setActiveUsername(handle);
    setStatus('ENQUEUED');
    setError(null);
    setData(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: handle }),
      });

      const initData = await res.json();

      if (!res.ok && res.status !== 202) {
        throw new Error(initData.error || initData.message || 'Failed to initialize audit');
      }

      setStatus('PROCESSING');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error submitting audit job';
      setStatus('FAILED');
      setError(message);
      setActiveUsername(null);
    }
  }, []);

  useEffect(() => {
    if (!activeUsername || (status !== 'PROCESSING' && status !== 'ENQUEUED')) {
      return;
    }

    let isSubscribed = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = () => {
      isSubscribed = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    const fail = (message: string) => {
      stopPolling();
      setError(message);
      setStatus('FAILED');
      setActiveUsername(null); // Reset state so the effect unbinds cleanly
    };

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/audit/status/${activeUsername}`);

        // Guard against non-JSON bodies (e.g. HTML 502 pages from a proxy)
        let statusPayload: StatusPayload;
        try {
          statusPayload = await res.json();
        } catch {
          statusPayload = { status: 'ERROR', message: 'Malformed status response' };
        }

        if (!isSubscribed) return;

        if (statusPayload.status === 'COMPLETED') {
          stopPolling();
          setData((statusPayload.data as DevWrappedStats) ?? null);
          setStatus('COMPLETED');
          setActiveUsername(null); // Terminal: stop further polling
          return;
        }

        // Terminal failure: explicit FAILED from the worker OR any HTTP error
        // (404 NOT_FOUND for unknown handles, 500 ERROR, etc.). Never reschedule.
        if (statusPayload.status === 'FAILED' || !res.ok) {
          fail(statusPayload.message || 'GitHub user not found or audit failed');
          return;
        }

        // Still ENQUEUED/PROCESSING — schedule the next poll only while subscribed
        if (isSubscribed) {
          pollTimer = setTimeout(checkStatus, 1200);
        }
      } catch {
        if (isSubscribed) {
          fail('Polling connection error');
        }
      }
    };

    pollTimer = setTimeout(checkStatus, 800);

    // Handle switch or unmount: kill the pending timer before it can reschedule
    return () => {
      stopPolling();
    };
  }, [activeUsername, status]);

  return { status, data, error, startAudit };
}
