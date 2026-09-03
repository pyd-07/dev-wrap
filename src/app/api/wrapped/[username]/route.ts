import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { fetchRawGithubData } from "@/lib/github";
import { processGithubMetrics } from "@/lib/metrics";
import { DevWrappedStats } from "@/types/github";

const CACHE_TTL_SECONDS = 86400; // 24 hours

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ username: string }> }
) {
    try {
        const { username } = await params;

        if (!username || typeof username !== "string" || username.trim() === "") {
            return NextResponse.json(
                { error: "Invalid username parameter" },
                { status: 400 }
            );
        }

        const normalizedUsername = username.trim().toLowerCase();
        const cacheKey = `user:stats:${normalizedUsername}`;

        // 1. Check Redis cache for existing data
        try {
            const cachedData = await redis.get(cacheKey);

            if (cachedData) {
                console.log(`[Cache HIT] Serving stats for: ${normalizedUsername}`);
                const parsedStats: DevWrappedStats = JSON.parse(cachedData);
                return NextResponse.json(
                    {
                        source: 'cache',
                        data: parsedStats,
                    },
                    {
                        status: 200,
                        headers: {
                            "Cache-Control": `public, max-age=3600, s-maxage=${CACHE_TTL_SECONDS}`,
                        },
                    }
                );
            }
        } catch (cacheError) {
            console.warn(`[Redis Read Error] Bypassing cache: ${(cacheError as Error).message}`);
        }

        // 2. Cache Miss: Fetch data from Github GraphQl API
        console.log(`[Cache MISS] Fetching fresh data from Github for: ${normalizedUsername}`);
        const rawData = await fetchRawGithubData(normalizedUsername);
        if (!rawData || !rawData.user) {
            return NextResponse.json(
                { error: `Github user "${username}" not found on Github"` },
                { status: 404 }
            );
        }

        // 3. Process raw response into metrics payload
        const processedStats = processGithubMetrics(rawData);

        // 4. Save to Redis  Cache asynchronously
        try {
            await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(processedStats));
            console.log(`[Cache WRITE] Stats cached for: ${normalizedUsername}`);
        } catch (error) {
            console.error(`[Redis Write Error] Failed to cache data for ${normalizedUsername}: ${(error as Error).message}`);
        }

        // 5. Return the processed stats
        return NextResponse.json(
            {
                source: 'api',
                data: processedStats,
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": `public, max-age=3600, s-maxage=${CACHE_TTL_SECONDS}`,
                },
            }
        );
    } catch (error: unknown) {
        const err = error as Error;
        console.error(`[API Error]:${(error as Error).message}`);

        if (err.message.includes('rate limit')) {
            return NextResponse.json(
                { error: `Rate limit exceeded for Github API. Please try again later.` },
                { status: 429 }
            );
        }
        return NextResponse.json(
            { error: err.message || "An unexpected error occurred while processing the request." },
            { status: 500 }
        );
    }
}