import { ImageResponse } from "next/og";
import { DevWrappedStats } from "@/types/github";

export const runtime = "edge";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ username: string }> }
) {
    const resolvedParams = await params;
    const username = resolvedParams.username;

    try {
        //  Fetch stats internally from the API route
        const { origin } = new URL(request.url);
        const res = await fetch(`${origin}/api/wrapped/${username}`);
        const json = await res.json();

        if (!res.ok || !json.data) {
            throw new Error('User stats unavailable');
        }

        const stats: DevWrappedStats = json.data;

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        backgroundColor: '#09090b',
                        color: '#fafafa',
                        fontFamily: 'monospace',
                        padding: '60px',
                        border: '2px solid #27272a',
                    }}
                    >
                    {/* Top Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '20px', color: '#a1a1aa', letterSpacing: '2px' }}>
                        DEVWRAPPED // 2026
                        </span>
                        <span
                        style={{
                            fontSize: '16px',
                            color: '#10b981',
                            border: '1px solid #10b98133',
                            padding: '6px 16px',
                            borderRadius: '4px',
                        }}
                        >
                        • AUDIT COMPLETE
                        </span>
                    </div>

                    {/* User Section */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                        <img
                        src={stats.user.avatarUrl}
                        alt={stats.user.login}
                        style={{
                            width: '120px',
                            height: '120px',
                            borderRadius: '8px',
                            border: '2px solid #3f3f46',
                        }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h1 style={{ fontSize: '56px', fontWeight: 'bold', margin: 0 }}>
                            {stats.user.name || stats.user.login}
                        </h1>
                        <p style={{ fontSize: '24px', color: '#a1a1aa', margin: 0 }}>
                            @{stats.user.login}
                        </p>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div
                        style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #27272a',
                        borderBottom: '1px solid #27272a',
                        padding: '30px 0',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#ffffff' }}>
                            {stats.overview.totalContributions}
                        </span>
                        <span style={{ fontSize: '14px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Total Contributions
                        </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#10b981' }}>
                            {stats.streak.longestStreak} Days
                        </span>
                        <span style={{ fontSize: '14px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Longest Streak
                        </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#ffffff' }}>
                            {stats.pullRequests.mergeRate}%
                        </span>
                        <span style={{ fontSize: '14px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            PR Merge Rate
                        </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#ffffff' }}>
                            {stats.languages[0]?.name || 'N/A'}
                        </span>
                        <span style={{ fontSize: '14px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Top Language
                        </span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#71717a' }}>
                        <span>GENERATED FOR @{stats.user.login.toUpperCase()}</span>
                        <span>DEVWRAPPED.ENGINE</span>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        )
    } catch {
        return new Response('Failed to generate image', { status: 500 });
    }
}