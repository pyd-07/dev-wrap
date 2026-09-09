package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	"dev-wrap/go-engine/domain"
	"github.com/redis/go-redis/v9"
)

type RedisRepository struct {
	client *redis.Client
}

// NewRedisRepository accepts a redis:// or rediss:// URL (Render Key Value
// hands out rediss:// and requires TLS) or a bare host:port such as the
// REDIS_URL=redis:6379 that docker-compose passes.
func NewRedisRepository(addr string) (*RedisRepository, error) {
	var opts *redis.Options
	if u, err := url.Parse(addr); err == nil && (u.Scheme == "redis" || u.Scheme == "rediss") {
		parsed, parseErr := redis.ParseURL(addr)
		if parseErr != nil {
			return nil, fmt.Errorf("invalid REDIS_URL %q: %w", addr, parseErr)
		}
		opts = parsed
	} else {
		opts = &redis.Options{Addr: addr}
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	return &RedisRepository{client: client}, nil
}

func (r *RedisRepository) GetClient() *redis.Client {
	return r.client
}

func (r *RedisRepository) SaveStats(ctx context.Context, username string, stats *domain.DevWrappedStats, ttl time.Duration) error {
	data, err := json.Marshal(stats)
	if err != nil {
		return fmt.Errorf("failed to marshal stats: %w", err)
	}

	key := fmt.Sprintf("stats:%s", username)
	return r.client.Set(ctx, key, data, ttl).Err()
}

func (r *RedisRepository) ReleaseLock(ctx context.Context, username string) error {
	key := fmt.Sprintf("lock:audit:%s", username)
	return r.client.Del(ctx, key).Err()
}

func (r *RedisRepository) MarkFailed(ctx context.Context, username string) error {
	key := fmt.Sprintf("failed:audit:%s", username)
	return r.client.Set(ctx, key, "failed", 10*time.Minute).Err()
}