package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"dev-wrap/go-engine/domain"
	"dev-wrap/go-engine/infra"
)

type AuditService struct {
	repo         domain.AuditRepository
	githubClient *infra.GitHubClient
}

func NewAuditService(repo domain.AuditRepository, ghClient *infra.GitHubClient) *AuditService {
	return &AuditService{
		repo:         repo,
		githubClient: ghClient,
	}
}

func (s *AuditService) ExecuteAudit(ctx context.Context, job domain.AuditJob) error {
	// Failure-path hygiene: a failed audit must never leave the user stuck in
	// PROCESSING until the lock TTL expires. Whatever happens below, record a
	// terminal failure marker and release the lock before returning.
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered from panic while auditing @%s: %v", job.Username, r)
			s.markFailed(ctx, job.Username)
		}
	}()

	if err := s.execute(ctx, job); err != nil {
		s.markFailed(ctx, job.Username)
		return err
	}
	return nil
}

func (s *AuditService) execute(ctx context.Context, job domain.AuditJob) error {
	log.Printf("Processing audit job: %s for user: @%s", job.JobID, job.Username)

	// Respect context cancellation before issuing network requests.
	if err := ctx.Err(); err != nil {
		return err
	}

	// 1. Fetch real metrics from GitHub GraphQL API
	stats, err := s.githubClient.FetchUserStats(ctx, job.Username)
	if err != nil {
		return fmt.Errorf("github fetch failed for @%s: %w", job.Username, err)
	}

	// 2. Cache the completed audit report in Redis (24-hour TTL)
	if err := s.repo.SaveStats(ctx, job.Username, stats, 24*time.Hour); err != nil { // Ensure TTL duration matches your repo (24 * time.Hour)
		return fmt.Errorf("failed to save stats: %w", err)
	}

	// 3. Clear distributed lock
	if err := s.repo.ReleaseLock(ctx, job.Username); err != nil {
		log.Printf("Warning: Failed to release lock for @%s: %v", job.Username, err)
	}

	log.Printf("Successfully audited and cached metrics for @%s", job.Username)
	return nil
}

func (s *AuditService) markFailed(ctx context.Context, username string) {
	if err := s.repo.MarkFailed(ctx, username); err != nil {
		log.Printf("Warning: Failed to record failure marker for @%s: %v", username, err)
	}
	if err := s.repo.ReleaseLock(ctx, username); err != nil {
		log.Printf("Warning: Failed to release lock for @%s: %v", username, err)
	}
}