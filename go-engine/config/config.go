package config

import "os"

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

	return &Config{
		RedisURL: 	redisURL,
		QueueName: 	queueName,
		Workers: 	5,
	}
}