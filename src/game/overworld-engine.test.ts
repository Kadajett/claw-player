import { describe, expect, it, vi } from 'vitest';

import {
	DEFAULT_FRAME_COUNTS,
	DEFAULT_OVERWORLD_FALLBACK_ACTION,
	GamePhase,
	OverworldVoteAggregator,
	describeAction,
	detectGamePhase,
	extractOverworldState,
	getAvailableActions,
	getFrameCount,
	mapActionToButton,
	overworldActionSchema,
	parseOverworldAction,
} from './overworld-engine.js';
import type { GameAction } from './types.js';

// ─── RAM Address Constants (matching overworld-engine.ts internal addresses) ──

const ADDR_IN_BATTLE = 0xd058;
const ADDR_BATTLE_TYPE = 0xd057;
const ADDR_TEXT_BOX_ID = 0xd125;
const ADDR_MENU_ITEM_ID = 0xcc2d;
const ADDR_PLAYER_X = 0xd362;
const ADDR_PLAYER_Y = 0xd361;
const ADDR_MAP_ID = 0xd35e;

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeRam(overrides?: Record<number, number>): ReadonlyArray<number> {
	const ram = new Array(65536).fill(0) as Array<number>;
	if (overrides) {
		for (const [addr, val] of Object.entries(overrides)) {
			ram[Number(addr)] = val;
		}
	}
	return ram;
}

const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

// ─── mapActionToButton ───────────────────────────────────────────────────────

describe('mapActionToButton', () => {
	it('maps up to UP', () => {
		expect(mapActionToButton('up')).toBe('UP');
	});

	it('maps down to DOWN', () => {
		expect(mapActionToButton('down')).toBe('DOWN');
	});

	it('maps left to LEFT', () => {
		expect(mapActionToButton('left')).toBe('LEFT');
	});

	it('maps right to RIGHT', () => {
		expect(mapActionToButton('right')).toBe('RIGHT');
	});

	it('maps a to A', () => {
		expect(mapActionToButton('a')).toBe('A');
	});

	it('maps b to B', () => {
		expect(mapActionToButton('b')).toBe('B');
	});

	it('maps start to START', () => {
		expect(mapActionToButton('start')).toBe('START');
	});

	it('maps select to SELECT', () => {
		expect(mapActionToButton('select')).toBe('SELECT');
	});
});

// ─── getFrameCount ───────────────────────────────────────────────────────────

describe('getFrameCount', () => {
	it('returns movement frames for directional actions', () => {
		expect(getFrameCount('up')).toBe(DEFAULT_FRAME_COUNTS.movement);
		expect(getFrameCount('down')).toBe(DEFAULT_FRAME_COUNTS.movement);
		expect(getFrameCount('left')).toBe(DEFAULT_FRAME_COUNTS.movement);
		expect(getFrameCount('right')).toBe(DEFAULT_FRAME_COUNTS.movement);
	});

	it('returns a button frames', () => {
		expect(getFrameCount('a')).toBe(DEFAULT_FRAME_COUNTS.aButton);
	});

	it('returns b button frames', () => {
		expect(getFrameCount('b')).toBe(DEFAULT_FRAME_COUNTS.bButton);
	});

	it('returns start frames', () => {
		expect(getFrameCount('start')).toBe(DEFAULT_FRAME_COUNTS.start);
	});

	it('returns select frames', () => {
		expect(getFrameCount('select')).toBe(DEFAULT_FRAME_COUNTS.select);
	});
});

// ─── parseOverworldAction ────────────────────────────────────────────────────

describe('parseOverworldAction', () => {
	it('parses all valid actions', () => {
		const validActions: Array<GameAction> = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
		for (const action of validActions) {
			expect(parseOverworldAction(action)).toBe(action);
		}
	});

	it('returns null for invalid actions', () => {
		expect(parseOverworldAction('fly')).toBeNull();
		expect(parseOverworldAction('move:0')).toBeNull();
		expect(parseOverworldAction('')).toBeNull();
		expect(parseOverworldAction('UP')).toBeNull();
		expect(parseOverworldAction('a_button')).toBeNull();
		expect(parseOverworldAction('b_button')).toBeNull();
	});
});

// ─── overworldActionSchema ───────────────────────────────────────────────────

describe('overworldActionSchema', () => {
	it('validates correct overworld actions', () => {
		expect(overworldActionSchema.safeParse('up').success).toBe(true);
		expect(overworldActionSchema.safeParse('a').success).toBe(true);
	});

	it('rejects invalid actions', () => {
		expect(overworldActionSchema.safeParse('fly').success).toBe(false);
		expect(overworldActionSchema.safeParse(123).success).toBe(false);
	});
});

// ─── getAvailableActions ─────────────────────────────────────────────────────

describe('getAvailableActions', () => {
	it('returns all 8 actions for every phase', () => {
		for (const phase of [GamePhase.Overworld, GamePhase.Menu, GamePhase.Dialogue, GamePhase.Battle]) {
			const actions = getAvailableActions(phase);
			expect(actions).toHaveLength(8);
			expect(actions).toContain('up');
			expect(actions).toContain('down');
			expect(actions).toContain('left');
			expect(actions).toContain('right');
			expect(actions).toContain('a');
			expect(actions).toContain('b');
			expect(actions).toContain('start');
			expect(actions).toContain('select');
		}
	});
});

// ─── describeAction ──────────────────────────────────────────────────────────

describe('describeAction', () => {
	it('describes directional movement in overworld', () => {
		expect(describeAction('up', GamePhase.Overworld)).toBe('Moved up');
		expect(describeAction('down', GamePhase.Overworld)).toBe('Moved down');
		expect(describeAction('left', GamePhase.Overworld)).toBe('Moved left');
		expect(describeAction('right', GamePhase.Overworld)).toBe('Moved right');
	});

	it('describes button presses in overworld', () => {
		expect(describeAction('a', GamePhase.Overworld)).toBe('Pressed A (interact)');
		expect(describeAction('b', GamePhase.Overworld)).toBe('Pressed B (cancel)');
		expect(describeAction('start', GamePhase.Overworld)).toBe('Opened start menu');
		expect(describeAction('select', GamePhase.Overworld)).toBe('Pressed Select');
	});

	it('describes dialogue-specific actions', () => {
		expect(describeAction('a', GamePhase.Dialogue)).toBe('Advanced dialogue');
		expect(describeAction('b', GamePhase.Dialogue)).toBe('Tried to skip dialogue');
	});

	it('describes menu-specific actions', () => {
		expect(describeAction('a', GamePhase.Menu)).toBe('Confirmed menu selection');
		expect(describeAction('b', GamePhase.Menu)).toBe('Cancelled/closed menu');
		expect(describeAction('up', GamePhase.Menu)).toBe('Navigated menu up');
		expect(describeAction('down', GamePhase.Menu)).toBe('Navigated menu down');
	});
});

// ─── detectGamePhase ─────────────────────────────────────────────────────────

describe('detectGamePhase', () => {
	it('returns Overworld when RAM is all zeros', () => {
		const ram = makeRam();
		expect(detectGamePhase(ram)).toBe(GamePhase.Overworld);
	});

	it('returns Battle when in-battle flag is set', () => {
		const ram = makeRam({ [ADDR_IN_BATTLE]: 1 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Battle);
	});

	it('returns Battle when battle type is set', () => {
		const ram = makeRam({ [ADDR_BATTLE_TYPE]: 2 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Battle);
	});

	it('returns Dialogue when text box is active', () => {
		const ram = makeRam({ [ADDR_TEXT_BOX_ID]: 1 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Dialogue);
	});

	it('returns Menu when menu item is active', () => {
		const ram = makeRam({ [ADDR_MENU_ITEM_ID]: 1 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Menu);
	});

	it('prioritizes Battle over Dialogue', () => {
		const ram = makeRam({
			[ADDR_IN_BATTLE]: 1,
			[ADDR_TEXT_BOX_ID]: 1,
		});
		expect(detectGamePhase(ram)).toBe(GamePhase.Battle);
	});

	it('prioritizes Dialogue over Menu', () => {
		const ram = makeRam({
			[ADDR_TEXT_BOX_ID]: 1,
			[ADDR_MENU_ITEM_ID]: 1,
		});
		expect(detectGamePhase(ram)).toBe(GamePhase.Dialogue);
	});
});

// ─── extractOverworldState ───────────────────────────────────────────────────

describe('extractOverworldState', () => {
	it('extracts player position from RAM', () => {
		const ram = makeRam({
			[ADDR_PLAYER_X]: 7,
			[ADDR_PLAYER_Y]: 14,
		});
		const state = extractOverworldState(ram, 'game-1', 5);
		expect(state.playerX).toBe(7);
		expect(state.playerY).toBe(14);
	});

	it('extracts map ID from RAM', () => {
		const ram = makeRam({ [ADDR_MAP_ID]: 42 });
		const state = extractOverworldState(ram, 'game-1', 0);
		expect(state.mapId).toBe(42);
	});

	it('sets game ID and turn from arguments', () => {
		const ram = makeRam();
		const state = extractOverworldState(ram, 'test-game', 10);
		expect(state.gameId).toBe('test-game');
		expect(state.turn).toBe(10);
	});

	it('detects correct phase for overworld', () => {
		const ram = makeRam();
		const state = extractOverworldState(ram, 'game-1', 0);
		expect(state.phase).toBe(GamePhase.Overworld);
		expect(state.availableActions).toHaveLength(8);
	});

	it('detects correct phase for dialogue', () => {
		const ram = makeRam({ [ADDR_TEXT_BOX_ID]: 1 });
		const state = extractOverworldState(ram, 'game-1', 0);
		expect(state.phase).toBe(GamePhase.Dialogue);
		expect(state.availableActions).toHaveLength(8);
	});

	it('initializes with null lastAction and empty turnHistory', () => {
		const ram = makeRam();
		const state = extractOverworldState(ram, 'game-1', 0);
		expect(state.lastAction).toBeNull();
		expect(state.turnHistory).toHaveLength(0);
	});

	it('sets createdAt and updatedAt timestamps', () => {
		const ram = makeRam();
		const before = Date.now();
		const state = extractOverworldState(ram, 'game-1', 0);
		const after = Date.now();
		expect(state.createdAt).toBeGreaterThanOrEqual(before);
		expect(state.createdAt).toBeLessThanOrEqual(after);
		expect(state.updatedAt).toBe(state.createdAt);
	});
});

// ─── OverworldVoteAggregator ─────────────────────────────────────────────────

describe('OverworldVoteAggregator', () => {
	function makeMockRedis() {
		return {
			pipeline: vi.fn().mockReturnValue({
				zadd: vi.fn().mockReturnThis(),
				expire: vi.fn().mockReturnThis(),
				exec: vi.fn().mockResolvedValue([]),
			}),
			zrevrange: vi.fn().mockResolvedValue([]),
			del: vi.fn().mockResolvedValue(1),
		};
	}

	it('generates correct vote key', () => {
		const redis = makeMockRedis();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const aggregator = new OverworldVoteAggregator(redis as any, mockLogger as any);
		expect(aggregator.voteKey('game-1', 5)).toBe('overworld_votes:game-1:5');
	});

	it('records vote using Redis pipeline', async () => {
		const redis = makeMockRedis();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const aggregator = new OverworldVoteAggregator(redis as any, mockLogger as any);

		await aggregator.recordVote('game-1', 0, 'up');

		expect(redis.pipeline).toHaveBeenCalled();
		const pipeline = redis.pipeline();
		expect(pipeline.zadd).toHaveBeenCalled();
		expect(pipeline.expire).toHaveBeenCalled();
	});

	it('tallies votes and returns winning action', async () => {
		const redis = makeMockRedis();
		redis.zrevrange.mockResolvedValue(['up', '5', 'down', '3', 'left', '1']);
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const aggregator = new OverworldVoteAggregator(redis as any, mockLogger as any);

		const result = await aggregator.tallyVotes('game-1', 0);

		expect(result.winningAction).toBe('up');
		expect(result.totalVotes).toBe(9);
		expect(result.voteCounts.up).toBe(5);
		expect(result.voteCounts.down).toBe(3);
		expect(result.voteCounts.left).toBe(1);
	});

	it('returns fallback action when no votes', async () => {
		const redis = makeMockRedis();
		redis.zrevrange.mockResolvedValue([]);
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const aggregator = new OverworldVoteAggregator(redis as any, mockLogger as any);

		const result = await aggregator.tallyVotes('game-1', 0);

		expect(result.winningAction).toBe(DEFAULT_OVERWORLD_FALLBACK_ACTION);
		expect(result.totalVotes).toBe(0);
	});

	it('skips invalid action members', async () => {
		const redis = makeMockRedis();
		redis.zrevrange.mockResolvedValue(['up', '5', 'invalid_action', '3']);
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const aggregator = new OverworldVoteAggregator(redis as any, mockLogger as any);

		const result = await aggregator.tallyVotes('game-1', 0);

		expect(result.winningAction).toBe('up');
		expect(result.totalVotes).toBe(5);
	});

	it('clears votes by deleting the key', async () => {
		const redis = makeMockRedis();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const aggregator = new OverworldVoteAggregator(redis as any, mockLogger as any);

		await aggregator.clearVotes('game-1', 0);

		expect(redis.del).toHaveBeenCalledWith('overworld_votes:game-1:0');
	});
});
