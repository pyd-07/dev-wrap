import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import {
  AUDIT_LOCK_TTL_SECONDS,
  auditLockKey,
  auditQueueKey,
  isValidUsername,
  normalizeUsername,
} from "@/lib/audit";

export async function POST(request: Request) {
  let username = "";
  try {
    const body = await request.json();
    username = normalizeUsername(body?.username ?? "");

    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: "Invalid GitHub username" },
        { status: 400 },
      );
    }

    const jobId = `job_${Date.now()}_${username}`;
    const lockKey = auditLockKey(username);

    if (!redis) {
      throw new Error("Redis instance is not initialized");
    }

    // 1. Acquire atomic distributed lock ('EX' TTL, 'NX' set if not exists)
    const lockResult = await redis.set(
      lockKey,
      "processing",
      "EX",
      AUDIT_LOCK_TTL_SECONDS,
      "NX",
    );
    const lockAcquired = lockResult === "OK";

    if (!lockAcquired) {
      return NextResponse.json({
        status: "processing",
        message: "Audit already in progress. Listening for results...",
      });
    }

    // 2. Push JSON payload to standard Redis list (Matching Go domain.AuditJob tags)
    const jobPayload = JSON.stringify({
      job_id: jobId,
      username: username,
    });

    await redis.lpush(auditQueueKey(), jobPayload);

    return NextResponse.json(
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

    // Release lock on failure so retries aren't blocked for 2 minutes
    if (username && redis) {
      await redis.del(auditLockKey(username));
    }

    return NextResponse.json(
      { error: "Failed to enqueue task" },
      { status: 500 },
    );
  }
}
