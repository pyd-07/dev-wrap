# Metrics Reference

This document defines what each dashboard metric means, where its source data comes from, how it is calculated, and where the current implementation has bounded data windows.

## Profile

The profile section is populated from the GitHub GraphQL user object:

| Metric | Source |
| --- | --- |
| Name | `user.name` |
| Login | `user.login` |
| Avatar | `user.avatarUrl` |
| Bio | `user.bio` |
| Followers | `user.followers.totalCount` |
| Following | `user.following.totalCount` |

## Overview

### Total contributions

Source: `contributionsCollection.contributionCalendar.totalContributions`.

This is GitHub's aggregate contribution count for the returned contribution calendar.

### Total commits

Source: `contributionsCollection.totalCommitContributions`.

### Pull requests created

Source: `contributionsCollection.totalPullRequestContributions`.

This is the contribution count for pull requests, not the pull-request state total used by the PR activity section.

### Pull requests reviewed

Source: `contributionsCollection.totalPullRequestReviewContributions`.

### Issues created

Source: `contributionsCollection.totalIssueContributions`.

## Language composition

The worker requests up to 50 owned, non-fork repositories, ordered by stargazers. For each selected repository, GitHub returns up to 10 language edges ordered by language size.

The worker aggregates the returned byte sizes by language:

```text
aggregate language size += edge.size
```

The final language list is sorted by aggregate byte size and percentages are calculated from the total returned language bytes:

```text
percentage = language bytes / total returned language bytes * 100
```

Percentages are truncated to one decimal place by the current Go implementation. The dashboard receives the resulting list in descending byte-size order.

### Important interpretation

This is language **byte composition** of the repository/language sample returned by the GraphQL query. It is not a count of files, commits, lines of code, or repository activity.

Because the repository query is capped at 50 repositories and each repository returns at most 10 language entries, the metric is not guaranteed to represent every repository or every language associated with an account.

Repositories are restricted to `ownerAffiliations: OWNER` and `isFork: false`.

## Pull-request activity

Pull-request state metrics are fetched separately from the main contribution query.

The worker requests pull requests in pages of 100 using a cursor. It continues while GitHub reports `hasNextPage`, so the current implementation paginates through the available pull-request result set rather than stopping after the first 100 nodes.

For every returned pull request, the worker counts:

```text
merged = count(state == MERGED)
closed = count(state == CLOSED)
open   = count(state == OPEN)
```

`total` is the number of pull-request nodes returned across all fetched pages.

### Merge rate

The current implementation defines merge rate over resolved pull requests:

```text
mergeRate = merged / (merged + closed) * 100
```

Open pull requests are not included in the denominator because they have not reached a resolved state.

The result is truncated to one decimal place.

### Merged organizations

For every merged pull request whose repository owner is a GitHub organization, the worker counts the destination organization login:

```text
organization count = number of merged PRs targeting that organization
```

The resulting organizations are sorted by count descending, with organization login as the tie-breaker. The dashboard currently surfaces the leading organization entries.

User-owned repository destinations are not included in this organization breakdown.

## Contribution streaks

The contribution calendar is returned as weeks containing daily contribution records. The worker flattens those records in the order returned by GitHub and calculates streaks from the daily counts.

### Longest streak

The longest streak uses a forward scan:

- a day with `contributionCount > 0` increments the temporary streak;
- a zero-contribution day resets it to zero; and
- the largest temporary value becomes `longestStreak`.

This measures consecutive active calendar days represented by the returned calendar.

### Current streak

The current streak is the consecutive active run ending at the latest calendar day in the returned data.

If the latest day has zero contributions, `currentStreak` is zero. The current implementation does not reinterpret yesterday as the current streak when today is inactive.

### Total contributions

The streak data also carries GitHub's aggregate `totalContributions` value.

## Data freshness

The worker generates `fetchedAt` when it constructs the processed report.

Completed reports are stored in Redis for 24 hours. During that period, repeated reads return the same cached payload and therefore the original `fetchedAt` value.

A new audit is required to produce a fresh report after the cached report expires.

## Metric source and processing model

The metrics are calculated by the Go audit engine, not by the Next.js dashboard components.

The high-level sequence is:

```text
GitHub GraphQL
      |
      v
Go GitHub client
      |
      v
metric transformation
      |
      v
DevWrappedStats
      |
      v
Redis stats:<username>
      |
      v
Next.js dashboard
```

This keeps the expensive GitHub fetch and metric calculation out of the browser and out of the normal dashboard render path.

## Limitations

The current implementation has these important boundaries:

- Language analysis is limited to the 50 repositories returned by the repository query.
- Each selected repository contributes at most 10 language edges to the aggregation.
- Pull requests are paginated in batches of 100, so the PR activity calculation is not limited to a single page.
- GitHub contribution totals come from aggregate contribution fields rather than from the pull-request or repository node lists.
- Streaks are calculated from the contribution calendar returned by GitHub; they are not independently reconstructed from every repository or event.
- Completed reports are cached for 24 hours, so the dashboard is not continuously recalculated.
- A failed audit produces a temporary failure marker rather than a partial report.
