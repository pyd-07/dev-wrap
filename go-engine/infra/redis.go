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

// NewRedisRepository accepts either a bare host:port or a redis:// URL.
// docker-compose passes REDIS_URL=redis:6379, but a redis://host:port URL
// would previously be fed to go-redis as Addr verbatim and never connect.
func NewRedisRepository(addr string) (*RedisRepository, error) {
	if u, err := url.Parse(addr); err == nil && u.Scheme == "redis" {
		addr = u.Host
	}

	client := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
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