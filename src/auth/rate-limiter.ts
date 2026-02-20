import type { Request, Response } from 'hyper-express';
import type { Redis } from 'ioredis';
import { runTokenBucket } from '../redis/lua-scripts.js';
import { PLAN_BURST, PLAN_RPS } from '../types/api.js';
import type { ApiKeyMetadata } from '../types/api.js';

const RATE_LIMIT_KEY_PREFIX = 'rl:';

export const AGENT_LOCALS_KEY = 'agent';

export function getAgentFromLocals(req: Request): ApiKeyMetadata | undefined {
	const agent = req.locals[AGENT_LOCALS_KEY] as ApiKeyMetadata | undefined;
	return agent;
}

export async function checkRateLimit(
	client: Redis,
	agentId: string,
	rpsLimit: number,
	burst: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
	const key = `${RATE_LIMIT_KEY_PREFIX}${agentId}`;
	const nowMs = Date.now();

	const result = await runTokenBucket(client, key, nowMs, rpsLimit, burst, 1);

	const retryAfterMs = result.allowed ? 0 : Math.ceil((1 / rpsLimit) * 1000);

	return {
		allowed: result.allowed,
		remaining: result.remaining,
		retryAfterMs,
	};
}

export function buildRateLimitMiddleware(client: Redis) {
	return async function rateLimitMiddleware(req: Request, res: Response): Promise<void> {
		const agent = getAgentFromLocals(req);

		if (!agent) {
			res.status(401).json({ error: 'Unauthorized', code: 'MISSING_AUTH' });
			return;
		}

		const burst = PLAN_BURST[agent.plan] ?? PLAN_RPS[agent.plan] * 2;
		const result = await checkRateLimit(client, agent.agentId, agent.rpsLimit, burst);

		res.header('X-RateLimit-Limit', String(agent.rpsLimit));
		res.header('X-RateLimit-Remaining', String(result.remaining));

		if (!result.allowed) {
			res.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
			res.status(429).json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
			return;
		}
	};
}
