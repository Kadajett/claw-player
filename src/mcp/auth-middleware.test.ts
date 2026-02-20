import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateApiKey } from './auth-middleware.js';

function hashKey(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

function makeRequest(headers: Record<string, string>): IncomingMessage {
	return { headers, url: '/mcp' } as unknown as IncomingMessage;
}

function makeRedis(hgetResult: string | null | Error): ReturnType<typeof vi.fn> {
	return {
		hget: hgetResult instanceof Error ? vi.fn().mockRejectedValue(hgetResult) : vi.fn().mockResolvedValue(hgetResult),
	};
}

describe('validateApiKey', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns valid with agentId when key is found in Redis', async () => {
		const rawKey = 'test-api-key-12345';
		const redis = makeRedis('agent-xyz');
		const req = makeRequest({ 'x-api-key': rawKey });

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const result = await validateApiKey(req, redis as any);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.agentId).toBe('agent-xyz');
		}
		expect(redis.hget).toHaveBeenCalledWith('api_keys', hashKey(rawKey));
	});

	it('returns invalid when key is not in Redis', async () => {
		const redis = makeRedis(null);
		const req = makeRequest({ 'x-api-key': 'unknown-key' });

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const result = await validateApiKey(req, redis as any);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.reason).toBe('Invalid API key');
		}
	});

	it('returns invalid when X-Api-Key header is missing', async () => {
		const redis = makeRedis(null);
		const req = makeRequest({});

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const result = await validateApiKey(req, redis as any);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.reason).toBe('Missing X-Api-Key header');
		}
		expect(redis.hget).not.toHaveBeenCalled();
	});

	it('returns invalid when X-Api-Key header is empty', async () => {
		const redis = makeRedis(null);
		const req = makeRequest({ 'x-api-key': '' });

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const result = await validateApiKey(req, redis as any);

		expect(result.valid).toBe(false);
		expect(redis.hget).not.toHaveBeenCalled();
	});

	it('returns invalid when Redis throws', async () => {
		const redis = makeRedis(new Error('Redis connection failed'));
		const req = makeRequest({ 'x-api-key': 'some-key' });

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const result = await validateApiKey(req, redis as any);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.reason).toBe('Internal server error');
		}
	});

	it('hashes different keys to different hashes', async () => {
		const redis1 = makeRedis('agent-1');
		const redis2 = makeRedis(null);
		const req1 = makeRequest({ 'x-api-key': 'key-a' });
		const req2 = makeRequest({ 'x-api-key': 'key-b' });

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		await validateApiKey(req1, redis1 as any);
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		await validateApiKey(req2, redis2 as any);

		const hash1 = redis1.hget.mock.calls[0]?.[1] as string;
		const hash2 = redis2.hget.mock.calls[0]?.[1] as string;
		expect(hash1).not.toBe(hash2);
	});
});
