package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"dev-wrap/go-engine/config"
	"dev-wrap/go-engine/infra"
	"dev-wrap/go-engine/service"
)

func main() {
	cfg := config.LoadConfig()

	// 1. Repositories & Clients
	redisRepo, err := infra.NewRedisRepository(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Fatal: Could not connect to Redis: %v", err)
	}

	ghClient, err := infra.NewGitHubClient()
	if err != nil {
		log.Fatalf("Fatal: Could not initialize GitHub GraphQL client: %v", err)
	}

	// 2. Business Services
	auditService := service.NewAuditService(redisRepo, ghClient)

	// 3. Worker Pool
	pool := infra.NewWorkerPool(
		redisRepo.GetClient(),
		cfg.QueueName,
		cfg.Workers,
		auditService,
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool.Start(ctx)
}