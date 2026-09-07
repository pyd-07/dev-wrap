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
			res, err := wp.client.BLPop(ctx, 0, wp.queueName).Result()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				// Without backoff, a Redis outage turns every worker into a
				// hot loop hammering reconnects and flooding logs.
				log.Printf("[Worker %d] BLPop error: %v (retrying in %s)", id, err, backoff)
				if !sleepCtx(ctx, backoff) {
					return
				}
				backoff = min(backoff*2, maxBackoff)
				continue
			}

			// Successful pop: reset the error backoff.
			backoff = minBackoff

			// res[0] = queue key, res[1] = raw JSON payload
			log.Printf("[Worker %d] Popped raw job: %s", id, res[1])

			var job domain.AuditJob
			if err := json.Unmarshal([]byte(res[1]), &job); err != nil {
				log.Printf("[Worker %d] Failed to unmarshal job: %v", id, err)
				continue
			}
			if err := wp.useCase.ExecuteAudit(ctx, job); err != nil {
				log.Printf("[Worker %d] Failed to execute audit for %s: %v", id, job.Username, err)
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