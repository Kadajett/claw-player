import { describe, expect, it } from 'vitest';
import { createRedisClient } from './client.js';

describe('createRedisClient', () => {
	it('creates a Redis client with the given URL', () => {
		const client = createRedisClient('redis://localhost:6379');
		expect(client).toBeDefined();
		// Client is created with lazyConnect so it doesn't actually connect
		client.disconnect();
	});

	it('creates clients with different connection URLs independently', () => {
		const client1 = createRedisClient('redis://localhost:6379/0');
		const client2 = createRedisClient('redis://localhost:6379/1');
		expect(client1).not.toBe(client2);
		client1.disconnect();
		client2.disconnect();
	});
});
