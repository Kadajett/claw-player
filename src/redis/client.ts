import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'redis-client' });

export function createRedisClient(redisUrl: string): Redis {
	const client = new Redis(redisUrl, {
		lazyConnect: true,
		maxRetriesPerRequest: 3,
		enableOfflineQueue: false,
	});

	client.on('connect', () => {
		logger.info('Redis connected');
	});

	client.on('error', (err: unknown) => {
		logger.error({ err }, 'Redis error');
	});

	client.on('close', () => {
		logger.info('Redis connection closed');
	});

	return client;
}
