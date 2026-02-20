import { randomBytes } from 'node:crypto';
import { storeApiKey } from '../auth/api-key.js';
import { loadConfig } from '../config.js';
import { createRedisClient } from '../redis/client.js';

const config = loadConfig();
const redis = createRedisClient(config.REDIS_URL);
await redis.connect();

const rawKey = `cgp_${randomBytes(32).toString('hex')}`;

await storeApiKey(redis, rawKey, {
	agentId: 'test-agent',
	plan: 'premium',
	rpsLimit: 100,
	createdAt: Date.now(),
});

process.stdout.write(`API key created:\n${rawKey}\n`);

await redis.quit();
