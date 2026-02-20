import type { Logger } from 'pino';

import { applyAction } from './battle-engine.js';
import { getButtonSequence } from './button-sequences.js';
import type { GameBoyEmulator } from './emulator-interface.js';
import { extractBattleState } from './memory-map.js';
import { StatePoller } from './state-poller.js';
import type { StateManager } from './state.js';
import { type BattleState, DEFAULT_FALLBACK_ACTION, type TickResult } from './types.js';
import type { VoteAggregator } from './vote-aggregator.js';

export type TickProcessorOptions = {
	tickIntervalMs: number;
	useRealEmulator?: boolean | undefined;
	emulator?: GameBoyEmulator | undefined;
};

export class TickProcessor {
	private timer: ReturnType<typeof setInterval> | null = null;
	private currentGameId: string | null = null;
	private currentState: BattleState | null = null;

	private readonly stateManager: StateManager;
	private readonly voteAggregator: VoteAggregator;
	private readonly logger: Logger;
	private readonly tickIntervalMs: number;
	private readonly useRealEmulator: boolean;
	private readonly emulator: GameBoyEmulator | null;
	private readonly statePoller: StatePoller | null;

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
		this.useRealEmulator = options.useRealEmulator ?? false;
		this.emulator = options.emulator ?? null;
		this.statePoller = this.emulator ? new StatePoller(this.emulator, logger) : null;
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

		let newState: BattleState;
		let description: string;

		if (this.useRealEmulator && this.emulator) {
			// Real emulator path: press buttons, wait for animations, read actual state
			const result = await this.executeOnRealEmulator(gameId, actionToApply, currentTickId, voteResult.totalVotes);
			newState = result.newState;
			description = result.description;
		} else {
			// Simulation path: pure state machine (original behavior)
			const result = applyAction(previousState, actionToApply, voteResult.totalVotes);
			newState = result.newState;
			description = result.description;
		}

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

	private async executeOnRealEmulator(
		gameId: string,
		actionToApply: string,
		tickId: number,
		totalVotes: number,
	): Promise<{ newState: BattleState; description: string }> {
		const emulator = this.emulator;
		if (!emulator) {
			throw new Error('Real emulator not available');
		}

		// Get button sequence for this action
		const steps = getButtonSequence(actionToApply as import('./types.js').BattleAction);

		this.logger.info({ action: actionToApply, steps: steps.length }, 'Executing button sequence on real emulator');

		// Execute each button press with timing
		for (const step of steps) {
			await emulator.pressButton(step.button);
			await emulator.waitMs(step.delayMs);
		}

		// Poll for the battle menu to be ready again
		if (this.statePoller) {
			await this.statePoller.waitForBattleMenuReady({ maxWaitMs: 8000 });
		}

		// Read actual state from emulator RAM
		const ram = await emulator.getRAM();
		const newState = extractBattleState(Array.from(ram), gameId, tickId + 1);

		const description = `Executed ${actionToApply} on real emulator (${totalVotes} votes)`;

		return { newState, description };
	}

	async initAndStart(gameId: string, initialState: BattleState): Promise<void> {
		await this.stateManager.saveState(initialState);
		await this.start(gameId);
	}
}
