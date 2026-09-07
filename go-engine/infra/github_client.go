package infra

import (
	"context"
	"fmt"
	"os"
	"time"

	"dev-wrap/go-engine/domain"

	"github.com/shurcooL/githubv4"
	"golang.org/x/oauth2"
)

type GitHubClient struct {
	client *githubv4.Client
}

func NewGitHubClient() (*GitHubClient, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN environment variable not set")
	}

	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	httpClient := oauth2.NewClient(context.Background(), src)
	client := githubv4.NewClient(httpClient)

	return &GitHubClient{client: client}, nil
}

func (c *GitHubClient) FetchUserStats(ctx context.Context, username string) (*domain.DevWrappedStats, error) {
	var q domain.GraphQLQuery
	variables := map[string]interface{}{
		"username": githubv4.String(username),
	}

	err := c.client.Query(ctx, &q, variables)
	if err != nil {
		return nil, fmt.Errorf("github graphql query failed for user %s: %w", username, err)
	}

	bioStr := string(q.User.Bio)
	
	// 1. Calculate Language Breakdown
	langMap := make(map[string]struct {
		Color string
		Size  int64
	})
	var totalLangSize int64

	for _, repo := range q.User.Repositories.Nodes {
		for _, edge := range repo.Languages.Edges {
			langName := string(edge.Node.Name)
			langColor := string(edge.Node.Color)
			size := int64(edge.Size)

			entry := langMap[langName]
			entry.Color = langColor
			entry.Size += size
			langMap[langName] = entry

			totalLangSize += size
		}
	}

	languages := make([]domain.LanguageMetric, 0, len(langMap))
	for name, data := range langMap {
		var pct float64
		if totalLangSize > 0 {
			pct = float64(data.Size) / float64(totalLangSize) * 100
		}
		languages = append(languages, domain.LanguageMetric{
			Name:       name,
			Color:      data.Color,
			Size:       data.Size,
			Percentage: float64(int(pct*10)) / 10, // Round to 1 decimal
		})
	}

	// 2. Compute Contribution Streaks from Calendar
	var currentStreak, longestStreak, totalContribs int
	calendarWeeks := q.User.ContributionsCollection.ContributionCalendar.Weeks
	totalContribs = int(q.User.ContributionsCollection.ContributionCalendar.TotalContributions)

	tempStreak := 0
	for _, week := range calendarWeeks {
		for _, day := range week.ContributionDays {
			count := int(day.ContributionCount)
			if count > 0 {
				tempStreak++
				if tempStreak > longestStreak {
					longestStreak = tempStreak
				}
			} else {
				tempStreak = 0
			}
		}
	}
	currentStreak = tempStreak

	// 3. Construct Final Domain Stats Object
	stats := &domain.DevWrappedStats{
		User: domain.UserProfile{
			Name:      string(q.User.Name),
			Login:     string(q.User.Login),
			AvatarURL: q.User.AvatarURL.String(),
			Bio:       &bioStr,
			Followers: int(q.User.Followers.TotalCount),
			Following: int(q.User.Following.TotalCount),
		},
		Overview: domain.OverviewMetrics{
			TotalContributions: totalContribs,
			TotalCommits:       int(q.User.ContributionsCollection.TotalCommitContributions),
			TotalPRsCreated:    int(q.User.ContributionsCollection.TotalPullRequestContributions),
			TotalPRsReviewed:   int(q.User.ContributionsCollection.TotalPullRequestReviewContributions),
			TotalIssuesCreated: int(q.User.ContributionsCollection.TotalIssueContributions),
		},
		Languages: languages,
		Streak: domain.StreakMetric{
			CurrentStreak:      currentStreak,
			LongestStreak:      longestStreak,
			TotalContributions: totalContribs,
		},
		PullRequests: domain.PRMetric{
			Total:     int(q.User.ContributionsCollection.TotalPullRequestContributions),
			Merged:    int(q.User.ContributionsCollection.TotalPullRequestContributions), // Detailed PR state filtering can be attached here
			Closed:    0,
			Open:      0,
			MergeRate: 100.0,
		},
		FetchedAt: time.Now().Format(time.RFC3339),
	}

	return stats, nil
}