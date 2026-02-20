import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyMetadata } from '../types/api.js';
import { checkRateLimit, getRateLimitBurst } from './rate-limiter.js';

vi.mock('../redis/lua-scripts.js', () => ({
	runTokenBucket: vi.fn(),
}));

import { runTokenBucket } from '../redis/lua-scripts.js';

const mockRunTokenBucket = vi.mocked(runTokenBucket);

describe('checkRateLimit', () => {
	it('returns allowed=true with correct retryAfterMs=0', async () => {
		mockRunTokenBucket.mockResolvedValue({ allowed: true, remaining: 15 });
		const client = {} as unknown as Redis;

		const result = await checkRateLimit(client, 'agent-1', 20, 30);

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(15);
		expect(result.retryAfterMs).toBe(0);
	});

	it('returns allowed=false with positive retryAfterMs', async () => {
		mockRunTokenBucket.mockResolvedValue({ allowed: false, remaining: 0 });
		const client = {} as unknown as Redis;

		const result = await checkRateLimit(client, 'agent-1', 20, 30);

		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBeGreaterThan(0);
	});
});

describe('getRateLimitBurst', () => {
	it('returns PLAN_BURST value for known plan', () => {
		const agent: ApiKeyMetadata = { agentId: 'a1', plan: 'standard', rpsLimit: 20, createdAt: 1 };
		const burst = getRateLimitBurst(agent);
		expect(burst).toBeGreaterThan(0);
	});

	it('falls back to rpsLimit * 2 for unknown plan', () => {
		const agent = { agentId: 'a1', plan: 'custom' as 'free', rpsLimit: 10, createdAt: 1 };
		const burst = getRateLimitBurst(agent);
		expect(burst).toBe(20);
	});
});
