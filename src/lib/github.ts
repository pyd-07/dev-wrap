import { graphql } from '@octokit/graphql';
import { GraphQLResponse } from '@/types/github';

const GITHUB_GRAPHQL_QUERY = `
query GetDevWrappedData($username: String!) {
  user(login: $username) {
    name
    login
    avatarUrl
    bio
    followers {
      totalCount
    }
    following {
      totalCount
    }
    contributionsCollection {
      totalIssueContributions
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
    pullRequests(first: 100, states: [MERGED, CLOSED, OPEN], orderBy: { field: CREATED_AT, direction: DESC }) {
      totalCount
      nodes {
        state
      }
    }
    repositories(first: 50, ownerAffiliations: OWNER, isFork: false, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        name
        stargazerCount
        isFork
        languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
          edges {
            size
            node {
              name
              color
            }
          }
        }
      }
    }
  }
}
`

export async function fetchRawGithubData(username: string): Promise<GraphQLResponse> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN is not set in the environment variables.');
    }

    const graphqlClient = graphql.defaults({
        headers: {
            authorization: `token ${token}`
        }
    });

    const client = graphql.defaults({
      headers: {
        authorization: `bearer ${token}`,
      },
    });

    return await client<GraphQLResponse>(GITHUB_GRAPHQL_QUERY, { username });
}