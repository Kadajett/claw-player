import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
	it('returns default config when no env vars set', () => {
		const config = loadConfig();
		expect(config.PORT).toBe(3000);
		expect(config.HOST).toBe('0.0.0.0');
		expect(config.NODE_ENV).toBe('test');
		expect(config.TICK_INTERVAL_MS).toBe(10000);
		expect(config.RATE_LIMIT_RPS).toBe(20);
		expect(config.RATE_LIMIT_BURST).toBe(30);
		expect(config.LOG_LEVEL).toBe('info');
	});
});
