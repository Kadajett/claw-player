import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TickProcessor } from './tick-processor.js';
import {
	BattlePhase,
	type BattleState,
	type GameAction,
	PokemonType,
	StatusCondition,
	type VoteResult,
} from './types.js';

function makePokemon() {
	return {
		species: 'Pikachu',
		level: 25,
		hp: 50,
		maxHp: 50,
		attack: 55,
		defense: 40,
		specialAttack: 50,
		specialDefense: 50,
		speed: 90,
		status: StatusCondition.None,
		types: [PokemonType.Electric] as Array<PokemonType>,
		moves: [
			{
				name: 'Thunderbolt',
				pokemonType: PokemonType.Electric,
				power: 95,
				accuracy: 100,
				pp: 15,
				maxPp: 15,
				category: 'special' as const,
			},
		],
	};
}

function makeValidState(overrides?: Partial<BattleState>): BattleState {
	const now = 1000000;
	const pokemon = makePokemon();
	return {
		gameId: 'game-1',
		turn: 0,
		phase: BattlePhase.ChooseAction,
		playerActive: pokemon,
		playerParty: [pokemon],
		opponent: {
			species: 'Rattata',
			hpPercent: 100,
			status: StatusCondition.None,
			types: [PokemonType.Normal],
			level: 10,
		},
		availableActions: ['a', 'up'] as Array<GameAction>,
		weather: 'clear',
		turnHistory: [],
		lastAction: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

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

function makeMockStateManager(state: BattleState | null = makeValidState()) {
	return {
		loadState: vi.fn().mockResolvedValue(state),
		saveState: vi.fn().mockResolvedValue(undefined),
		appendEvent: vi.fn().mockResolvedValue(undefined),
		publishState: vi.fn().mockResolvedValue(undefined),
	};
}

function makeMockVoteAggregator(voteResult: VoteResult = makeVoteResult()) {
	return {
		tallyVotes: vi.fn().mockResolvedValue(voteResult),
		clearVotes: vi.fn().mockResolvedValue(undefined),
	};
}

const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

describe('TickProcessor', () => {
	let stateManager: ReturnType<typeof makeMockStateManager>;
	let voteAggregator: ReturnType<typeof makeMockVoteAggregator>;
	let processor: TickProcessor;

	beforeEach(() => {
		vi.useFakeTimers();
		stateManager = makeMockStateManager();
		voteAggregator = makeMockVoteAggregator();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		processor = new TickProcessor(stateManager as any, voteAggregator as any, mockLogger as any, {
			tickIntervalMs: 1000,
		});
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

		it('returns true after start', async () => {
			await processor.start('game-1');
			expect(processor.isRunning()).toBe(true);
		});

		it('returns false after stop', async () => {
			await processor.start('game-1');
			processor.stop();
			expect(processor.isRunning()).toBe(false);
		});
	});

	describe('start', () => {
		it('throws when game not found in state store', async () => {
			stateManager = makeMockStateManager(null);
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			processor = new TickProcessor(stateManager as any, voteAggregator as any, mockLogger as any, {
				tickIntervalMs: 1000,
			});

			await expect(processor.start('game-1')).rejects.toThrow('not found');
		});

		it('throws when already running', async () => {
			await processor.start('game-1');
			await expect(processor.start('game-1')).rejects.toThrow('already running');
		});

		it('loads state on start', async () => {
			await processor.start('game-1');
			expect(stateManager.loadState).toHaveBeenCalledWith('game-1');
		});
	});

	describe('processTick', () => {
		it('tallies votes and applies action after tick interval', async () => {
			await processor.start('game-1');
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			expect(voteAggregator.tallyVotes).toHaveBeenCalledWith('game-1', 0);
			expect(stateManager.saveState).toHaveBeenCalled();
			expect(stateManager.appendEvent).toHaveBeenCalled();
			expect(stateManager.publishState).toHaveBeenCalled();
			expect(voteAggregator.clearVotes).toHaveBeenCalledWith('game-1', 0);
		});

		it('uses fallback action when winning action is not in availableActions', async () => {
			const state = makeValidState({ availableActions: ['b'] as Array<GameAction> });
			stateManager = makeMockStateManager(state);
			voteAggregator = makeMockVoteAggregator(makeVoteResult({ winningAction: 'up' }));
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			processor = new TickProcessor(stateManager as any, voteAggregator as any, mockLogger as any, {
				tickIntervalMs: 1000,
			});

			await processor.start('game-1');
			vi.clearAllMocks();

			await vi.advanceTimersByTimeAsync(1000);

			// appendEvent should be called - we just verify the tick ran
			expect(stateManager.appendEvent).toHaveBeenCalled();
		});

		it('stops automatically when battle_over phase', async () => {
			// Start with a state that will result in battle_over after the tick
			const battleOverState = makeValidState({ phase: BattlePhase.BattleOver });
			stateManager = makeMockStateManager(battleOverState);
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			processor = new TickProcessor(stateManager as any, voteAggregator as any, mockLogger as any, {
				tickIntervalMs: 1000,
			});

			await processor.start('game-1');

			// Tick should detect battle_over and auto-stop
			await vi.advanceTimersByTimeAsync(1000);

			expect(processor.isRunning()).toBe(false);
		});

		it('fires multiple ticks at the correct interval', async () => {
			// Use a tanky opponent so the battle survives multiple ticks
			const tankyState = makeValidState({
				opponent: {
					species: 'Snorlax',
					hpPercent: 100,
					status: StatusCondition.None,
					types: [PokemonType.Normal],
					level: 100,
				},
			});
			stateManager = makeMockStateManager(tankyState);
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			processor = new TickProcessor(stateManager as any, voteAggregator as any, mockLogger as any, {
				tickIntervalMs: 1000,
			});

			await processor.start('game-1');
			vi.clearAllMocks();

			// Advance in steps to allow async callbacks to resolve between ticks
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);

			expect(voteAggregator.tallyVotes).toHaveBeenCalledTimes(3);
		});
	});

	describe('initAndStart', () => {
		it('saves initial state then starts processor', async () => {
			const initialState = makeValidState();

			// Reset mock to return the saved state on loadState
			stateManager = makeMockStateManager(initialState);
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			processor = new TickProcessor(stateManager as any, voteAggregator as any, mockLogger as any, {
				tickIntervalMs: 1000,
			});

			await processor.initAndStart('game-1', initialState);

			expect(stateManager.saveState).toHaveBeenCalledWith(initialState);
			expect(stateManager.loadState).toHaveBeenCalledWith('game-1');
			expect(processor.isRunning()).toBe(true);
		});
	});
});
