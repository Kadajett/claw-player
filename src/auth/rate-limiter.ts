import type { Redis } from 'ioredis';
import { runTokenBucket } from '../redis/lua-scripts.js';
import { PLAN_BURST, PLAN_RPS } from '../types/api.js';
import type { ApiKeyMetadata } from '../types/api.js';

export async function checkRateLimit(
	client: Redis,
	agentId: string,
	rpsLimit: number,
	burst: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
	const key = `rl:${agentId}`;
	const nowMs = Date.now();

	const result = await runTokenBucket(client, key, nowMs, rpsLimit, burst, 1);

	const retryAfterMs = result.allowed ? 0 : Math.ceil((1 / rpsLimit) * 1000);

	return {
		allowed: result.allowed,
		remaining: result.remaining,
		retryAfterMs,
	};
}

export function getRateLimitBurst(agent: ApiKeyMetadata): number {
	return PLAN_BURST[agent.plan] ?? PLAN_RPS[agent.plan] * 2;
}
