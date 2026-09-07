// PROCESSED METRICS PAYLOAD (produced by the Go worker engine)

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
}
