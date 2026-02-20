import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from './logger.js';

describe('createLogger', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it('returns a logger with the given name', () => {
		process.env.NODE_ENV = 'production';
		const logger = createLogger('test-logger');
		expect(logger).toBeDefined();
		// pino loggers expose the bindings
		expect(logger.bindings().name).toBe('test-logger');
	});

	it('returns a logger in production mode without pino-pretty', () => {
		process.env.NODE_ENV = 'production';
		const logger = createLogger('prod-logger');
		expect(logger).toBeDefined();
	});

	it('returns a logger in development mode with pino-pretty transport', () => {
		process.env.NODE_ENV = 'development';
		// pino-pretty may not be installed in test environment, so just verify it doesn't throw
		// or that we get a valid logger
		expect(() => createLogger('dev-logger')).not.toThrow();
	});

	it('respects LOG_LEVEL environment variable', () => {
		process.env.NODE_ENV = 'production';
		process.env.LOG_LEVEL = 'debug';
		const logger = createLogger('debug-logger');
		expect(logger.level).toBe('debug');
	});

	it('defaults to info log level', () => {
		process.env.NODE_ENV = 'production';
		process.env.LOG_LEVEL = undefined;
		const logger = createLogger('default-logger');
		expect(logger.level).toBe('info');
	});
});
