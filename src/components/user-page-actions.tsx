'use client';

import Link from "next/link";

/**
 * Client island inside the server-rendered [username] page: the only piece
 * that needs interactivity (browser reload for the Retry affordance).
 */
export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="text-muted-foreground underline"
    >
      Retry
    </button>
  );
}

export function BackLink() {
  return (
    <Link href="/" className="text-emerald-500 underline">
      Return to search
    </Link>
  );
}
