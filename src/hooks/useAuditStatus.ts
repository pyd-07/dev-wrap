'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DevWrappedStats } from '@/types/github';
import type { AuditStatusResponse, AuditSubmitResponse } from '@/types/audit';

export type AuditStatus =
  | 'IDLE'
  | 'ENQUEUED'
  | 'PROCESSING'
  | 'REFRESHING'
  | 'COMPLETED'
  | 'FAILED';

interface StartAuditOptions {
  /**
   * Requests a new audit even when a cached report exists. Without it the
   * submission is a plain "view" request: a cache hit resolves immediately
   * with the cached report and no polling.
   */
  refresh?: boolean;
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

  const startAudit = useCallback(
    async (username: string, options?: StartAuditOptions) => {
      const handle = username.trim().toLowerCase();
      if (!handle) return;

      const refresh = options?.refresh === true;

      submissionControllerRef.current?.abort();
      const controller = new AbortController();
      submissionControllerRef.current = controller;

      setActiveUsername(handle);
      setCompletedUsername(null);
      setStatus(refresh ? 'REFRESHING' : 'ENQUEUED');
      setError(null);
      // An explicit refresh keeps the current report on screen; a new handle
      // starts from a clean slate.
      if (!refresh) {
        setData(null);
      }

      try {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: handle, refresh }),
          signal: controller.signal,
        });

        const initData = (await res.json()) as AuditSubmitResponse & {
          error?: string;
        };

        if (!res.ok && res.status !== 202) {
          throw new Error(
            initData.message || initData.error || 'Failed to initialize audit',
          );
        }

        if (submissionControllerRef.current !== controller) {
          return;
        }

        // Cache hit: the report was already available, so there is nothing to
        // poll for. Resolve immediately so callers can render or navigate.
        if (initData.status === 'COMPLETED' && initData.data) {
          setData(initData.data);
          setCompletedUsername(handle);
          setStatus('COMPLETED');
          setActiveUsername(null);
          return;
        }

        // Explicit refresh (or an audit that was already running): keep the
        // cached report visible and follow the audit through to completion.
        if (initData.status === 'REFRESHING') {
          if (initData.data) {
            setData(initData.data);
          }
          setStatus('REFRESHING');
          return;
        }

        setStatus('PROCESSING');
      } catch (err: unknown) {
        if (controller.signal.aborted || submissionControllerRef.current !== controller) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Error submitting audit job';
        setStatus('FAILED');
        setError(message);
        setActiveUsername(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      !activeUsername ||
      (status !== 'PROCESSING' &&
        status !== 'ENQUEUED' &&
        status !== 'REFRESHING')
    ) {
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
        let statusPayload: AuditStatusResponse;
        try {
          statusPayload = (await res.json()) as AuditStatusResponse;
        } catch {
          statusPayload = { status: 'ERROR', message: 'Malformed status response' };
        }

        if (!isSubscribed) return;

        if (statusPayload.status === 'COMPLETED') {
          stopPolling();
          setData(statusPayload.data ?? null);
          setCompletedUsername(activeUsername);
          setStatus('COMPLETED');
          setActiveUsername(null); // Terminal: stop further polling
          return;
        }

        // Terminal failure: explicit FAILED from the worker OR any HTTP error
        // (404 NOT_FOUND for unknown handles, 500 ERROR, etc.). Never reschedule.
        // A failed refresh may still carry the last completed report; keep it on
        // screen instead of discarding it.
        if (statusPayload.status === 'FAILED' || !res.ok) {
          if (statusPayload.data) {
            setData(statusPayload.data);
          }
          fail(statusPayload.message || 'GitHub user not found or audit failed');
          return;
        }

        // Non-terminal in-progress states. A REFRESHING response also carries
        // the previous report, which stays visible until the new audit lands.
        if (statusPayload.status === 'REFRESHING') {
          if (statusPayload.data) {
            setData(statusPayload.data);
          }
          setStatus('REFRESHING');
        } else if (statusPayload.status === 'PROCESSING') {
          setStatus('PROCESSING');
        }

        // Hard ceiling: no successful poll within the window means the job is
        // wedged (or the worker died). Give up instead of polling forever.
        if (Date.now() >= deadline) {
          fail('Audit timed out. The worker may be down — try again shortly.');
          return;
        }

        // Still ENQUEUED/PROCESSING/REFRESHING — back off before the next poll
        // so long audits don't spam the status endpoint, rescheduling only
        // while subscribed.
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

  return {
    status,
    data,
    error,
    startAudit,
    activeUsername,
    completedUsername,
  };
}
