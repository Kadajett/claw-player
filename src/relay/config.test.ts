import { describe, expect, it } from 'vitest';
import { assertRelayClientConfig, assertRelayServerConfig, loadRelayConfig } from './config.js';

describe('loadRelayConfig', () => {
	it('returns defaults when no relay env vars set', () => {
		const config = loadRelayConfig();
		expect(config.RELAY_MODE).toBeUndefined();
		expect(config.RELAY_URL).toBeUndefined();
		expect(config.RELAY_SECRET).toBeUndefined();
		expect(config.RELAY_PORT).toBe(4000);
	});
});

describe('assertRelayServerConfig', () => {
	it('throws if RELAY_MODE is not server', () => {
		const config = { RELAY_MODE: 'client' as const, RELAY_SECRET: 'a'.repeat(16), RELAY_PORT: 4000 };
		expect(() => assertRelayServerConfig(config)).toThrow('RELAY_MODE must be "server"');
	});

	it('throws if RELAY_MODE is undefined', () => {
		const config = { RELAY_PORT: 4000 };
		expect(() => assertRelayServerConfig(config)).toThrow('RELAY_MODE must be "server"');
	});

	it('throws if RELAY_SECRET is missing', () => {
		const config = { RELAY_MODE: 'server' as const, RELAY_PORT: 4000 };
		expect(() => assertRelayServerConfig(config)).toThrow('RELAY_SECRET is required');
	});

	it('does not throw for valid server config', () => {
		const config = { RELAY_MODE: 'server' as const, RELAY_SECRET: 'a'.repeat(16), RELAY_PORT: 4000 };
		expect(() => assertRelayServerConfig(config)).not.toThrow();
	});
});

describe('assertRelayClientConfig', () => {
	it('throws if RELAY_MODE is not client', () => {
		const config = { RELAY_MODE: 'server' as const, RELAY_SECRET: 'a'.repeat(16), RELAY_PORT: 4000 };
		expect(() => assertRelayClientConfig(config)).toThrow('RELAY_MODE must be "client"');
	});

	it('throws if RELAY_URL is missing', () => {
		const config = { RELAY_MODE: 'client' as const, RELAY_SECRET: 'a'.repeat(16), RELAY_PORT: 4000 };
		expect(() => assertRelayClientConfig(config)).toThrow('RELAY_URL is required');
	});

	it('throws if RELAY_SECRET is missing', () => {
		const config = {
			RELAY_MODE: 'client' as const,
			RELAY_URL: 'ws://localhost:4000',
			RELAY_PORT: 4000,
		};
		expect(() => assertRelayClientConfig(config)).toThrow('RELAY_SECRET is required');
	});

	it('does not throw for valid client config', () => {
		const config = {
			RELAY_MODE: 'client' as const,
			RELAY_URL: 'ws://localhost:4000',
			RELAY_SECRET: 'a'.repeat(16),
			RELAY_PORT: 4000,
		};
		expect(() => assertRelayClientConfig(config)).not.toThrow();
	});
});
