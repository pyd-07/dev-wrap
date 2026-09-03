import {
    GraphQLResponse,
    DevWrappedStats,
    LanguageMetric,
    StreakMetric,
    PRMetric,
} from '@/types/github';

export function processGithubMetrics(data: GraphQLResponse): DevWrappedStats {
    const user = data?.user;

    if (!user) {
        throw new Error('User not found on Github');
    }

    // 1. Process Languages Breakdown
    const languageMap: Record<string, { size: number; color: string }> = {};
    let totalByteSize = 0;

    const repoNodes = user.repositories?.nodes ?? [];
    repoNodes.forEach((repo) => {
        const edges = repo?.languages?.edges ?? [];
        edges.forEach((edge) => {
        if (!edge?.node) return;
        totalByteSize += edge.size;
        if (languageMap[edge.node.name]) {
            languageMap[edge.node.name].size += edge.size;
        } else {
            languageMap[edge.node.name] = {
            size: edge.size,
            color: edge.node.color || '#858585',
            };
        }
        });
    });

    const languages: LanguageMetric[] = Object.entries(languageMap)
        .map(([name, { size, color }]) => ({
        name,
        color,
        size,
        percentage: totalByteSize > 0 ? Number(((size / totalByteSize) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 5);

    // 2. Process PR Stats & Merge Rate
    const prNodes = user.pullRequests?.nodes ?? [];
    const mergedPRs = prNodes.filter((pr) => pr?.state === 'MERGED').length;
    const closedPRs = prNodes.filter((pr) => pr?.state === 'CLOSED').length;
    const openPRs = prNodes.filter((pr) => pr?.state === 'OPEN').length;
    const totalPRs = user.pullRequests?.totalCount ?? prNodes.length;

    const mergeRate = totalPRs > 0 ? Number(((mergedPRs / totalPRs) * 100).toFixed(2)) : 0;

    const pullRequests: PRMetric = {
        total: totalPRs,
        merged: mergedPRs,
        closed: closedPRs,
        open: openPRs,
        mergeRate,
    };

    // 3. Process Streaks (Calendar Analysis)
    const weeks = user.contributionsCollection?.contributionCalendar?.weeks ?? [];
    const allDays = weeks
        .flatMap((week) => week?.contributionDays ?? [])
        .filter((day) => Boolean(day?.date))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // 3a. Calculate Longest Streak (Forward Pass)
    for (let i = 0; i < allDays.length; i++) {
        const count = allDays[i]?.contributionCount ?? 0;
        if (count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
        }
        } else {
        tempStreak = 0;
        }
    }

    // 3b. Calculate Current Active Streak (Backward Pass)
    if (allDays.length > 0) {
        let pointer = allDays.length - 1;

        // If today's contribution count is 0, step back 1 day to check if an active streak exists through yesterday
        if ((allDays[pointer]?.contributionCount ?? 0) === 0 && pointer > 0) {
        pointer--;
        }

        // Count consecutive active days backwards
        while (pointer >= 0 && (allDays[pointer]?.contributionCount ?? 0) > 0) {
        currentStreak++;
        pointer--;
        }
    }

    const streak: StreakMetric = {
        currentStreak,
        longestStreak,
        totalContributions: user.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
    };

    // 4. Construct Final Aggregated Payload
    return {
        user: {
        name: user.name || user.login, // Fallback to login if name is null
        login: user.login,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        followers: user.followers?.totalCount ?? 0,
        following: user.following?.totalCount ?? 0,
        },
        overview: {
        totalContributions: user.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
        totalCommits: user.contributionsCollection?.totalCommitContributions ?? 0,
        totalPRsCreated: user.contributionsCollection?.totalPullRequestContributions ?? 0,
        totalPRsReviewed: user.contributionsCollection?.totalPullRequestReviewContributions ?? 0,
        totalIssuesCreated: user.contributionsCollection?.totalIssueContributions ?? 0, // Matches overview.totalIssuesCreated
        },
        languages,
        streak, // Matches DevWrappedStats.streak
        pullRequests,
        fetchedAt: new Date().toISOString(),
    };
}