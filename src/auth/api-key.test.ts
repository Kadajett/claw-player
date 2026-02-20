import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyMetadata } from '../types/api.js';
import { hashApiKey, lookupApiKey, redisKeyForHash, revokeApiKey, storeApiKey } from './api-key.js';

describe('hashApiKey', () => {
	it('returns a 64-character hex string', () => {
		const hash = hashApiKey('test-key-123');
		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});

	it('produces deterministic output', () => {
		const key = 'my-secret-api-key';
		expect(hashApiKey(key)).toBe(hashApiKey(key));
	});

	it('produces different hashes for different inputs', () => {
		expect(hashApiKey('key-a')).not.toBe(hashApiKey('key-b'));
	});
});

describe('redisKeyForHash', () => {
	it('prefixes hash with api-key:', () => {
		const hash = 'abc123';
		expect(redisKeyForHash(hash)).toBe('api-key:abc123');
	});
});

describe('lookupApiKey', () => {
	it('returns null when key not found', async () => {
		const client = { hgetall: vi.fn().mockResolvedValue({}) } as unknown as Redis;
		const result = await lookupApiKey(client, 'nonexistent-key');
		expect(result).toBeNull();
	});

	it('returns null when Redis returns null', async () => {
		const client = { hgetall: vi.fn().mockResolvedValue(null) } as unknown as Redis;
		const result = await lookupApiKey(client, 'some-key');
		expect(result).toBeNull();
	});

	it('returns parsed metadata for valid data', async () => {
		const mockData = {
			agentId: 'agent-42',
			plan: 'standard',
			rpsLimit: '20',
			createdAt: '1700000000000',
		};
		const client = { hgetall: vi.fn().mockResolvedValue(mockData) } as unknown as Redis;

		const result = await lookupApiKey(client, 'valid-key');
		expect(result).toEqual({
			agentId: 'agent-42',
			plan: 'standard',
			rpsLimit: 20,
			createdAt: 1700000000000,
		});
	});

	it('returns null when data has invalid schema', async () => {
		const badData = { agentId: 'x', plan: 'unknown-plan', rpsLimit: '5', createdAt: '123' };
		const client = { hgetall: vi.fn().mockResolvedValue(badData) } as unknown as Redis;

		const result = await lookupApiKey(client, 'bad-key');
		expect(result).toBeNull();
	});
});

describe('storeApiKey', () => {
	it('calls hset with hashed key and stringified metadata', async () => {
		const hset = vi.fn().mockResolvedValue(4);
		const client = { hset } as unknown as Redis;

		const metadata: ApiKeyMetadata = {
			agentId: 'agent-1',
			plan: 'premium',
			rpsLimit: 100,
			createdAt: 1700000000000,
		};

		await storeApiKey(client, 'raw-key', metadata);

		expect(hset).toHaveBeenCalledOnce();
		const [key, data] = hset.mock.calls[0] as [string, Record<string, string>];
		expect(key).toMatch(/^api-key:[0-9a-f]{64}$/);
		expect(data.agentId).toBe('agent-1');
		expect(data.plan).toBe('premium');
		expect(data.rpsLimit).toBe('100');
	});
});

describe('revokeApiKey', () => {
	it('calls del with the hashed key', async () => {
		const del = vi.fn().mockResolvedValue(1);
		const client = { del } as unknown as Redis;

		await revokeApiKey(client, 'my-key');

		expect(del).toHaveBeenCalledOnce();
		const [key] = del.mock.calls[0] as [string];
		expect(key).toMatch(/^api-key:[0-9a-f]{64}$/);
	});
});
