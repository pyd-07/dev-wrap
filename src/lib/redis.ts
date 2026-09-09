import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Render Key Value hands out rediss:// URLs that require TLS; without an
// explicit tls config the handshake fails and every request 500s. Also cap
// connectTimeout so a cold start can't hang requests for the default 10s.
const isTLS = REDIS_URL.startsWith("rediss://");

function createRedisClient(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    ...(isTLS ? { tls: {} } : {}),
  });
}

declare global {
  // prevent multiple redis instances during Next.js hot reloading
  var redisInstance: Redis | undefined;
}

let redis: Redis;

if (process.env.NODE_ENV === "production") {
  redis = createRedisClient();
} else {
  if (!global.redisInstance) {
    global.redisInstance = createRedisClient();
  }
  redis = global.redisInstance;
}

redis.on("error", (err) => {
  console.error("[Redis Client Error]:", err.message);
});

export default redis;
