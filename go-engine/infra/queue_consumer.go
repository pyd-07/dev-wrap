package infra

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"dev-wrap/go-engine/domain"
	"github.com/redis/go-redis/v9"
)

type WorkerPool struct {
	client    *redis.Client
	queueName string
	workers   int
	useCase   domain.AuditUseCase
}

func NewWorkerPool(client *redis.Client, queueName string, workers int, useCase domain.AuditUseCase) *WorkerPool {
	return &WorkerPool{
		client:    client,
		queueName: queueName,
		workers:   workers,
		useCase:   useCase,
	}
}

func (wp *WorkerPool) Start(ctx context.Context) {
	// Recover jobs stranded in the processing list by a crashed worker or a
	// mid-job redeploy. Must run before workers begin consuming.
	wp.reclaimStranded(ctx)

	var wg sync.WaitGroup
	log.Printf("Booting worker pool [Workers: %d, Listening Queue: %s]", wp.workers, wp.queueName)

	for i := 1; i <= wp.workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			log.Printf("Worker %d started, waiting on queue %s", workerID, wp.queueName)
			wp.worker(ctx, workerID)
			log.Printf("Worker %d stopped", workerID)
		}(i)
	}

	// Block until shutdown signal, then wait for in-flight jobs to finish.
	<-ctx.Done()
	log.Println("Worker pool received shutdown signal, stopping workers...")
	wg.Wait()
	log.Println("Worker pool stopped")
}

// processingList is the durable holding area for jobs currently being
// executed. A worker that dies mid-job leaves its job here, where
// reclaimStranded picks it up on the next boot (at-least-once delivery).
func (wp *WorkerPool) processingList() string {
	return wp.queueName + ":processing"
}

func (wp *WorkerPool) reclaimStranded(ctx context.Context) {
	stranded, err := wp.client.LLen(ctx, wp.processingList()).Result()
	if err != nil {
		log.Printf("Warning: could not inspect processing list for stranded jobs: %v", err)
		return
	}
	if stranded == 0 {
		return
	}

	log.Printf("Reclaiming %d stranded job(s) from a previous run", stranded)
	for {
		// RPopLPush is atomic: a crash mid-reclaim can never drop a job.
		job, err := wp.client.RPopLPush(ctx, wp.processingList(), wp.queueName).Result()
		if err != nil {
			if err != redis.Nil {
				log.Printf("Warning: failed to reclaim stranded job: %v", err)
			}
			return
		}
		log.Printf("Reclaimed stranded job: %s", job)
	}
}

func (wp *WorkerPool) worker(ctx context.Context, id int) {
	const (
		minBackoff = 100 * time.Millisecond
		maxBackoff = 5 * time.Second
	)

	backoff := minBackoff
	for {
		select {
		case <-ctx.Done():
			return
		default:
			// BLMove pops the oldest job into a durable processing list in one
			// atomic step: the job is held while ExecuteAudit runs, so a worker
			// crash or mid-job redeploy can no longer silently drop it.
			payload, err := wp.client.BLMove(
				ctx, wp.queueName, wp.processingList(), "RIGHT", "LEFT", 0,
			).Result()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				// Without backoff, a Redis outage turns every worker into a
				// hot loop hammering reconnects and flooding logs.
				log.Printf("[Worker %d] BLMove error: %v (retrying in %s)", id, err, backoff)
				if !sleepCtx(ctx, backoff) {
					return
				}
				backoff = min(backoff*2, maxBackoff)
				continue
			}

			// Successful pop: reset the error backoff.
			backoff = minBackoff

			log.Printf("[Worker %d] Popped raw job: %s", id, payload)

			var job domain.AuditJob
			if err := json.Unmarshal([]byte(payload), &job); err != nil {
				log.Printf("[Worker %d] Failed to unmarshal job: %v", id, err)
				// Malformed payload: drop it from the processing list or it
				// would be re-executed forever on every reboot.
				// BUG-5: log removal errors so Redis failures are observable.
				if removed, lremErr := wp.client.LRem(ctx, wp.processingList(), 1, payload).Result(); lremErr != nil {
					log.Printf("[Worker %d] Warning: failed to remove malformed job from processing list: %v", id, lremErr)
				} else if removed == 0 {
					log.Printf("[Worker %d] Warning: malformed job was not found in processing list (already removed?)", id)
				}
				continue
			}
			if err := wp.useCase.ExecuteAudit(ctx, job); err != nil {
				log.Printf("[Worker %d] Failed to execute audit for %s: %v", id, job.Username, err)
			}
			// Job handled (success or terminal failure): remove it from the
			// durable processing list.
			// BUG-5: log removal errors so Redis failures are observable.
			if removed, lremErr := wp.client.LRem(ctx, wp.processingList(), 1, payload).Result(); lremErr != nil {
				log.Printf("[Worker %d] Warning: failed to remove job for %s from processing list: %v", id, job.Username, lremErr)
			} else if removed == 0 {
				log.Printf("[Worker %d] Warning: job for %s was not found in processing list (already removed?)", id, job.Username)
			}
		}
	}
}

// sleepCtx sleeps for d, returning false early if the context is cancelled.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
