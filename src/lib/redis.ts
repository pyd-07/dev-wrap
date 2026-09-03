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
        enableReadyCheck: false,
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

redis.on("connect", () => {
    console.log("[Redis Client]: Connected to Redis server");
});

redis.on("ready", () => {
    console.log("[Redis Client]: Redis client is ready to use");
});

export default redis;