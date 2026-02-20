import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Redis } from 'ioredis';
import pino from 'pino';
import type { ApiKeyValidationResult } from '../types/mcp.js';

const logger = pino({ name: 'mcp-auth' });

// API keys are stored in Redis as a hash:
//   key: "api_keys"
//   field: sha256(rawKey)
//   value: agentId
const API_KEYS_HASH = 'api_keys';

function hashApiKey(rawKey: string): string {
	return createHash('sha256').update(rawKey).digest('hex');
}

export async function validateApiKey(req: IncomingMessage, redis: Redis): Promise<ApiKeyValidationResult> {
	const rawKey = req.headers['x-api-key'];

	if (typeof rawKey !== 'string' || rawKey.length === 0) {
		logger.warn({ path: req.url }, 'Missing X-Api-Key header');
		return { valid: false, reason: 'Missing X-Api-Key header' };
	}

	const keyHash = hashApiKey(rawKey);

	try {
		const agentId = await redis.hget(API_KEYS_HASH, keyHash);

		if (agentId === null) {
			logger.warn({ keyHash: keyHash.slice(0, 8) }, 'Unknown API key');
			return { valid: false, reason: 'Invalid API key' };
		}

		logger.debug({ agentId }, 'API key validated');
		return { valid: true, agentId };
	} catch (err) {
		logger.error({ err }, 'Redis error during API key validation');
		return { valid: false, reason: 'Internal server error' };
	}
}
