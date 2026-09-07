import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { getDevWrappedStats } from "@/lib/github";
import { auditLockKey, isValidUsername, normalizeUsername } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const resolvedParams = await params;
    const username = normalizeUsername(resolvedParams.username);

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { status: "NOT_FOUND", message: "No audited stats found for this user." },
        { status: 404 }
      );
    }

    // 1. Fetch pre-computed stats cached by the Go engine (parse-safe helper)
    const stats = await getDevWrappedStats(username);

    if (stats) {
      // Envelope matches /api/audit/status: { status, data }
      return NextResponse.json({ status: "COMPLETED", data: stats });
    }

    // 2. Fallback check: Check if an audit job is currently active
    const isProcessing = await redis?.get(auditLockKey(username));
    if (isProcessing) {
      return NextResponse.json(
        { status: "PROCESSING", message: "Audit job in progress..." },
        { status: 202 }
      );
    }

    return NextResponse.json(
      { status: "NOT_FOUND", message: "No audited stats found for this user." },
      { status: 404 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve wrapped statistics" },
      { status: 500 }
    );
  }
}
