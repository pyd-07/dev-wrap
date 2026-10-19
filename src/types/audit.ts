import type { DevWrappedStats } from "./github";

/**
 * Server-reported audit states. `REFRESHING` means a newer audit is running
 * while a previously completed report is still available.
 */
export type AuditServerStatus =
  | "PROCESSING"
  | "REFRESHING"
  | "COMPLETED"
  | "FAILED"
  | "NOT_FOUND"
  | "ERROR";

export interface AuditStatusResponse {
  status: AuditServerStatus;
  message?: string;
  /**
   * The last successfully completed report. Present on `COMPLETED`, on
   * `REFRESHING`, and on `FAILED` when a previous report can be preserved.
   */
  data?: DevWrappedStats | null;
}

/**
 * Response of `POST /api/audit`. The submission endpoint is cache-first:
 * an ordinary request with a cached report returns `COMPLETED` immediately and
 * enqueues nothing, while an explicit `refresh` returns `REFRESHING` with the
 * cached report and starts the audit in the background.
 */
export interface AuditSubmitResponse {
  status: "accepted" | "processing" | "COMPLETED" | "REFRESHING";
  message?: string;
  cached?: boolean;
  jobId?: string;
  username?: string;
  pollUrl?: string;
  data?: DevWrappedStats | null;
}
