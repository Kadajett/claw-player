import { describe, expect, it, vi } from 'vitest';
import { createRedisClient, createRedisSubscriber } from './client.js';

vi.mock('ioredis', () => {
	const mockOn = vi.fn().mockReturnThis();
	const MockRedis = vi.fn().mockImplementation(() => ({ on: mockOn }));
	return { Redis: MockRedis };
});

describe('createRedisClient', () => {
	it('returns an object with an on method', () => {
		const client = createRedisClient('redis://localhost:6379');
		expect(client).toBeDefined();
		expect(typeof client.on).toBe('function');
	});

	it('registers event handlers', () => {
		const client = createRedisClient('redis://localhost:6379');
		expect(client.on).toHaveBeenCalledWith('connect', expect.any(Function));
		expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
		expect(client.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
		expect(client.on).toHaveBeenCalledWith('close', expect.any(Function));
	});
});

describe('createRedisSubscriber', () => {
	it('returns a subscriber with event handlers', () => {
		const sub = createRedisSubscriber('redis://localhost:6379');
		expect(sub).toBeDefined();
		expect(sub.on).toHaveBeenCalledWith('error', expect.any(Function));
	});
});
