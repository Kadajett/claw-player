import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';

const RECONNECT_MAX_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 100;

function buildRedisOptions(_url: string): RedisOptions {
	return {
		lazyConnect: true,
		maxRetriesPerRequest: 3,
		enableReadyCheck: true,
		retryStrategy(times: number): number | null {
			if (times > RECONNECT_MAX_ATTEMPTS) {
				return null;
			}
			return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (times - 1), 5000);
		},
		reconnectOnError(err: Error): boolean | 1 | 2 {
			const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
			return targetErrors.some((e) => err.message.includes(e)) ? 1 : false;
		},
	};
}

export function createRedisClient(url: string): Redis {
	const options = buildRedisOptions(url);
	const client = new Redis(url, options);

	client.on('error', (err: Error) => {
		process.stderr.write(`[redis] connection error: ${err.message}\n`);
	});

	client.on('reconnecting', () => {
		process.stderr.write('[redis] reconnecting...\n');
	});

	return client;
}

export function createRedisSubscriber(url: string): Redis {
	const options = buildRedisOptions(url);
	const subscriber = new Redis(url, options);

	subscriber.on('error', (err: Error) => {
		process.stderr.write(`[redis:sub] connection error: ${err.message}\n`);
	});

	return subscriber;
}
