import type { Logger } from 'pino';

import { applyAction } from './battle-engine.js';
import type { StateManager } from './state.js';
import { type BattleState, DEFAULT_FALLBACK_ACTION, type TickResult } from './types.js';
import type { VoteAggregator } from './vote-aggregator.js';

export type TickProcessorOptions = {
	tickIntervalMs: number;
};

export class TickProcessor {
	private timer: ReturnType<typeof setInterval> | null = null;
	private currentGameId: string | null = null;
	private currentState: BattleState | null = null;

	private readonly stateManager: StateManager;
	private readonly voteAggregator: VoteAggregator;
	private readonly logger: Logger;
	private readonly tickIntervalMs: number;

	constructor(
		stateManager: StateManager,
		voteAggregator: VoteAggregator,
		logger: Logger,
		options: TickProcessorOptions,
	) {
		this.stateManager = stateManager;
		this.voteAggregator = voteAggregator;
		this.logger = logger;
		this.tickIntervalMs = options.tickIntervalMs;
	}

	async start(gameId: string): Promise<void> {
		if (this.timer !== null) {
			throw new Error('TickProcessor is already running');
		}

		const state = await this.stateManager.loadState(gameId);
		if (!state) {
			throw new Error(`Game ${gameId} not found in state store`);
		}

		this.currentState = state;
		this.currentGameId = gameId;

		this.timer = setInterval(() => {
			this.processTick().catch((err: unknown) => {
				this.logger.error({ err, gameId }, 'Tick processing error');
			});
		}, this.tickIntervalMs);

		this.logger.info({ gameId, tickIntervalMs: this.tickIntervalMs }, 'Tick processor started');
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		const gameId = this.currentGameId;
		this.currentState = null;
		this.currentGameId = null;
		this.logger.info({ gameId }, 'Tick processor stopped');
	}

	isRunning(): boolean {
		return this.timer !== null;
	}

	private async processTick(): Promise<TickResult | null> {
		const gameId = this.currentGameId;
		const previousState = this.currentState;

		if (!(gameId && previousState)) return null;

		const currentTickId = previousState.turn;

		// Tally votes
		const voteResult = await this.voteAggregator.tallyVotes(gameId, currentTickId);

		// Filter winning action to only valid actions
		const actionToApply = previousState.availableActions.includes(voteResult.winningAction)
			? voteResult.winningAction
			: DEFAULT_FALLBACK_ACTION;

		// Apply to battle engine
		const { newState, description } = applyAction(previousState, actionToApply, voteResult.totalVotes);

		// Update current state
		this.currentState = newState;

		// Persist
		await this.stateManager.saveState(newState);

		// Append event to stream
		await this.stateManager.appendEvent(gameId, currentTickId, actionToApply, voteResult.totalVotes, description);

		// Publish to WebSocket fanout
		await this.stateManager.publishState(gameId, newState);

		// Clean up processed votes
		await this.voteAggregator.clearVotes(gameId, currentTickId);

		const result: TickResult = {
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
				totalVotes: voteResult.totalVotes,
				description,
			},
			'Battle tick processed',
		);

		// Auto-stop when battle is over
		if (newState.phase === 'battle_over') {
			this.stop();
		}

		return result;
	}

	async initAndStart(gameId: string, initialState: BattleState): Promise<void> {
		await this.stateManager.saveState(initialState);
		await this.start(gameId);
	}
}
