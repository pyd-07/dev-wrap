/**
 * Shared audit-pipeline helpers used by the Next.js producer and status
 * endpoints. Single source of truth for username normalization, validation and
 * the Redis key scheme, so producer and consumer can never drift apart.
 *
 * The Go engine mirrors these exact key formats in go-engine/infra/redis.go.
 */

const USERNAME_PATTERN = /^[a-zA-Z0-9-]{1,39}$/;

/**
 * Normalize a GitHub username for use as a cache/lock identity.
 * GitHub logins are case-insensitive; without normalization, `@Torvalds` and
 * `@torvalds` would get separate locks and separate cached stats.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate a GitHub username: 1-39 chars, alphanumerics and hyphens only.
 * Also acts as Redis-key-injection armor (no `:`, whitespace, newlines).
 */
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export const AUDIT_LOCK_TTL_SECONDS = 120;

export function auditLockKey(username: string): string {
  return `lock:audit:${username}`;
}

export function auditStatsKey(username: string): string {
  return `stats:${username}`;
}

export function auditFailureKey(username: string): string {
  return `failed:audit:${username}`;
}

export function auditQueueKey(): string {
  return "queue:github-audit";
}
