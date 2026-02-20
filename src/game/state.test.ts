import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StateManager } from './state.js';
import { BattlePhase, type BattleState, PokemonType, SNAPSHOT_INTERVAL, StatusCondition } from './types.js';

function makeValidState(overrides?: Partial<BattleState>): BattleState {
	const now = 1000000;
	const pokemon = {
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
		moves: [] as Array<{
			name: string;
			pokemonType: PokemonType;
			power: number;
			accuracy: number;
			pp: number;
			maxPp: number;
			category: 'physical' | 'special' | 'status';
		}>,
	};

	return {
		gameId: 'game-1',
		turn: 0,
		phase: BattlePhase.ChooseAction,
		playerActive: pokemon,
		playerParty: [pokemon],
		opponent: {
			species: 'Rattata',
			hp: 30,
			maxHp: 30,
			hpPercent: 100,
			status: StatusCondition.None,
			types: [PokemonType.Normal],
			level: 10,
		},
		availableActions: ['move:0', 'run'],
		weather: 'clear',
		turnHistory: [],
		lastAction: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

function makeMockRedis(overrides?: { get?: string | null }) {
	const pipeline = {
		set: vi.fn().mockReturnThis(),
		expire: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([]),
	};

	return {
		pipeline: vi.fn().mockReturnValue(pipeline),
		get: vi.fn().mockResolvedValue(overrides?.get ?? null),
		xadd: vi.fn().mockResolvedValue('1-0'),
		publish: vi.fn().mockResolvedValue(1),
		del: vi.fn().mockResolvedValue(1),
		mockPipeline: pipeline,
	};
}

const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

describe('StateManager', () => {
	let redis: ReturnType<typeof makeMockRedis>;
	let manager: StateManager;

	beforeEach(() => {
		redis = makeMockRedis();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		manager = new StateManager(redis as any, mockLogger as any);
		vi.clearAllMocks();
	});

	describe('key helpers', () => {
		it('generates correct state key', () => {
			expect(manager.stateKey('game-1')).toBe('game:state:game-1');
		});

		it('generates correct snapshot key', () => {
			expect(manager.snapshotKey('game-1', 10)).toBe('game:snapshot:game-1:10');
		});

		it('generates correct events key', () => {
			expect(manager.eventsKey('game-1')).toBe('game_events:game-1');
		});
	});

	describe('saveState', () => {
		it('calls pipeline.set with JSON state', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const state = makeValidState();
			await manager.saveState(state);

			expect(redis.pipeline).toHaveBeenCalled();
			expect(redis.mockPipeline.set).toHaveBeenCalledWith('game:state:game-1', JSON.stringify(state));
			expect(redis.mockPipeline.exec).toHaveBeenCalled();
		});

		it('creates snapshot at SNAPSHOT_INTERVAL turn', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const state = makeValidState({ turn: SNAPSHOT_INTERVAL });
			await manager.saveState(state);

			const setPairs = redis.mockPipeline.set.mock.calls;
			const snapshotCall = setPairs.find(
				(args: Array<unknown>) => typeof args[0] === 'string' && args[0].includes('snapshot'),
			);
			expect(snapshotCall).toBeDefined();
		});

		it('does not create snapshot on non-interval turn', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const state = makeValidState({ turn: 7 });
			await manager.saveState(state);

			const setPairs = redis.mockPipeline.set.mock.calls;
			const snapshotCall = setPairs.find(
				(args: Array<unknown>) => typeof args[0] === 'string' && args[0].includes('snapshot'),
			);
			expect(snapshotCall).toBeUndefined();
		});
	});

	describe('loadState', () => {
		it('returns null when key does not exist', async () => {
			redis = makeMockRedis({ get: null });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const result = await manager.loadState('game-1');
			expect(result).toBeNull();
		});

		it('parses and returns valid state', async () => {
			const state = makeValidState();
			redis = makeMockRedis({ get: JSON.stringify(state) });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const result = await manager.loadState('game-1');
			expect(result).toEqual(state);
		});

		it('returns null and logs error for invalid state', async () => {
			redis = makeMockRedis({ get: JSON.stringify({ invalid: true }) });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const result = await manager.loadState('game-1');
			expect(result).toBeNull();
			expect(mockLogger.error).toHaveBeenCalled();
		});
	});

	describe('appendEvent', () => {
		it('calls xadd with correct stream key and fields', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			await manager.appendEvent('game-1', 5, 'move:0', 42, 'Pikachu used Thunderbolt!');

			expect(redis.xadd).toHaveBeenCalledWith(
				'game_events:game-1',
				'*',
				'type',
				'ACTION',
				'turn',
				'5',
				'action',
				'move:0',
				'votes',
				'42',
				'description',
				'Pikachu used Thunderbolt!',
			);
		});
	});

	describe('publishState', () => {
		it('publishes state JSON to correct channel', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			const state = makeValidState();
			await manager.publishState('game-1', state);

			expect(redis.publish).toHaveBeenCalledWith('game_state:game-1', JSON.stringify(state));
		});
	});

	describe('computeDelta', () => {
		it('computes patches between two states', () => {
			const before = makeValidState({ turn: 5, lastAction: null });
			const after = makeValidState({ turn: 6, lastAction: 'move:0' });

			const delta = manager.computeDelta('game-1', 5, before, after);

			expect(delta.gameId).toBe('game-1');
			expect(delta.turn).toBe(5);
			expect(delta.patches.length).toBeGreaterThan(0);
		});

		it('returns empty patches for identical states', () => {
			const state = makeValidState();
			const delta = manager.computeDelta('game-1', 0, state, state);
			expect(delta.patches).toHaveLength(0);
		});
	});

	describe('deleteState', () => {
		it('calls redis.del with correct key', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			manager = new StateManager(redis as any, mockLogger as any);

			await manager.deleteState('game-1');
			expect(redis.del).toHaveBeenCalledWith('game:state:game-1');
		});
	});
});
