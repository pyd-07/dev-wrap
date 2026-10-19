import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import {
  auditFailureKey,
  auditLockKey,
  auditStatsKey,
  isValidUsername,
  normalizeUsername,
} from "@/lib/audit";
import type { AuditStatusResponse } from "@/types/audit";
import type { DevWrappedStats } from "@/types/github";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const resolvedParams = await params;
    const username = normalizeUsername(resolvedParams.username);

    if (!isValidUsername(username)) {
      return NextResponse.json<AuditStatusResponse>(
        { status: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Read all pipeline state together so the reported status reflects one
    // consistent view of Redis.
    const [cachedStats, failedMarker, activeLock] = await Promise.all([
      redis.get(auditStatsKey(username)),
      redis.get(auditFailureKey(username)),
      redis.get(auditLockKey(username)),
    ]);

    const stats: DevWrappedStats | null = cachedStats
      ? typeof cachedStats === "string"
        ? (JSON.parse(cachedStats) as DevWrappedStats)
        : cachedStats
      : null;

    // The active lock always wins: a cached report must never be reported as
    // the completed result of an audit that is still running.
    if (activeLock) {
      if (stats) {
        return NextResponse.json<AuditStatusResponse>({
          status: "REFRESHING",
          message:
            "A newer audit is running. Showing the last completed report.",
          data: stats,
        });
      }

      return NextResponse.json<AuditStatusResponse>({
        status: "PROCESSING",
        message: "Audit in progress...",
      });
    }

    // No audit is running. A failure marker means the most recent audit did not
    // complete; keep any previously completed report available as stale data.
    if (failedMarker) {
      return NextResponse.json<AuditStatusResponse>({
        status: "FAILED",
        message:
          "GitHub audit failed for this user. The handle may not exist or the audit could not be completed.",
        ...(stats ? { data: stats } : {}),
      });
    }

    if (stats) {
      return NextResponse.json<AuditStatusResponse>({
        status: "COMPLETED",
        data: stats,
      });
    }

    return NextResponse.json<AuditStatusResponse>(
      { status: "NOT_FOUND" },
      { status: 404 },
    );
  } catch (error) {
    console.error("Error fetching audit status:", error);
    return NextResponse.json<AuditStatusResponse>(
      {
        status: "ERROR",
        message: "An error occurred while fetching the audit status.",
        data: null,
      },
      { status: 500 },
    );
  }
}
