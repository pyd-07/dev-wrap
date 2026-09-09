package config

import (
	"os"
	"strconv"
)

type Config struct {
	RedisURL 	string
	QueueName 	string
	Workers		int
}

func LoadConfig() *Config {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}
	queueName := os.Getenv("QUEUE_NAME")
	if queueName == "" {
		queueName = "queue:github-audit"
	}

	workers := 5
	if v, err := strconv.Atoi(os.Getenv("WORKERS")); err == nil && v > 0 {
		workers = v
	}

	return &Config{
		RedisURL: 	redisURL,
		QueueName: 	queueName,
		Workers: 	workers,
	}
}