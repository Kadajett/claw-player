import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { generateApiKey, registerAgent } from './registration.js';

function makeLogger(): Logger {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		trace: vi.fn(),
		fatal: vi.fn(),
		child: vi.fn(),
		level: 'info',
		silent: vi.fn(),
		isLevelEnabled: vi.fn(),
	} as unknown as Logger;
}

function makeRedis(overrides?: { setResult?: string | null }) {
	const setResult = overrides !== undefined && 'setResult' in overrides ? overrides.setResult : 'OK';
	return {
		set: vi.fn().mockResolvedValue(setResult),
		hset: vi.fn().mockResolvedValue(4),
	} as unknown as Redis;
}

describe('generateApiKey', () => {
	it('starts with cgp_ prefix', () => {
		const key = generateApiKey();
		expect(key.startsWith('cgp_')).toBe(true);
	});

	it('has correct length: cgp_ + 64 hex chars = 68 total', () => {
		const key = generateApiKey();
		expect(key).toHaveLength(68);
	});

	it('hex portion is valid hex', () => {
		const key = generateApiKey();
		const hex = key.slice(4);
		expect(hex).toMatch(/^[0-9a-f]{64}$/);
	});

	it('generates unique keys', () => {
		const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
		expect(keys.size).toBe(10);
	});
});

describe('registerAgent', () => {
	it('succeeds for a new agentId', async () => {
		const redis = makeRedis();
		const logger = makeLogger();

		const result = await registerAgent(redis, 'my-agent', logger);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.response.agentId).toBe('my-agent');
			expect(result.response.plan).toBe('free');
			expect(result.response.rpsLimit).toBe(5);
			expect(result.response.apiKey).toMatch(/^cgp_[0-9a-f]{64}$/);
		}
	});

	it('returns error when agentId is already taken', async () => {
		const redis = makeRedis({ setResult: null });
		const logger = makeLogger();

		const result = await registerAgent(redis, 'taken-agent', logger);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('AGENT_ID_TAKEN');
			expect(result.message).toContain('taken-agent');
		}
	});

	it('uses SET NX for atomic uniqueness check', async () => {
		const redis = makeRedis();
		const logger = makeLogger();

		await registerAgent(redis, 'test-agent', logger);

		// First call to redis.set should be the NX check
		const firstCall = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as Array<unknown>;
		expect(firstCall[0]).toBe('agent:registered:test-agent');
		expect(firstCall[2]).toBe('NX');
	});

	it('stores the API key via hset after registration', async () => {
		const redis = makeRedis();
		const logger = makeLogger();

		await registerAgent(redis, 'new-agent', logger);

		expect(redis.hset).toHaveBeenCalledOnce();
		const [key, data] = (redis.hset as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, string>];
		expect(key).toMatch(/^api-key:[0-9a-f]{64}$/);
		expect(data.agentId).toBe('new-agent');
		expect(data.plan).toBe('free');
	});

	it('logs on successful registration', async () => {
		const redis = makeRedis();
		const logger = makeLogger();

		await registerAgent(redis, 'log-agent', logger);

		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ agentId: 'log-agent', plan: 'free' }),
			'Agent registered',
		);
	});

	it('logs warning on duplicate registration', async () => {
		const redis = makeRedis({ setResult: null });
		const logger = makeLogger();

		await registerAgent(redis, 'dupe-agent', logger);

		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ agentId: 'dupe-agent' }),
			'Registration rejected: agentId already taken',
		);
	});

	it('does not store API key when registration fails', async () => {
		const redis = makeRedis({ setResult: null });
		const logger = makeLogger();

		await registerAgent(redis, 'dupe', logger);

		expect(redis.hset).not.toHaveBeenCalled();
	});

	it('accepts custom plan parameter', async () => {
		const redis = makeRedis();
		const logger = makeLogger();

		const result = await registerAgent(redis, 'premium-agent', logger, 'premium');

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.response.plan).toBe('premium');
			expect(result.response.rpsLimit).toBe(100);
		}
	});
});
