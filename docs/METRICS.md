# Metrics Reference

This document defines what each dashboard metric means, where its source data comes from, and how it is calculated.

## Profile

The profile section contains:

| Metric | Source |
| --- | --- |
| Name | `user.name`, with GitHub login as fallback |
| Login | `user.login` |
| Avatar | `user.avatarUrl` |
| Bio | `user.bio` |
| Followers | `user.followers.totalCount` |
| Following | `user.following.totalCount` |

## Overview

### Total contributions

Source: `contributionsCollection.contributionCalendar.totalContributions`.

This is the aggregate contribution count supplied by GitHub for the contribution calendar.

### Total commits

Source: `contributionsCollection.totalCommitContributions`.

### Pull requests created

Source: `contributionsCollection.totalPullRequestContributions`.

This is the user's contribution count for pull requests, rather than the same `pullRequests.totalCount` field used for merge-rate analysis.

### Pull requests reviewed

Source: `contributionsCollection.totalPullRequestReviewContributions`.

### Issues created

Source: `contributionsCollection.totalIssueContributions`.

## Language composition

The GraphQL query selects the five largest language entries, by byte size, for each of up to 50 owned, non-fork repositories.

For each returned language edge:

```text
aggregate language size += edge.size
```

The aggregate is then converted into a percentage:

```text
percentage = language bytes / total returned language bytes * 100
```

Percentages are rounded to two decimal places. The final language list is sorted by aggregate byte size and limited to five entries.

### Important interpretation

This metric represents language byte composition of the repository sample requested by the current GraphQL query. It is not a source-code line count, commit count, or necessarily a complete account-wide language composition.

Repositories are filtered by `ownerAffiliations: OWNER` and `isFork: false`.

## Pull-request metrics

The query requests up to 100 pull requests ordered by creation time, across the `MERGED`, `CLOSED`, and `OPEN` states.

The processor calculates:

```text
merged = count(state == MERGED)
closed = count(state == CLOSED)
open   = count(state == OPEN)
```

The total value uses GitHub's `pullRequests.totalCount` when available.

### Merge rate

```text
mergeRate = merged / total * 100
```

The result is rounded to two decimal places.

Because state counts are derived from the returned node list while `total` can describe more records than the 100-node window, the merge-rate calculation can be affected by the query's result limit. This should be considered before presenting the metric as a complete lifetime percentage.

## Contribution streaks

The contribution calendar is returned as weeks containing daily contribution records. The processor flattens the weeks into a single list and sorts it chronologically.

### Longest streak

The longest streak is calculated with a forward pass:

- A day with `contributionCount > 0` increments the temporary streak.
- A day with zero contributions resets it to zero.
- The largest temporary value becomes `longestStreak`.

This measures consecutive active calendar days represented in the returned calendar.

### Current streak

The current streak is calculated from the end of the calendar:

1. Start at the latest calendar day.
2. If that day has zero contributions, move back one day.
3. Count consecutive days with contributions until the first inactive day.

This makes the metric continue through yesterday when today's contribution count is zero.

### Total contributions

The streak card also receives the aggregate `totalContributions` value supplied by GitHub.

## Data freshness

The processed payload includes `fetchedAt`, an ISO timestamp generated when the metrics are constructed.

The API stores the complete processed payload in Redis for 24 hours. During that period, repeat requests can return the original `fetchedAt` timestamp along with the cached data.

## Metric limitations

Several implementation details are important when interpreting the dashboard:

- Repository language data is capped at 50 owned, non-fork repositories.
- Each repository contributes at most five language edges to the aggregation.
- Pull-request state counts are based on at most 100 returned pull-request nodes.
- Contribution totals use GitHub's aggregate contribution fields and therefore do not have the same result-window limitation as the node lists.
- The application does not currently recalculate metrics continuously; normal freshness is controlled primarily by the 24-hour Redis cache.
