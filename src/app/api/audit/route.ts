import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { getDevWrappedStats } from "@/lib/github";
import {
  AUDIT_LOCK_TTL_SECONDS,
  auditFailureKey,
  auditLockKey,
  auditQueueKey,
  isValidUsername,
  normalizeUsername,
} from "@/lib/audit";
import type { AuditSubmitResponse } from "@/types/audit";

/**
 * Cache-first submission endpoint.
 *
 * An ordinary request (`refresh` omitted) never enqueues work when
 * `stats:<username>` already holds a valid report: it returns that report in a
 * single Redis round trip. Audits are only started by an explicit
 * `{ "refresh": true }` or when no cached report exists (initial audit).
 */
export async function POST(request: Request) {
  let username = "";
  let lockAcquired = false;

  try {
    const body = await request.json();
    username = normalizeUsername(body?.username ?? "");
    const refresh = body?.refresh === true;

    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: "Invalid GitHub username" },
        { status: 400 },
      );
    }

    if (!redis) {
      throw new Error("Redis instance is not initialized");
    }

    // 1. Serve the cached report before touching the queue. A cache hit must
    // never wait for GitHub, a worker, or a later status poll.
    const cachedStats = await getDevWrappedStats(username);

    if (cachedStats && !refresh) {
      return NextResponse.json<AuditSubmitResponse>({
        status: "COMPLETED",
        cached: true,
        username,
        data: cachedStats,
      });
    }

    const jobId = `job_${Date.now()}_${username}`;
    const lockKey = auditLockKey(username);

    // 2. Acquire atomic distributed lock ('EX' TTL, 'NX' set if not exists)
    const lockResult = await redis.set(
      lockKey,
      "processing",
      "EX",
      AUDIT_LOCK_TTL_SECONDS,
      "NX",
    );
    lockAcquired = lockResult === "OK";

    // Duplicate submission: never enqueue a second job for the same handle.
    if (!lockAcquired) {
      return NextResponse.json<AuditSubmitResponse>({
        status: cachedStats ? "REFRESHING" : "processing",
        message: "Audit already in progress. Listening for results...",
        username,
        pollUrl: `/api/audit/status/${username}`,
        ...(cachedStats ? { data: cachedStats } : {}),
      });
    }

    // 3. Clear a failure marker from an earlier run BEFORE enqueueing. The
    // status endpoint already checks the active lock first, but a fast worker
    // can fail the new audit immediately; clearing afterwards would erase that
    // fresh marker and let the old cached report look like this audit's result.
    try {
      await redis.del(auditFailureKey(username));
    } catch (markerError) {
      console.error("Failed to clear stale audit failure marker:", markerError);
    }

    // 4. Push JSON payload to standard Redis list (Matching Go domain.AuditJob tags)
    const jobPayload = JSON.stringify({
      job_id: jobId,
      username: username,
    });

    await redis.lpush(auditQueueKey(), jobPayload);

    // Explicit refresh with a cached report: hand the cached report back right
    // away and let the queue update it in the background.
    if (cachedStats) {
      return NextResponse.json<AuditSubmitResponse>({
        status: "REFRESHING",
        cached: true,
        jobId,
        username,
        pollUrl: `/api/audit/status/${username}`,
        data: cachedStats,
      });
    }

    // No cached report: this is an initial audit, so the client has nothing to
    // display until the worker finishes.
    return NextResponse.json<AuditSubmitResponse>(
      {
        status: "accepted",
        jobId,
        username,
        pollUrl: `/api/audit/status/${username}`,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("Audit Enqueue Error:", error);

    // Only release the lock this request actually owns, so a failed request
    // cannot delete another request's in-flight audit lock.
    if (username && lockAcquired && redis) {
      try {
        await redis.del(auditLockKey(username));
      } catch (releaseError) {
        console.error("Failed to release audit lock:", releaseError);
      }
    }

    return NextResponse.json(
      { error: "Failed to enqueue task" },
      { status: 500 },
    );
  }
}
