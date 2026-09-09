package domain

import "github.com/shurcooL/githubv4"

// GraphQLQuery defines the exact payload we need from GitHub in a single round-trip.
type GraphQLQuery struct {
	User struct {
		Name      githubv4.String
		Login     githubv4.String
		AvatarURL githubv4.URI
		Bio       githubv4.String
		Followers struct {
			TotalCount githubv4.Int
		}
		Following struct {
			TotalCount githubv4.Int
		}
		ContributionsCollection struct {
			TotalIssueContributions             githubv4.Int
			TotalCommitContributions            githubv4.Int
			TotalPullRequestContributions       githubv4.Int
			TotalPullRequestReviewContributions githubv4.Int
			ContributionCalendar                struct {
				TotalContributions githubv4.Int
				Weeks              []struct {
					ContributionDays []struct {
						Date              githubv4.String
						ContributionCount githubv4.Int
					}
				}
			}
		}
		Repositories struct {
			Nodes []struct {
				Name           githubv4.String
				StargazerCount githubv4.Int
				IsFork         githubv4.Boolean
				Languages      struct {
					Edges []struct {
						Size githubv4.Int
						Node struct {
							Name  githubv4.String
							Color githubv4.String
						}
					}
				} `graphql:"languages(first: 10, orderBy: {field: SIZE, direction: DESC})"`
			}
		} `graphql:"repositories(first: 50, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC})"`
	} `graphql:"user(login: $username)"`
}
