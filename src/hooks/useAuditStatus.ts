'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DevWrappedStats } from '@/types/github';

export type AuditStatus = 'IDLE' | 'ENQUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface StatusPayload {
  status?: string;
  message?: string;
  data?: unknown;
}

// Adaptive polling: fast checks while the job is likely young, progressively
// slower once it drags on, and a hard ceiling so a wedged job can never pin a
// browser to an endless poll loop.
const INITIAL_POLL_MS = 800;
const MAX_POLL_MS = 5000;
const POLL_BACKOFF_FACTOR = 1.5;
const AUDIT_TIMEOUT_MS = 90_000;

export function useAuditStatus() {
  const [status, setStatus] = useState<AuditStatus>('IDLE');
  const [data, setData] = useState<DevWrappedStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [completedUsername, setCompletedUsername] = useState<string | null>(null);
  const submissionControllerRef = useRef<AbortController | null>(null);

  const startAudit = useCallback(async (username: string) => {
    const handle = username.trim().toLowerCase();
    if (!handle) return;

    submissionControllerRef.current?.abort();
    const controller = new AbortController();
    submissionControllerRef.current = controller;

    setActiveUsername(handle);
    setCompletedUsername(null);
    setStatus('ENQUEUED');
    setError(null);
    setData(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: handle }),
        signal: controller.signal,
      });

      const initData = await res.json();

      if (!res.ok && res.status !== 202) {
        throw new Error(initData.error || initData.message || 'Failed to initialize audit');
      }

      if (submissionControllerRef.current === controller) {
        setStatus('PROCESSING');
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || submissionControllerRef.current !== controller) {
        return;
      }
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
    const controller = new AbortController();
    const deadline = Date.now() + AUDIT_TIMEOUT_MS;

    const stopPolling = () => {
      isSubscribed = false;
      controller.abort();
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

    const checkStatus = async (intervalMs: number) => {
      try {
        const res = await fetch(`/api/audit/status/${activeUsername}`, {
          signal: controller.signal,
        });

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
          setCompletedUsername(activeUsername);
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

        // Hard ceiling: no successful poll within the window means the job is
        // wedged (or the worker died). Give up instead of polling forever.
        if (Date.now() >= deadline) {
          fail('Audit timed out. The worker may be down — try again shortly.');
          return;
        }

        // Still ENQUEUED/PROCESSING — back off before the next poll so long
        // audits don't spam the status endpoint, rescheduling only while
        // subscribed.
        if (isSubscribed) {
          const nextInterval = Math.min(
            Math.round(intervalMs * POLL_BACKOFF_FACTOR),
            MAX_POLL_MS,
          );
          pollTimer = setTimeout(() => checkStatus(nextInterval), intervalMs);
        }
      } catch (err) {
        if (isSubscribed && !(err instanceof DOMException && err.name === 'AbortError')) {
          fail('Polling connection error');
        }
      }
    };

    pollTimer = setTimeout(() => checkStatus(INITIAL_POLL_MS), INITIAL_POLL_MS);

    // Handle switch or unmount: kill the pending timer before it can reschedule
    return () => {
      stopPolling();
    };
  }, [activeUsername, status]);

  return { status, data, error, startAudit, completedUsername };
}
