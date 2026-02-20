import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { isInBattle } from './memory-map.js';
import { ALL_GAME_ACTIONS, type GameAction, gameActionSchema, gameActionToGbButton } from './types.js';

// ─── Game Phase ──────────────────────────────────────────────────────────────

export enum GamePhase {
	Overworld = 'overworld',
	Battle = 'battle',
	Menu = 'menu',
	Dialogue = 'dialogue',
}

// ─── Overworld Action ────────────────────────────────────────────────────────

/** @deprecated Use GameAction from './types.js' instead. */
export type OverworldAction = GameAction;

export { gameActionSchema as overworldActionSchema };

// ─── Overworld Turn History Entry ────────────────────────────────────────────

export type OverworldTurnHistoryEntry = {
	turn: number;
	action: GameAction;
	description: string;
	totalVotes: number;
};

// ─── Overworld State ─────────────────────────────────────────────────────────

export type OverworldState = {
	gameId: string;
	turn: number;
	phase: GamePhase;
	playerX: number;
	playerY: number;
	mapId: number;
	availableActions: Array<GameAction>;
	lastAction: GameAction | null;
	turnHistory: Array<OverworldTurnHistoryEntry>;
	createdAt: number;
	updatedAt: number;
};

// ─── Overworld Vote Result ───────────────────────────────────────────────────

export type OverworldVoteResult = {
	tickId: number;
	gameId: string;
	winningAction: GameAction;
	voteCounts: Record<string, number>;
	totalVotes: number;
};

// ─── Overworld Tick Result ───────────────────────────────────────────────────

export type OverworldTickResult = {
	tickId: number;
	gameId: string;
	voteResult: OverworldVoteResult;
	previousState: OverworldState;
	newState: OverworldState;
	description: string;
};

// ─── Frame Counts ────────────────────────────────────────────────────────────

export type FrameCounts = {
	movement: number;
	aButton: number;
	bButton: number;
	start: number;
	select: number;
};

// Additional frames to advance after emulator.pressButton() for animation completion.
// pressButton() already advances ~10 frames internally.
export const DEFAULT_FRAME_COUNTS: FrameCounts = {
	movement: 6,
	aButton: 0,
	bButton: 0,
	start: 2,
	select: 0,
};

export const DEFAULT_OVERWORLD_FALLBACK_ACTION: GameAction = 'a';

const OVERWORLD_VOTE_KEY_EXPIRY_SECONDS = 3600;

// ─── Pokemon Red Overworld RAM Addresses ─────────────────────────────────────

const ADDR_PLAYER_Y = 0xd361;
const ADDR_PLAYER_X = 0xd362;
const ADDR_MAP_ID = 0xd35e;
const ADDR_TEXT_BOX_ID = 0xd125;
const ADDR_MENU_ITEM_ID = 0xcc2d;

// ─── Action to Button Mapping ────────────────────────────────────────────────

/** @deprecated Use gameActionToGbButton from './types.js' instead. */
export const mapActionToButton = gameActionToGbButton;

// ─── Frame Timing ────────────────────────────────────────────────────────────

export function getFrameCount(action: GameAction): number {
	switch (action) {
		case 'up':
		case 'down':
		case 'left':
		case 'right':
			return DEFAULT_FRAME_COUNTS.movement;
		case 'a':
			return DEFAULT_FRAME_COUNTS.aButton;
		case 'b':
			return DEFAULT_FRAME_COUNTS.bButton;
		case 'start':
			return DEFAULT_FRAME_COUNTS.start;
		case 'select':
			return DEFAULT_FRAME_COUNTS.select;
	}
}

// ─── Action Parsing ──────────────────────────────────────────────────────────

export function parseOverworldAction(action: string): GameAction | null {
	const parsed = gameActionSchema.safeParse(action);
	return parsed.success ? parsed.data : null;
}

// ─── Available Actions ───────────────────────────────────────────────────────

export function getAvailableActions(_phase: GamePhase): Array<GameAction> {
	return [...ALL_GAME_ACTIONS];
}

// ─── Action Description ──────────────────────────────────────────────────────

const DIALOGUE_DESCRIPTIONS = new Map<GameAction, string>([
	['a', 'Advanced dialogue'],
	['b', 'Tried to skip dialogue'],
]);

const MENU_DESCRIPTIONS = new Map<GameAction, string>([
	['a', 'Confirmed menu selection'],
	['b', 'Cancelled/closed menu'],
	['up', 'Navigated menu up'],
	['down', 'Navigated menu down'],
	['left', 'Navigated menu left'],
	['right', 'Navigated menu right'],
]);

const DEFAULT_DESCRIPTIONS = new Map<GameAction, string>([
	['up', 'Moved up'],
	['down', 'Moved down'],
	['left', 'Moved left'],
	['right', 'Moved right'],
	['a', 'Pressed A (interact)'],
	['b', 'Pressed B (cancel)'],
	['start', 'Opened start menu'],
	['select', 'Pressed Select'],
]);

export function describeAction(action: GameAction, phase: GamePhase): string {
	const fallback = DEFAULT_DESCRIPTIONS.get(action) ?? 'Unknown action';
	if (phase === GamePhase.Dialogue) {
		return DIALOGUE_DESCRIPTIONS.get(action) ?? fallback;
	}
	if (phase === GamePhase.Menu) {
		return MENU_DESCRIPTIONS.get(action) ?? fallback;
	}
	return fallback;
}

// ─── Game Phase Detection ────────────────────────────────────────────────────

export function detectGamePhase(ram: ReadonlyArray<number>): GamePhase {
	if (isInBattle(ram)) {
		return GamePhase.Battle;
	}

	const textBoxId = ram[ADDR_TEXT_BOX_ID] ?? 0;
	if (textBoxId !== 0) {
		return GamePhase.Dialogue;
	}

	const menuItemId = ram[ADDR_MENU_ITEM_ID] ?? 0;
	if (menuItemId !== 0) {
		return GamePhase.Menu;
	}

	return GamePhase.Overworld;
}

// ─── Overworld State Extraction ──────────────────────────────────────────────

export function extractOverworldState(ram: ReadonlyArray<number>, gameId: string, turn: number): OverworldState {
	const phase = detectGamePhase(ram);
	const now = Date.now();

	return {
		gameId,
		turn,
		phase,
		playerX: ram[ADDR_PLAYER_X] ?? 0,
		playerY: ram[ADDR_PLAYER_Y] ?? 0,
		mapId: ram[ADDR_MAP_ID] ?? 0,
		availableActions: getAvailableActions(phase),
		lastAction: null,
		turnHistory: [],
		createdAt: now,
		updatedAt: now,
	};
}

// ─── Dependency Interfaces ───────────────────────────────────────────────────

export type OverworldStateStore = {
	saveState(state: OverworldState): Promise<void>;
	loadState(gameId: string): Promise<OverworldState | null>;
	publishState(gameId: string, state: OverworldState): Promise<void>;
};

export type OverworldVoteTallier = {
	tallyVotes(gameId: string, tickId: number): Promise<OverworldVoteResult>;
	clearVotes(gameId: string, tickId: number): Promise<void>;
};

// ─── Overworld Vote Aggregator ───────────────────────────────────────────────

const OVERWORLD_VOTES_KEY_PREFIX = 'overworld_votes:';

export class OverworldVoteAggregator implements OverworldVoteTallier {
	private readonly redis: Redis;
	private readonly logger: Logger;

	constructor(redis: Redis, logger: Logger) {
		this.redis = redis;
		this.logger = logger;
	}

	voteKey(gameId: string, tickId: number): string {
		return `${OVERWORLD_VOTES_KEY_PREFIX}${gameId}:${tickId}`;
	}

	async recordVote(gameId: string, tickId: number, action: GameAction): Promise<void> {
		const key = this.voteKey(gameId, tickId);
		const pipeline = this.redis.pipeline();
		pipeline.zadd(key, 'INCR', 1, action);
		pipeline.expire(key, OVERWORLD_VOTE_KEY_EXPIRY_SECONDS);
		await pipeline.exec();
		this.logger.debug({ gameId, tickId, action }, 'Overworld vote recorded');
	}

	async tallyVotes(gameId: string, tickId: number): Promise<OverworldVoteResult> {
		const key = this.voteKey(gameId, tickId);
		const raw = await this.redis.zrevrange(key, 0, -1, 'WITHSCORES');

		const voteCounts: Record<string, number> = {};
		let totalVotes = 0;
		let winningAction: GameAction = DEFAULT_OVERWORLD_FALLBACK_ACTION;
		let highestCount = 0;

		for (let i = 0; i < raw.length - 1; i += 2) {
			const member = raw[i];
			const scoreStr = raw[i + 1];
			if (!(member && scoreStr)) continue;

			const count = Number.parseInt(scoreStr, 10);
			if (Number.isNaN(count)) continue;

			const parsed = gameActionSchema.safeParse(member);
			if (!parsed.success) continue;

			const action = parsed.data;
			voteCounts[action] = count;
			totalVotes += count;

			if (count > highestCount) {
				highestCount = count;
				winningAction = action;
			}
		}

		this.logger.debug({ gameId, tickId, winningAction, totalVotes }, 'Overworld votes tallied');
		return { tickId, gameId, winningAction, voteCounts, totalVotes };
	}

	async clearVotes(gameId: string, tickId: number): Promise<void> {
		const key = this.voteKey(gameId, tickId);
		await this.redis.del(key);
		this.logger.debug({ gameId, tickId }, 'Overworld votes cleared');
	}
}

// ─── Deprecated Tick Processors ──────────────────────────────────────────────
// OverworldTickProcessor and UnifiedTickProcessor (watchdog) have been removed.
// Use UnifiedTickProcessor from './unified-tick-processor.js' instead.
