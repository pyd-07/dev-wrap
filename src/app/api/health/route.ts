import { NextResponse } from "next/server";
import redis from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostic endpoint. Render health checks hit `/` or `/api/health`;
 * this surfaces the exact pipeline state: is Redis reachable, is a worker
 * consuming, and whether jobs are stuck in the durable processing list.
 *
 * The `processing` count is the at-least-once consumer's holding list — if it
 * grows while no audit is active, workers are crashed/stalled and jobs will
 * only be recovered on the next worker boot.
 */
export async function GET() {
  try {
    const [queueDepth, processingDepth] = await Promise.all([
      redis.llen("queue:github-audit"),
      redis.llen("queue:github-audit:processing"),
    ]);

    return NextResponse.json({
      status: "ok",
      redis: "connected",
      queueDepth,
      processingDepth,
    });
  } catch (error) {
    console.error("[Health] Redis unreachable:", error);
    return NextResponse.json(
      {
        status: "degraded",
        redis: "unreachable",
        hint: "Check REDIS_URL (must be rediss:// for Render Key Value) and that the worker service is deployed.",
      },
      { status: 503 },
    );
  }
}
