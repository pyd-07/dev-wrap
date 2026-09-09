package infra

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sort"
	"time"

	"dev-wrap/go-engine/domain"

	"github.com/shurcooL/githubv4"
	"golang.org/x/oauth2"
)

// httpTimeout caps the total round-trip time for any GitHub API call.
// Without this, the oauth2 transport has no deadline and workers can
// hang indefinitely when GitHub is slow or unresponsive.
const httpTimeout = 45 * time.Second

// fetchTimeout is the per-call deadline passed to the GraphQL query.
// It is intentionally shorter than httpTimeout so the context fires
// before the transport deadline, giving a cleaner error message.
const fetchTimeout = 30 * time.Second

type GitHubClient struct {
	client *githubv4.Client
}

// pullRequestPageQuery contains one page of PRs and their repository owners.
// The inline Organization fragment deliberately excludes user-owned repos:
// only organization destinations should be shown as organization chips.
type pullRequestPageQuery struct {
	User struct {
		PullRequests struct {
			Nodes []struct {
				State      githubv4.PullRequestState
				Repository struct {
					Owner struct {
						Organization struct {
							Login githubv4.String
						} `graphql:"... on Organization"`
					}
				}
			}
			PageInfo struct {
				EndCursor   githubv4.String
				HasNextPage githubv4.Boolean
			}
		} `graphql:"pullRequests(first: 100, after: $cursor)"`
	} `graphql:"user(login: $username)"`
}

func NewGitHubClient() (*GitHubClient, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN environment variable not set")
	}

	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	// REL-2: wrap the oauth2 transport with an explicit timeout so TCP
	// connections and TLS handshakes cannot hang the worker forever.
	baseTransport := oauth2.NewClient(context.Background(), src).Transport
	httpClient := &http.Client{
		Timeout:   httpTimeout,
		Transport: baseTransport,
	}
	client := githubv4.NewClient(httpClient)

	return &GitHubClient{client: client}, nil
}

// FetchUserStats fetches GitHub contribution data for username and
// converts it into the domain stats model. It enforces a hard deadline
// of fetchTimeout so a slow GitHub response cannot pin a worker goroutine.
func (c *GitHubClient) FetchUserStats(ctx context.Context, username string) (*domain.DevWrappedStats, error) {
	// REL-1: derive a bounded child context so the GraphQL query always
	// has a deadline, regardless of what the caller's context carries.
	fetchCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	var q domain.GraphQLQuery
	variables := map[string]interface{}{
		"username": githubv4.String(username),
	}

	err := c.client.Query(fetchCtx, &q, variables)
	if err != nil {
		return nil, fmt.Errorf("github graphql query failed for user %s: %w", username, err)
	}

	pullRequests, err := c.fetchPullRequestMetrics(fetchCtx, username)
	if err != nil {
		return nil, err
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

	// Sort languages descending by size so the primary language is always
	// languages[0], matching the dashboard and OG image expectations.
	sort.Slice(languages, func(i, j int) bool {
		return languages[i].Size > languages[j].Size
	})

	// 2. Compute Contribution Streaks from Calendar
	// BUG-1: the original code set currentStreak = tempStreak after the
	// loop, which captured whatever the last contiguous run was — not
	// necessarily one ending today.  The fix: track the last day's count
	// separately and only keep the tail run as the current streak if it
	// actually reaches the final calendar day.
	var currentStreak, longestStreak, totalContribs int
	calendarWeeks := q.User.ContributionsCollection.ContributionCalendar.Weeks
	totalContribs = int(q.User.ContributionsCollection.ContributionCalendar.TotalContributions)
	contributions := make([]domain.ContributionDayMetric, 0, len(calendarWeeks)*7)

	tempStreak := 0
	lastDayHadContribs := false
	for _, week := range calendarWeeks {
		for _, day := range week.ContributionDays {
			count := int(day.ContributionCount)
			contributions = append(contributions, domain.ContributionDayMetric{
				Date:  string(day.Date),
				Count: count,
			})
			if count > 0 {
				tempStreak++
				lastDayHadContribs = true
				if tempStreak > longestStreak {
					longestStreak = tempStreak
				}
			} else {
				tempStreak = 0
				lastDayHadContribs = false
			}
		}
	}
	// currentStreak is only valid when the streak extends to the last
	// calendar day.  If the last day has 0 contributions the streak ended
	// before today and currentStreak must be 0.
	if lastDayHadContribs {
		currentStreak = tempStreak
	}

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
			// ContributionsCollection remains the audit-period count shown in
			// the overview; the state breakdown below intentionally covers the
			// user's complete pull-request history.
			TotalPRsCreated:    int(q.User.ContributionsCollection.TotalPullRequestContributions),
			TotalPRsReviewed:   int(q.User.ContributionsCollection.TotalPullRequestReviewContributions),
			TotalIssuesCreated: int(q.User.ContributionsCollection.TotalIssueContributions),
		},
		Languages: languages,
		Streak: domain.StreakMetric{
			CurrentStreak:      currentStreak,
			LongestStreak:      longestStreak,
			TotalContributions: totalContribs,
			Contributions:      contributions,
		},
		PullRequests: domain.PRMetric{
			Total:               pullRequests.Total,
			Merged:              pullRequests.Merged,
			Closed:              pullRequests.Closed,
			Open:                pullRequests.Open,
			MergeRate:           pullRequests.MergeRate,
			MergedOrganizations: pullRequests.MergedOrganizations,
		},
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}

	return stats, nil
}

func (c *GitHubClient) fetchPullRequestMetrics(ctx context.Context, username string) (domain.PRMetric, error) {
	variables := map[string]interface{}{
		"username": githubv4.String(username),
		"cursor":   (*githubv4.String)(nil),
	}
	organizationCounts := make(map[string]int)
	metrics := domain.PRMetric{}

	for {
		var q pullRequestPageQuery
		if err := c.client.Query(ctx, &q, variables); err != nil {
			return domain.PRMetric{}, fmt.Errorf("github pull request query failed for user %s: %w", username, err)
		}

		for _, pullRequest := range q.User.PullRequests.Nodes {
			metrics.Total++
			switch pullRequest.State {
			case githubv4.PullRequestStateMerged:
				metrics.Merged++
			case githubv4.PullRequestStateClosed:
				metrics.Closed++
			case githubv4.PullRequestStateOpen:
				metrics.Open++
			}

			if pullRequest.State != githubv4.PullRequestStateMerged {
				continue
			}
			organization := string(pullRequest.Repository.Owner.Organization.Login)
			if organization != "" {
				organizationCounts[organization]++
			}
		}

		if !bool(q.User.PullRequests.PageInfo.HasNextPage) {
			break
		}
		variables["cursor"] = githubv4.NewString(q.User.PullRequests.PageInfo.EndCursor)
	}

	organizations := make([]domain.MergedOrganizationMetric, 0, len(organizationCounts))
	for login, count := range organizationCounts {
		organizations = append(organizations, domain.MergedOrganizationMetric{Login: login, Count: count})
	}
	sort.Slice(organizations, func(i, j int) bool {
		if organizations[i].Count == organizations[j].Count {
			return organizations[i].Login < organizations[j].Login
		}
		return organizations[i].Count > organizations[j].Count
	})

	metrics.MergedOrganizations = organizations
	if resolvedPRs := metrics.Merged + metrics.Closed; resolvedPRs > 0 {
		metrics.MergeRate = float64(metrics.Merged) / float64(resolvedPRs) * 100
		metrics.MergeRate = float64(int(metrics.MergeRate*10)) / 10
	}

	return metrics, nil
}
