import type { IncomingMessage } from 'node:http';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { lookupApiKey } from '../auth/api-key.js';
import type { ApiKeyValidationResult } from '../types/mcp.js';

const logger = pino({ name: 'mcp-auth' });

export async function validateApiKey(req: IncomingMessage, redis: Redis): Promise<ApiKeyValidationResult> {
	const rawKey = req.headers['x-api-key'];

	if (typeof rawKey !== 'string' || rawKey.length === 0) {
		logger.warn({ path: req.url }, 'Missing X-Api-Key header');
		return { valid: false, reason: 'Missing X-Api-Key header' };
	}

	try {
		const agent = await lookupApiKey(redis, rawKey);

		if (agent === null) {
			logger.warn('Unknown API key');
			return { valid: false, reason: 'Invalid API key' };
		}

		logger.debug({ agentId: agent.agentId }, 'API key validated');
		return { valid: true, agentId: agent.agentId };
	} catch (err) {
		logger.error({ err }, 'Redis error during API key validation');
		return { valid: false, reason: 'Internal server error' };
	}
}
