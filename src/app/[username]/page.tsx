'use client';

import { use, useEffect, useState } from "react";
import { DevWrappedStats } from "@/types/github";
import { EditorialDasboard } from "@/components/editorial-dasboard";

export default function WrappedUserPage({ params }: { params: Promise<{ username: string }> }) {
    const resolvedParams = use(params);
    const username = resolvedParams.username;

    const [stats, setStats] = useState<DevWrappedStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Fetch the user's stats
        async function fetchStats() {
            try {
                setLoading(true);
                const res = await fetch('/api/wrapped/' + encodeURIComponent(username));
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to retrieve user stats');
                }
                setStats(data.data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
                setStats(null);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, [username]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center font-mono text-xs">
                <span className="animate-pulse">COMPILING DEVWRAPPED FOR @{username.toUpperCase()}...</span>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="min-h-screen bg-background text-rose-500 flex flex-col items-center justify-center font-mono text-xs space-y-4">
                <div>ERROR: {error}</div>
                <a href="/" className="text-muted-foreground underline">Return to search</a>
            </div>
        )
    }

    return <EditorialDasboard stats={stats} />
}