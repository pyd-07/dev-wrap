import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import {
  auditFailureKey,
  auditLockKey,
  auditStatsKey,
  isValidUsername,
  normalizeUsername,
} from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const resolvedParams = await params;
    const username = normalizeUsername(resolvedParams.username);

    if (!isValidUsername(username)) {
      return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
    }

    const cachedStats = await redis.get(auditStatsKey(username));
    if (cachedStats) {
      return NextResponse.json({
        status: "COMPLETED",
        data:
          typeof cachedStats === "string"
            ? JSON.parse(cachedStats)
            : cachedStats,
      });
    }

    // Terminal failure marker written by the Go worker (10-min TTL). Surface
    // it explicitly so clients stop polling instead of falling through to a
    // 404 that can be re-polled forever.
    const failedMarker = await redis.get(auditFailureKey(username));
    if (failedMarker) {
      return NextResponse.json({
        status: "FAILED",
        message:
          "GitHub audit failed for this user. The handle may not exist or the audit could not be completed.",
      });
    }

    const isProcessing = await redis.get(auditLockKey(username));
    if (isProcessing) {
      return NextResponse.json({
        status: "PROCESSING",
        message: "Audit in progress...",
      });
    }

    return NextResponse.json(
      {
        status: "NOT_FOUND",
      },
      { status: 404 },
    );
  } catch (error) {
    console.error("Error fetching audit status:", error);
    return NextResponse.json(
      {
        status: "ERROR",
        message: "An error occurred while fetching the audit status.",
        data: null,
      },
      { status: 500 },
    );
  }
}
