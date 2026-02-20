import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { GameBoyEmulator, GbButton } from './emulator-interface.js';
import { extractBattleState, isInBattle } from './memory-map.js';
import type { TickProcessor } from './tick-processor.js';

// ─── Game Phase ──────────────────────────────────────────────────────────────

export enum GamePhase {
	Overworld = 'overworld',
	Battle = 'battle',
	Menu = 'menu',
	Dialogue = 'dialogue',
}

// ─── Overworld Action ────────────────────────────────────────────────────────

const OVERWORLD_ACTIONS = ['up', 'down', 'left', 'right', 'a_button', 'b_button', 'start', 'select'] as const;

export type OverworldAction = (typeof OVERWORLD_ACTIONS)[number];

export const overworldActionSchema = z.enum(OVERWORLD_ACTIONS);

// ─── Overworld Turn History Entry ────────────────────────────────────────────

export type OverworldTurnHistoryEntry = {
	turn: number;
	action: OverworldAction;
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
	availableActions: Array<OverworldAction>;
	lastAction: OverworldAction | null;
	turnHistory: Array<OverworldTurnHistoryEntry>;
	createdAt: number;
	updatedAt: number;
};

// ─── Overworld Vote Result ───────────────────────────────────────────────────

export type OverworldVoteResult = {
	tickId: number;
	gameId: string;
	winningAction: OverworldAction;
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

export const DEFAULT_OVERWORLD_FALLBACK_ACTION: OverworldAction = 'a_button';

const OVERWORLD_VOTE_KEY_EXPIRY_SECONDS = 3600;

// ─── Pokemon Red Overworld RAM Addresses ─────────────────────────────────────

const ADDR_PLAYER_Y = 0xd361;
const ADDR_PLAYER_X = 0xd362;
const ADDR_MAP_ID = 0xd35e;
const ADDR_TEXT_BOX_ID = 0xd125;
const ADDR_MENU_ITEM_ID = 0xcc2d;

// ─── Action to Button Mapping ────────────────────────────────────────────────

const ACTION_BUTTON_MAP: ReadonlyMap<OverworldAction, GbButton> = new Map([
	['up', 'UP'],
	['down', 'DOWN'],
	['left', 'LEFT'],
	['right', 'RIGHT'],
	['a_button', 'A'],
	['b_button', 'B'],
	['start', 'START'],
	['select', 'SELECT'],
]);

export function mapActionToButton(action: OverworldAction): GbButton {
	const button = ACTION_BUTTON_MAP.get(action);
	if (!button) {
		throw new Error(`Unknown overworld action: ${action}`);
	}
	return button;
}

// ─── Frame Timing ────────────────────────────────────────────────────────────

export function getFrameCount(action: OverworldAction): number {
	switch (action) {
		case 'up':
		case 'down':
		case 'left':
		case 'right':
			return DEFAULT_FRAME_COUNTS.movement;
		case 'a_button':
			return DEFAULT_FRAME_COUNTS.aButton;
		case 'b_button':
			return DEFAULT_FRAME_COUNTS.bButton;
		case 'start':
			return DEFAULT_FRAME_COUNTS.start;
		case 'select':
			return DEFAULT_FRAME_COUNTS.select;
	}
}

// ─── Action Parsing ──────────────────────────────────────────────────────────

export function parseOverworldAction(action: string): OverworldAction | null {
	const parsed = overworldActionSchema.safeParse(action);
	return parsed.success ? parsed.data : null;
}

// ─── Available Actions ───────────────────────────────────────────────────────

export function getAvailableActions(phase: GamePhase): Array<OverworldAction> {
	switch (phase) {
		case GamePhase.Overworld:
			return ['up', 'down', 'left', 'right', 'a_button', 'b_button', 'start', 'select'];
		case GamePhase.Menu:
			return ['up', 'down', 'left', 'right', 'a_button', 'b_button'];
		case GamePhase.Dialogue:
			return ['a_button', 'b_button'];
		case GamePhase.Battle:
			return [];
	}
}

// ─── Action Description ──────────────────────────────────────────────────────

const DIALOGUE_DESCRIPTIONS = new Map<OverworldAction, string>([
	['a_button', 'Advanced dialogue'],
	['b_button', 'Tried to skip dialogue'],
]);

const MENU_DESCRIPTIONS = new Map<OverworldAction, string>([
	['a_button', 'Confirmed menu selection'],
	['b_button', 'Cancelled/closed menu'],
	['up', 'Navigated menu up'],
	['down', 'Navigated menu down'],
	['left', 'Navigated menu left'],
	['right', 'Navigated menu right'],
]);

const DEFAULT_DESCRIPTIONS = new Map<OverworldAction, string>([
	['up', 'Moved up'],
	['down', 'Moved down'],
	['left', 'Moved left'],
	['right', 'Moved right'],
	['a_button', 'Pressed A (interact)'],
	['b_button', 'Pressed B (cancel)'],
	['start', 'Opened start menu'],
	['select', 'Pressed Select'],
]);

export function describeAction(action: OverworldAction, phase: GamePhase): string {
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

	async recordVote(gameId: string, tickId: number, action: OverworldAction): Promise<void> {
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
		let winningAction: OverworldAction = DEFAULT_OVERWORLD_FALLBACK_ACTION;
		let highestCount = 0;

		for (let i = 0; i < raw.length - 1; i += 2) {
			const member = raw[i];
			const scoreStr = raw[i + 1];
			if (!(member && scoreStr)) continue;

			const count = Number.parseInt(scoreStr, 10);
			if (Number.isNaN(count)) continue;

			const parsed = overworldActionSchema.safeParse(member);
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

// ─── Frame Count Merge Helper ────────────────────────────────────────────────

function mergeFrameCounts(custom?: Partial<FrameCounts>): FrameCounts {
	return {
		movement: custom?.movement ?? DEFAULT_FRAME_COUNTS.movement,
		aButton: custom?.aButton ?? DEFAULT_FRAME_COUNTS.aButton,
		bButton: custom?.bButton ?? DEFAULT_FRAME_COUNTS.bButton,
		start: custom?.start ?? DEFAULT_FRAME_COUNTS.start,
		select: custom?.select ?? DEFAULT_FRAME_COUNTS.select,
	};
}

// ─── Overworld Tick Processor ────────────────────────────────────────────────

export type OverworldTickProcessorOptions = {
	tickIntervalMs: number;
	frameCounts?: Partial<FrameCounts>;
};

export class OverworldTickProcessor {
	private timer: ReturnType<typeof setInterval> | null = null;
	private currentGameId: string | null = null;
	private currentState: OverworldState | null = null;

	private readonly emulator: GameBoyEmulator;
	private readonly stateStore: OverworldStateStore;
	private readonly voteTallier: OverworldVoteTallier;
	private readonly logger: Logger;
	private readonly tickIntervalMs: number;
	private readonly frameCounts: FrameCounts;

	constructor(
		emulator: GameBoyEmulator,
		stateStore: OverworldStateStore,
		voteTallier: OverworldVoteTallier,
		logger: Logger,
		options: OverworldTickProcessorOptions,
	) {
		this.emulator = emulator;
		this.stateStore = stateStore;
		this.voteTallier = voteTallier;
		this.logger = logger;
		this.tickIntervalMs = options.tickIntervalMs;
		this.frameCounts = mergeFrameCounts(options.frameCounts);
	}

	async start(gameId: string): Promise<void> {
		if (this.timer !== null) {
			throw new Error('OverworldTickProcessor is already running');
		}

		const state = await this.stateStore.loadState(gameId);
		if (!state) {
			const ram = await this.emulator.getRAM();
			this.currentState = extractOverworldState(ram, gameId, 0);
			await this.stateStore.saveState(this.currentState);
		} else {
			this.currentState = state;
		}

		this.currentGameId = gameId;
		this.startTimer(gameId);
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		const gameId = this.currentGameId;
		this.currentState = null;
		this.currentGameId = null;
		this.logger.info({ gameId }, 'Overworld tick processor stopped');
	}

	isRunning(): boolean {
		return this.timer !== null;
	}

	getCurrentPhase(): GamePhase | null {
		return this.currentState?.phase ?? null;
	}

	async initAndStart(gameId: string, initialState: OverworldState): Promise<void> {
		if (this.timer !== null) {
			throw new Error('OverworldTickProcessor is already running');
		}

		await this.stateStore.saveState(initialState);
		this.currentState = initialState;
		this.currentGameId = gameId;
		this.startTimer(gameId);
	}

	private startTimer(gameId: string): void {
		this.timer = setInterval(() => {
			this.processTick().catch((err: unknown) => {
				this.logger.error({ err, gameId }, 'Overworld tick processing error');
			});
		}, this.tickIntervalMs);
		this.logger.info({ gameId, tickIntervalMs: this.tickIntervalMs }, 'Overworld tick processor started');
	}

	private getConfiguredFrameCount(action: OverworldAction): number {
		switch (action) {
			case 'up':
			case 'down':
			case 'left':
			case 'right':
				return this.frameCounts.movement;
			case 'a_button':
				return this.frameCounts.aButton;
			case 'b_button':
				return this.frameCounts.bButton;
			case 'start':
				return this.frameCounts.start;
			case 'select':
				return this.frameCounts.select;
		}
	}

	private async processTick(): Promise<OverworldTickResult | null> {
		const gameId = this.currentGameId;
		const previousState = this.currentState;
		if (!(gameId && previousState)) return null;

		const currentTickId = previousState.turn;

		// Tally votes
		const voteResult = await this.voteTallier.tallyVotes(gameId, currentTickId);

		// Validate winning action against available actions
		const actionToApply = previousState.availableActions.includes(voteResult.winningAction)
			? voteResult.winningAction
			: DEFAULT_OVERWORLD_FALLBACK_ACTION;

		// Map action to button and press on emulator
		const button = mapActionToButton(actionToApply);
		await this.emulator.pressButton(button);

		// Advance additional frames for animation completion
		const additionalFrames = this.getConfiguredFrameCount(actionToApply);
		if (additionalFrames > 0) {
			await this.emulator.advanceFrames(additionalFrames);
		}

		// Extract new state from emulator RAM
		const ram = await this.emulator.getRAM();
		const description = describeAction(actionToApply, previousState.phase);

		const newState: OverworldState = {
			...extractOverworldState(ram, gameId, currentTickId + 1),
			lastAction: actionToApply,
			turnHistory: [
				...previousState.turnHistory,
				{
					turn: currentTickId,
					action: actionToApply,
					description,
					totalVotes: voteResult.totalVotes,
				},
			].slice(-20),
		};

		// Update current state
		this.currentState = newState;

		// Persist state
		await this.stateStore.saveState(newState);

		// Publish to WebSocket fanout
		await this.stateStore.publishState(gameId, newState);

		// Clean up processed votes
		await this.voteTallier.clearVotes(gameId, currentTickId);

		const result: OverworldTickResult = {
			tickId: currentTickId,
			gameId,
			voteResult,
			previousState,
			newState,
			description,
		};

		this.logger.info(
			{
				gameId,
				turn: currentTickId,
				action: actionToApply,
				phase: newState.phase,
				totalVotes: voteResult.totalVotes,
				description,
			},
			'Overworld tick processed',
		);

		// Auto-stop when battle starts (unified processor handles transition)
		if (newState.phase === GamePhase.Battle) {
			this.stop();
		}

		return result;
	}
}

// ─── Unified Tick Processor ──────────────────────────────────────────────────

export type UnifiedTickProcessorOptions = {
	checkIntervalMs: number;
};

export class UnifiedTickProcessor {
	private watchdogTimer: ReturnType<typeof setInterval> | null = null;
	private currentGameId: string | null = null;

	private readonly emulator: GameBoyEmulator;
	private readonly battleTickProcessor: TickProcessor;
	private readonly overworldTickProcessor: OverworldTickProcessor;
	private readonly logger: Logger;
	private readonly checkIntervalMs: number;

	constructor(
		emulator: GameBoyEmulator,
		battleTickProcessor: TickProcessor,
		overworldTickProcessor: OverworldTickProcessor,
		logger: Logger,
		options: UnifiedTickProcessorOptions,
	) {
		this.emulator = emulator;
		this.battleTickProcessor = battleTickProcessor;
		this.overworldTickProcessor = overworldTickProcessor;
		this.logger = logger;
		this.checkIntervalMs = options.checkIntervalMs;
	}

	async start(gameId: string): Promise<void> {
		if (this.watchdogTimer !== null) {
			throw new Error('UnifiedTickProcessor is already running');
		}

		this.currentGameId = gameId;

		// Detect initial phase and start appropriate processor
		const ram = await this.emulator.getRAM();
		const phase = detectGamePhase(ram);

		if (phase === GamePhase.Battle) {
			const battleState = extractBattleState(ram, gameId, 0);
			await this.battleTickProcessor.initAndStart(gameId, battleState);
		} else {
			await this.overworldTickProcessor.start(gameId);
		}

		this.logger.info({ gameId, phase }, 'Unified tick processor started');

		// Start watchdog to monitor phase transitions
		this.watchdogTimer = setInterval(() => {
			this.checkAndRestart().catch((err: unknown) => {
				this.logger.error({ err, gameId }, 'Phase transition check error');
			});
		}, this.checkIntervalMs);
	}

	stop(): void {
		if (this.watchdogTimer !== null) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}
		this.battleTickProcessor.stop();
		this.overworldTickProcessor.stop();
		const gameId = this.currentGameId;
		this.currentGameId = null;
		this.logger.info({ gameId }, 'Unified tick processor stopped');
	}

	isRunning(): boolean {
		return this.watchdogTimer !== null;
	}

	async getCurrentPhase(): Promise<GamePhase> {
		const ram = await this.emulator.getRAM();
		return detectGamePhase(ram);
	}

	private async checkAndRestart(): Promise<void> {
		const gameId = this.currentGameId;
		if (!gameId) return;

		const battleRunning = this.battleTickProcessor.isRunning();
		const overworldRunning = this.overworldTickProcessor.isRunning();

		// If a processor is still running, nothing to do
		if (battleRunning || overworldRunning) return;

		// Both processors stopped, detect current phase and restart
		const ram = await this.emulator.getRAM();
		const phase = detectGamePhase(ram);

		if (phase === GamePhase.Battle) {
			const battleState = extractBattleState(ram, gameId, 0);
			await this.battleTickProcessor.initAndStart(gameId, battleState);
			this.logger.info({ gameId, phase }, 'Battle processor restarted by watchdog');
		} else {
			await this.overworldTickProcessor.start(gameId);
			this.logger.info({ gameId, phase }, 'Overworld processor restarted by watchdog');
		}
	}
}
