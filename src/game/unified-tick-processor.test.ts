import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoteResult } from './types.js';
import { UnifiedTickProcessor } from './unified-tick-processor.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeVoteResult(overrides?: Partial<VoteResult>): VoteResult {
	return {
		tickId: 0,
		gameId: 'game-1',
		winningAction: 'a',
		voteCounts: { a: 5 },
		totalVotes: 5,
		...overrides,
	};
}

function makeMockEmulator() {
	const ram = new Array(65536).fill(0) as Array<number>;
	return {
		getRAM: vi.fn().mockResolvedValue(ram),
		pressButton: vi.fn().mockResolvedValue(undefined),
		advanceFrames: vi.fn().mockResolvedValue(undefined),
		isInitialized: true,
		loadRom: vi.fn().mockResolvedValue(undefined),
		readByte: vi.fn().mockResolvedValue(0),
		readWord: vi.fn().mockResolvedValue(0),
		readBytes: vi.fn().mockResolvedValue([]),
		advanceSeconds: vi.fn().mockResolvedValue(undefined),
		pressButtons: vi.fn().mockResolvedValue(undefined),
		waitMs: vi.fn().mockResolvedValue(undefined),
		shutdown: vi.fn().mockResolvedValue(undefined),
	};
}

function makeMockVoteAggregator(voteResult: VoteResult = makeVoteResult()) {
	return {
		tallyVotes: vi.fn().mockResolvedValue(voteResult),
		clearVotes: vi.fn().mockResolvedValue(undefined),
		recordVote: vi.fn().mockResolvedValue({ status: 'new' }),
	};
}

function makeMockRedis() {
	return {
		set: vi.fn().mockResolvedValue('OK'),
		publish: vi.fn().mockResolvedValue(1),
		xadd: vi.fn().mockResolvedValue('1-0'),
	};
}

const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

// ─── UnifiedTickProcessor ───────────────────────────────────────────────────

describe('UnifiedTickProcessor', () => {
	let emulator: ReturnType<typeof makeMockEmulator>;
	let voteAggregator: ReturnType<typeof makeMockVoteAggregator>;
	let redis: ReturnType<typeof makeMockRedis>;
	let processor: UnifiedTickProcessor;

	beforeEach(() => {
		vi.useFakeTimers();
		emulator = makeMockEmulator();
		voteAggregator = makeMockVoteAggregator();
		redis = makeMockRedis();
		processor = new UnifiedTickProcessor(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			emulator as any,
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			voteAggregator as any,
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			redis as any,
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			mockLogger as any,
			{ tickIntervalMs: 1000, emulatorSettleMs: 0, gameId: 'game-1' },
		);
		vi.clearAllMocks();
	});

	afterEach(() => {
		processor.stop();
		vi.useRealTimers();
	});

	describe('isRunning', () => {
		it('returns false when not started', () => {
			expect(processor.isRunning()).toBe(false);
		});

		it('returns true after start', () => {
			processor.start();
			expect(processor.isRunning()).toBe(true);
		});

		it('returns false after stop', () => {
			processor.start();
			processor.stop();
			expect(processor.isRunning()).toBe(false);
		});
	});

	describe('start', () => {
		it('throws when already running', () => {
			processor.start();
			expect(() => processor.start()).toThrow('already running');
		});
	});

	describe('getCurrentTick', () => {
		it('starts at 0', () => {
			expect(processor.getCurrentTick()).toBe(0);
		});

		it('increments after each tick', async () => {
			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);
			expect(processor.getCurrentTick()).toBe(1);

			await vi.advanceTimersByTimeAsync(1000);
			expect(processor.getCurrentTick()).toBe(2);
		});
	});

	describe('processTick with votes', () => {
		it('tallies votes, presses button, reads RAM, persists, and broadcasts', async () => {
			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			// 1. Tallied votes
			expect(voteAggregator.tallyVotes).toHaveBeenCalledWith('game-1', 0);

			// 2. Pressed button
			expect(emulator.pressButton).toHaveBeenCalledWith('A');

			// 3. Read RAM
			expect(emulator.getRAM).toHaveBeenCalled();

			// 4+5. Persisted state to Redis
			expect(redis.set).toHaveBeenCalledWith('game:state:game-1', expect.any(String));

			// 6. Broadcast via pub/sub
			expect(redis.publish).toHaveBeenCalledWith('game_state:game-1', expect.any(String));

			// 7. Cleared votes
			expect(voteAggregator.clearVotes).toHaveBeenCalledWith('game-1', 0);

			// 8. Appended event to stream
			expect(redis.xadd).toHaveBeenCalledWith(
				'game_events:game-1',
				'*',
				'type',
				'ACTION',
				'turn',
				'0',
				'action',
				'a',
				'votes',
				'5',
				'description',
				'Executed a (5 votes)',
			);
		});

		it('maps different actions to correct buttons', async () => {
			voteAggregator = makeMockVoteAggregator(makeVoteResult({ winningAction: 'up' }));
			processor = new UnifiedTickProcessor(
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				emulator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				voteAggregator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				redis as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				mockLogger as any,
				{ tickIntervalMs: 1000, emulatorSettleMs: 0, gameId: 'game-1' },
			);

			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			expect(emulator.pressButton).toHaveBeenCalledWith('UP');
		});
	});

	describe('processTick without votes', () => {
		it('does not press any button but still reads RAM and broadcasts', async () => {
			voteAggregator = makeMockVoteAggregator(makeVoteResult({ totalVotes: 0 }));
			processor = new UnifiedTickProcessor(
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				emulator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				voteAggregator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				redis as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				mockLogger as any,
				{ tickIntervalMs: 1000, emulatorSettleMs: 0, gameId: 'game-1' },
			);

			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			// No button pressed
			expect(emulator.pressButton).not.toHaveBeenCalled();

			// Still reads RAM
			expect(emulator.getRAM).toHaveBeenCalled();

			// Still persists and broadcasts
			expect(redis.set).toHaveBeenCalled();
			expect(redis.publish).toHaveBeenCalled();

			// Does not clear votes or append event
			expect(voteAggregator.clearVotes).not.toHaveBeenCalled();
			expect(redis.xadd).not.toHaveBeenCalled();
		});
	});

	describe('emulator settle time', () => {
		it('waits for settle time after button press', async () => {
			processor = new UnifiedTickProcessor(
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				emulator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				voteAggregator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				redis as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				mockLogger as any,
				{ tickIntervalMs: 1000, emulatorSettleMs: 500, gameId: 'game-1' },
			);

			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			expect(emulator.waitMs).toHaveBeenCalledWith(500);
		});

		it('does not wait when settle time is 0', async () => {
			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			expect(emulator.waitMs).not.toHaveBeenCalled();
		});
	});

	describe('multiple consecutive ticks', () => {
		it('executes multiple ticks without errors', async () => {
			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);

			expect(voteAggregator.tallyVotes).toHaveBeenCalledTimes(3);
			expect(voteAggregator.tallyVotes).toHaveBeenCalledWith('game-1', 0);
			expect(voteAggregator.tallyVotes).toHaveBeenCalledWith('game-1', 1);
			expect(voteAggregator.tallyVotes).toHaveBeenCalledWith('game-1', 2);
		});
	});

	describe('onTick callback', () => {
		it('fires callback with unified game state after each tick', async () => {
			const callback = vi.fn();
			processor.onTick(callback);

			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			expect(callback).toHaveBeenCalledTimes(1);
			const state = callback.mock.calls[0]?.[0];
			expect(state).toHaveProperty('gameId', 'game-1');
			expect(state).toHaveProperty('turn', 0);
			expect(state).toHaveProperty('phase');
		});

		it('fires callback even when no votes', async () => {
			voteAggregator = makeMockVoteAggregator(makeVoteResult({ totalVotes: 0 }));
			processor = new UnifiedTickProcessor(
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				emulator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				voteAggregator as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				redis as any,
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				mockLogger as any,
				{ tickIntervalMs: 1000, emulatorSettleMs: 0, gameId: 'game-1' },
			);

			const callback = vi.fn();
			processor.onTick(callback);

			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('handles callback errors gracefully', async () => {
			const badCallback = vi.fn().mockRejectedValue(new Error('callback error'));
			processor.onTick(badCallback);

			processor.start();
			vi.clearAllMocks();

			// Should not throw
			await vi.advanceTimersByTimeAsync(1000);

			expect(badCallback).toHaveBeenCalled();
			expect(mockLogger.error).toHaveBeenCalled();
		});
	});

	describe('state persistence format', () => {
		it('persists UnifiedGameState JSON to Redis', async () => {
			processor.start();
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			const stateJson = redis.set.mock.calls[0]?.[1] as string;
			const parsed = JSON.parse(stateJson) as Record<string, unknown>;

			// Verify it's a UnifiedGameState
			expect(parsed).toHaveProperty('gameId', 'game-1');
			expect(parsed).toHaveProperty('turn', 0);
			expect(parsed).toHaveProperty('phase');
			expect(parsed).toHaveProperty('player');
			expect(parsed).toHaveProperty('party');
			expect(parsed).toHaveProperty('inventory');
			expect(parsed).toHaveProperty('screen');
			expect(parsed).toHaveProperty('progress');
			// battle/overworld are null or populated depending on RAM
			expect(parsed).toHaveProperty('battle');
			expect(parsed).toHaveProperty('overworld');
		});
	});
});
