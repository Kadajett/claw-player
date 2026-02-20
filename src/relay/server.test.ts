import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock uWebSockets.js before importing RelayServer so native bindings are not loaded
vi.mock('uWebSockets.js', () => {
	const mockApp = {
		get: vi.fn().mockReturnThis(),
		post: vi.fn().mockReturnThis(),
		ws: vi.fn().mockReturnThis(),
		listen: vi.fn((_port: number, cb: (token: unknown) => void) => {
			cb({}); // fake listen socket
			return mockApp;
		}),
		close: vi.fn().mockReturnThis(),
		publish: vi.fn().mockReturnValue(true),
	};

	return {
		default: {
			App: () => mockApp,
			DISABLED: 0,
			// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
			us_listen_socket_close: vi.fn(),
		},
		App: () => mockApp,
		DISABLED: 0,
		// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
		us_listen_socket_close: vi.fn(),
	};
});

import { RelayServer } from './server.js';

// Minimal pino logger mock
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

describe('RelayServer', () => {
	let logger: Logger;

	beforeEach(() => {
		logger = makeLogger();
	});

	describe('getCachedState', () => {
		it('returns null initially', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			expect(server.getCachedState()).toBeNull();
		});
	});

	describe('getBufferedVoteCount', () => {
		it('returns 0 initially', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			expect(server.getBufferedVoteCount()).toBe(0);
		});
	});

	describe('bufferVote', () => {
		it('increments buffered vote count', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			server.bufferVote('agent-1', { agentId: 'agent-1', action: 'move:0', timestamp: Date.now() });
			expect(server.getBufferedVoteCount()).toBe(1);
		});

		it('overwrites previous vote for same agent (one vote per agent per tick)', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			server.bufferVote('agent-1', { agentId: 'agent-1', action: 'move:0', timestamp: Date.now() });
			server.bufferVote('agent-1', { agentId: 'agent-1', action: 'move:1', timestamp: Date.now() });
			expect(server.getBufferedVoteCount()).toBe(1);
		});

		it('accepts votes from multiple agents', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			server.bufferVote('agent-1', { agentId: 'agent-1', action: 'move:0', timestamp: Date.now() });
			server.bufferVote('agent-2', { agentId: 'agent-2', action: 'move:1', timestamp: Date.now() });
			expect(server.getBufferedVoteCount()).toBe(2);
		});
	});

	describe('constructor', () => {
		it('creates a server instance without throwing', () => {
			expect(() => new RelayServer('secret1234567890', 4000, logger)).not.toThrow();
		});

		it('exposes uWS app via getApp()', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			expect(server.getApp()).toBeDefined();
		});
	});

	describe('vote buffering by agentId', () => {
		it('buffers multiple distinct agents', () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			const ts = Date.now();
			server.bufferVote('agent-42', { agentId: 'agent-42', action: 'run', timestamp: ts });
			server.bufferVote('agent-99', { agentId: 'agent-99', action: 'switch:0', timestamp: ts });
			expect(server.getBufferedVoteCount()).toBe(2);
		});
	});

	it('has null cached state initially', () => {
		const server = new RelayServer('my-relay-secret-123', 5000, logger);
		expect(server.getCachedState()).toBeNull();
		expect(server.getBufferedVoteCount()).toBe(0);
	});

	it('bufferVote accepts all valid action types', () => {
		const server = new RelayServer('secret1234567890', 4000, logger);
		server.bufferVote('a1', { agentId: 'a1', action: 'move:0', timestamp: 1_700_000_000 });
		server.bufferVote('a2', { agentId: 'a2', action: 'move:3', timestamp: 1_700_000_000 });
		server.bufferVote('a3', { agentId: 'a3', action: 'switch:0', timestamp: 1_700_000_000 });
		server.bufferVote('a4', { agentId: 'a4', action: 'switch:5', timestamp: 1_700_000_000 });
		server.bufferVote('a5', { agentId: 'a5', action: 'run', timestamp: 1_700_000_000 });
		expect(server.getBufferedVoteCount()).toBe(5);
	});

	describe('listen and close', () => {
		it('listen resolves without error', async () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			await expect(server.listen()).resolves.toBeUndefined();
		});

		it('close resolves without error after listen', async () => {
			const server = new RelayServer('secret1234567890', 4000, logger);
			await server.listen();
			await expect(server.close()).resolves.toBeUndefined();
		});
	});
});
