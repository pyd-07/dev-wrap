// RAW GRAPHQL RESPONSE TYPES

export interface GraphQLLanguageNode {
    size: number;
    node: {
        name: string;
        color: string | null;
    };
}

export interface GraphQLRepositoryNode {
    name: string;
    stargazerCount: number;
    isFork: boolean;
    languages: {
        edges: GraphQLLanguageNode[];
    };
}

export interface GraphQLContributionDay {
    date: string;
    contributionCount: number;
}

export interface GraphQLContributionWeek {
    contributionDays: GraphQLContributionDay[];
}

export interface GraphQLResponse {
    user: {
        name: string | null;
        login: string;
        avatarUrl: string;
        bio: string | null;
        followers: {
            totalCount: number;
        };
        following: {
            totalCount: number;
        };
        contributionsCollection: {
            totalIssueContributions: number;
            totalCommitContributions: number;
            totalPullRequestContributions: number;
            totalPullRequestReviewContributions: number;
            contributionCalendar: {
                totalContributions: number;
                weeks: GraphQLContributionWeek[];
            };
        };
        pullRequests: {
            totalCount: number;
            nodes: Array<{
                state: 'OPEN' | 'CLOSED' | 'MERGED';
            }>;
        };
        repositories: {
            nodes: GraphQLRepositoryNode[];
        };
    } | null;
}

// PROCESSED METRICS PAYLOAD

export interface LanguageMetric {
    name: string;
    color: string;
    size: number;
    percentage: number;
}

export interface StreakMetric {
    currentStreak: number;
    longestStreak: number;
    totalContributions: number;
}

export interface PRMetric {
    total: number;
    merged: number;
    closed: number;
    open: number;
    mergeRate: number;
}

export interface DevWrappedStats {
    user: {
        name: string;
        login: string;
        avatarUrl: string;
        bio: string | null;
        followers: number;
        following: number;
    };
    overview: {
        totalContributions: number;
        totalCommits: number;
        totalPRsCreated: number;
        totalPRsReviewed: number;
        totalIssuesCreated: number;
    };
    languages: LanguageMetric[];
    streak: StreakMetric;
    pullRequests: PRMetric;
    fetchedAt: string;
};