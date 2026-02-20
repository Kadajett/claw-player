import type { Request, Response } from 'hyper-express';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyMetadata } from '../types/api.js';
import { buildRateLimitMiddleware, checkRateLimit, getAgentFromLocals } from './rate-limiter.js';

vi.mock('../redis/lua-scripts.js', () => ({
	runTokenBucket: vi.fn(),
}));

import { runTokenBucket } from '../redis/lua-scripts.js';

const mockRunTokenBucket = vi.mocked(runTokenBucket);

describe('getAgentFromLocals', () => {
	it('returns agent when present in locals', () => {
		const agent: ApiKeyMetadata = { agentId: 'a1', plan: 'free', rpsLimit: 5, createdAt: 1 };
		const req = { locals: { agent } } as unknown as Request;
		expect(getAgentFromLocals(req)).toEqual(agent);
	});

	it('returns undefined when agent missing', () => {
		const req = { locals: {} } as unknown as Request;
		expect(getAgentFromLocals(req)).toBeUndefined();
	});
});

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

describe('buildRateLimitMiddleware', () => {
	const makeRes = () => {
		const res: Partial<Response> = {
			status: vi.fn().mockReturnThis() as unknown as Response['status'],
			json: vi.fn().mockReturnThis() as unknown as Response['json'],
			header: vi.fn().mockReturnThis() as unknown as Response['header'],
		};
		return res as Response;
	};

	it('returns 401 when no agent in locals', async () => {
		const client = {} as unknown as Redis;
		const middleware = buildRateLimitMiddleware(client);
		const req = { locals: {} } as unknown as Request;
		const res = makeRes();

		await middleware(req, res);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_AUTH' }));
	});

	it('returns 429 when rate limited', async () => {
		mockRunTokenBucket.mockResolvedValue({ allowed: false, remaining: 0 });
		const client = {} as unknown as Redis;
		const middleware = buildRateLimitMiddleware(client);

		const agent: ApiKeyMetadata = { agentId: 'a1', plan: 'standard', rpsLimit: 20, createdAt: 1 };
		const req = { locals: { agent } } as unknown as Request;
		const res = makeRes();

		await middleware(req, res);

		expect(res.status).toHaveBeenCalledWith(429);
		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED' }));
	});

	it('sets rate limit headers and proceeds when allowed', async () => {
		mockRunTokenBucket.mockResolvedValue({ allowed: true, remaining: 18 });
		const client = {} as unknown as Redis;
		const middleware = buildRateLimitMiddleware(client);

		const agent: ApiKeyMetadata = { agentId: 'a1', plan: 'standard', rpsLimit: 20, createdAt: 1 };
		const req = { locals: { agent } } as unknown as Request;
		const res = makeRes();

		await middleware(req, res);

		expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', '20');
		expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '18');
		expect(res.status).not.toHaveBeenCalledWith(429);
		expect(res.json).not.toHaveBeenCalled();
	});
});
