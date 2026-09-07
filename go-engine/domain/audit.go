package domain

import (
	"context"
	"time"
)

// AuditJob represents the deserialized job payload from Next.js
type AuditJob struct {
	JobID    string    `json:"job_id"`
	Username string    `json:"username"`
	Enqueued time.Time `json:"enqueued_at,omitempty"`
}

// UserProfile mirrors TypeScript user metadata
type UserProfile struct {
	Name      string  `json:"name"`
	Login     string  `json:"login"`
	AvatarURL string  `json:"avatarUrl"`
	Bio       *string `json:"bio"`
	Followers int     `json:"followers"`
	Following int     `json:"following"`
}

// OverviewMetrics mirrors TypeScript overview
type OverviewMetrics struct {
	TotalContributions int `json:"totalContributions"`
	TotalCommits       int `json:"totalCommits"`
	TotalPRsCreated    int `json:"totalPRsCreated"`
	TotalPRsReviewed   int `json:"totalPRsReviewed"`
	TotalIssuesCreated int `json:"totalIssuesCreated"`
}

// LanguageMetric mirrors TypeScript LanguageMetric
type LanguageMetric struct {
	Name       string  `json:"name"`
	Color      string  `json:"color"`
	Size       int64   `json:"size"`
	Percentage float64 `json:"percentage"`
}

// StreakMetric mirrors TypeScript StreakMetric
type StreakMetric struct {
	CurrentStreak      int `json:"currentStreak"`
	LongestStreak      int `json:"longestStreak"`
	TotalContributions int `json:"totalContributions"`
}

// PRMetric mirrors TypeScript PRMetric
type PRMetric struct {
	Total     int     `json:"total"`
	Merged    int     `json:"merged"`
	Closed    int     `json:"closed"`
	Open      int     `json:"open"`
	MergeRate float64 `json:"mergeRate"`
}

// DevWrappedStats matches TypeScript DevWrappedStats exactly
type DevWrappedStats struct {
	User         UserProfile     `json:"user"`
	Overview     OverviewMetrics `json:"overview"`
	Languages    []LanguageMetric `json:"languages"`
	Streak       StreakMetric    `json:"streak"`
	PullRequests PRMetric        `json:"pullRequests"`
	FetchedAt    string          `json:"fetchedAt"`
}

// AuditRepository contract for persistence and lock management
type AuditRepository interface {
	SaveStats(ctx context.Context, username string, stats *DevWrappedStats, ttl time.Duration) error
	ReleaseLock(ctx context.Context, username string) error
	// MarkFailed records a terminal failure so the status endpoint can
	// surface FAILED instead of a stale PROCESSING state.
	MarkFailed(ctx context.Context, username string) error
}

// AuditUseCase defines core business engine functionality
type AuditUseCase interface {
	ExecuteAudit(ctx context.Context, job AuditJob) error
}