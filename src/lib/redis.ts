import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

declare global {
  // prevent multiple redis instances during Next.js hot reloading
  var redisInstance: Redis | undefined;
}

let redis: Redis;

if (process.env.NODE_ENV === "production") {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (process.env.NODE_ENV === "production") {
        return Math.min(times * 50, 2000);
      }
      return null;
    },
  });
} else {
  if (!global.redisInstance) {
    global.redisInstance = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });
  }
  redis = global.redisInstance;
}

redis.on("error", (err) => {
  console.error("[Redis Client Error]:", err.message);
});

export default redis;
