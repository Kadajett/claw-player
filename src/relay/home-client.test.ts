import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeClient } from './home-client.js';
import type { RelayVoteBatch } from './types.js';

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

// Fake WebSocket implementation for testing
type EventHandler = (...args: Array<unknown>) => void;

class FakeWebSocket {
	readonly url: string;
	readyState = 0; // CONNECTING
	sentMessages: Array<string> = [];
	private handlers: Map<string, Array<EventHandler>> = new Map();
	closed = false;

	constructor(url: string) {
		this.url = url;
	}

	addEventListener(event: string, handler: EventHandler): void {
		const existing = this.handlers.get(event) ?? [];
		existing.push(handler);
		this.handlers.set(event, existing);
	}

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(): void {
		this.closed = true;
		this.readyState = 3; // CLOSED
	}

	// Test helpers to simulate server events
	simulateOpen(): void {
		this.readyState = 1; // OPEN
		const handlers = this.handlers.get('open') ?? [];
		for (const h of handlers) h();
	}

	simulateMessage(data: string): void {
		const handlers = this.handlers.get('message') ?? [];
		for (const h of handlers) h(data);
	}

	simulateClose(): void {
		this.readyState = 3; // CLOSED
		const handlers = this.handlers.get('close') ?? [];
		for (const h of handlers) h();
	}

	simulateError(err: Error): void {
		const handlers = this.handlers.get('error') ?? [];
		for (const h of handlers) h(err);
	}
}

const validGameState = {
	gameId: 'game-1',
	turn: 5,
	phase: 'battle' as const,
	player: {
		name: 'RED',
		money: 1000,
		badges: 2,
		badgeList: ['Boulder', 'Cascade'],
		location: { mapId: 1, mapName: 'Route 1', x: 10, y: 20 },
		direction: 'down' as const,
		walkBikeSurf: 'walking' as const,
	},
	party: [],
	inventory: [],
	battle: null,
	overworld: null,
	screen: { textBoxActive: false, menuState: null, menuText: null, screenText: null },
	progress: { playTimeHours: 1, playTimeMinutes: 30, pokedexOwned: 5, pokedexSeen: 10 },
};

// biome-ignore lint/style/useNamingConvention: WebSocket is a standard Web API name
type GlobalWithWebSocket = { WebSocket?: unknown };

function setGlobalWs(impl: unknown): void {
	(globalThis as unknown as GlobalWithWebSocket).WebSocket = impl;
}

function getGlobalWsCtor(): ReturnType<typeof vi.fn> | undefined {
	// biome-ignore lint/style/useNamingConvention: WebSocket is a standard Web API name
	return (globalThis as unknown as { WebSocket?: ReturnType<typeof vi.fn> }).WebSocket;
}

function clearGlobalWs(): void {
	(globalThis as unknown as GlobalWithWebSocket).WebSocket = undefined;
}

describe('HomeClient', () => {
	let logger: Logger;
	let fakeWs: FakeWebSocket;
	let onVoteBatch: ReturnType<typeof vi.fn>;
	let getState: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		logger = makeLogger();
		fakeWs = new FakeWebSocket('ws://relay.test');
		onVoteBatch = vi.fn();
		getState = vi.fn().mockReturnValue(null);

		setGlobalWs(vi.fn().mockImplementation(() => fakeWs));
	});

	afterEach(() => {
		clearGlobalWs();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	function makeClient(): HomeClient {
		return new HomeClient({
			relayUrl: 'ws://relay.test',
			relaySecret: 'test-secret-12345',
			onVoteBatch,
			getState,
			logger,
		});
	}

	describe('isConnected', () => {
		it('returns false initially', () => {
			const client = makeClient();
			expect(client.isConnected()).toBe(false);
		});

		it('returns true after WebSocket opens', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			expect(client.isConnected()).toBe(true);
		});

		it('returns false after WebSocket closes', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			fakeWs.simulateClose();
			expect(client.isConnected()).toBe(false);
		});
	});

	describe('start and stop', () => {
		it('attempts connection on start', () => {
			const client = makeClient();
			client.start();
			expect(getGlobalWsCtor()).toHaveBeenCalledWith('ws://relay.test');
		});

		it('closes WebSocket on stop', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			client.stop();
			expect(fakeWs.closed).toBe(true);
		});

		it('stop prevents reconnection', () => {
			vi.useFakeTimers();
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			client.stop();
			const wsCtor = getGlobalWsCtor();
			const callsBefore = wsCtor?.mock.calls.length ?? 0;
			fakeWs.simulateClose();
			vi.advanceTimersByTime(60_000);
			const callsAfter = wsCtor?.mock.calls.length ?? 0;
			expect(callsAfter).toBe(callsBefore);
		});
	});

	describe('authentication on connect', () => {
		it('sends secret on open', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			expect(fakeWs.sentMessages.length).toBeGreaterThan(0);
			const authMsg = JSON.parse(fakeWs.sentMessages[0] ?? '{}') as { secret?: string };
			expect(authMsg.secret).toBe('test-secret-12345');
		});
	});

	describe('heartbeat handling', () => {
		it('responds to relay heartbeat with heartbeat_ack', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			const sentBefore = fakeWs.sentMessages.length;

			const heartbeat = JSON.stringify({ type: 'heartbeat', timestamp: 1_700_000_000 });
			fakeWs.simulateMessage(heartbeat);

			const sentAfter = fakeWs.sentMessages.length;
			expect(sentAfter).toBeGreaterThan(sentBefore);
			const ackMsg = JSON.parse(fakeWs.sentMessages[fakeWs.sentMessages.length - 1] ?? '{}') as {
				type: string;
				timestamp: number;
			};
			expect(ackMsg.type).toBe('heartbeat_ack');
			expect(ackMsg.timestamp).toBe(1_700_000_000);
		});
	});

	describe('vote batch handling', () => {
		it('calls onVoteBatch when vote_batch received', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();

			const batch: RelayVoteBatch = {
				type: 'vote_batch',
				tickId: 3,
				gameId: 'game-1',
				votes: [{ agentId: 'agent-1', action: 'a', timestamp: 1_700_000_000 }],
			};

			fakeWs.simulateMessage(JSON.stringify(batch));
			expect(onVoteBatch).toHaveBeenCalledWith(batch);
		});
	});

	describe('pushState', () => {
		it('sends state_push when connected', async () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			const sentBefore = fakeWs.sentMessages.length;

			await client.pushState(5, 'game-1', validGameState);

			const sentAfter = fakeWs.sentMessages.length;
			expect(sentAfter).toBeGreaterThan(sentBefore);
			const msg = JSON.parse(fakeWs.sentMessages[fakeWs.sentMessages.length - 1] ?? '{}') as {
				type: string;
				tickId: number;
			};
			expect(msg.type).toBe('state_push');
			expect(msg.tickId).toBe(5);
		});

		it('does not throw when not connected', async () => {
			const client = makeClient();
			await expect(client.pushState(5, 'game-1', validGameState)).resolves.toBeUndefined();
		});
	});

	describe('error handling', () => {
		it('handles invalid JSON from relay gracefully', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			expect(() => fakeWs.simulateMessage('not-json{')).not.toThrow();
		});

		it('handles unknown message types gracefully', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			expect(() => fakeWs.simulateMessage(JSON.stringify({ type: 'unknown_type_xyz' }))).not.toThrow();
		});

		it('handles relay error message', () => {
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();
			const errorMsg = JSON.stringify({ type: 'error', code: 'AUTH_FAILED', message: 'Bad secret' });
			expect(() => fakeWs.simulateMessage(errorMsg)).not.toThrow();
			expect(logger.error).toHaveBeenCalled();
		});
	});

	describe('reconnect behavior', () => {
		it('schedules reconnect after close', () => {
			vi.useFakeTimers();
			const client = makeClient();
			client.start();
			fakeWs.simulateOpen();

			const wsCtor = getGlobalWsCtor();
			const callsBefore = wsCtor?.mock.calls.length ?? 0;

			const newFakeWs = new FakeWebSocket('ws://relay.test');
			setGlobalWs(vi.fn().mockImplementation(() => newFakeWs));

			fakeWs.simulateClose();

			// Advance past base reconnect delay + jitter (100ms + up to 500ms)
			vi.advanceTimersByTime(700);

			const wsCtor2 = getGlobalWsCtor();
			expect((wsCtor2?.mock.calls.length ?? 0) + callsBefore).toBeGreaterThan(callsBefore);
		});
	});
});
