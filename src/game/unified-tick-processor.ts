import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { GameBoyEmulator } from './emulator-interface.js';
import type { UnifiedGameState } from './memory-map.js';
import { extractUnifiedGameState } from './memory-map.js';
import { gameActionToGbButton } from './types.js';
import type { VoteAggregator } from './vote-aggregator.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type UnifiedTickCallback = (state: UnifiedGameState) => Promise<void> | void;

export type UnifiedTickProcessorConfig = {
	tickIntervalMs: number;
	emulatorSettleMs: number;
	gameId: string;
};

// ─── Redis Key Prefixes ─────────────────────────────────────────────────────

const STATE_KEY_PREFIX = 'game:state:';
const EVENTS_STREAM_PREFIX = 'game_events:';
const STATE_CHANNEL_PREFIX = 'game_state:';

// ─── Unified Tick Processor ─────────────────────────────────────────────────

/**
 * Single tick processor that handles all game phases identically.
 * Each tick: tally votes -> press button (if votes) -> read RAM -> extract
 * unified state -> persist to Redis -> broadcast via pub/sub.
 */
export class UnifiedTickProcessor {
	private timer: ReturnType<typeof setInterval> | null = null;
	private currentTick = 0;
	private tickCallbacks: Array<UnifiedTickCallback> = [];

	private readonly emulator: GameBoyEmulator;
	private readonly voteAggregator: VoteAggregator;
	private readonly redis: Redis;
	private readonly logger: Logger;
	private readonly gameId: string;
	private readonly tickIntervalMs: number;
	private readonly emulatorSettleMs: number;

	constructor(
		emulator: GameBoyEmulator,
		voteAggregator: VoteAggregator,
		redis: Redis,
		logger: Logger,
		config: UnifiedTickProcessorConfig,
	) {
		this.emulator = emulator;
		this.voteAggregator = voteAggregator;
		this.redis = redis;
		this.logger = logger;
		this.gameId = config.gameId;
		this.tickIntervalMs = config.tickIntervalMs;
		this.emulatorSettleMs = config.emulatorSettleMs;
	}

	start(): void {
		if (this.timer !== null) {
			throw new Error('UnifiedTickProcessor is already running');
		}

		this.timer = setInterval(() => {
			this.processTick().catch((err: unknown) => {
				this.logger.error({ err, gameId: this.gameId }, 'Tick processing error');
			});
		}, this.tickIntervalMs);

		this.logger.info({ gameId: this.gameId, tickIntervalMs: this.tickIntervalMs }, 'Unified tick processor started');
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.logger.info({ gameId: this.gameId }, 'Unified tick processor stopped');
	}

	isRunning(): boolean {
		return this.timer !== null;
	}

	getCurrentTick(): number {
		return this.currentTick;
	}

	onTick(callback: UnifiedTickCallback): void {
		this.tickCallbacks.push(callback);
	}

	private async processTick(): Promise<void> {
		const tickId = this.currentTick;

		// 1. Tally votes
		const voteResult = await this.voteAggregator.tallyVotes(this.gameId, tickId);

		// 2. Press button (if votes exist)
		if (voteResult.totalVotes > 0) {
			const button = gameActionToGbButton(voteResult.winningAction);
			await this.emulator.pressButton(button);

			this.logger.info(
				{ action: voteResult.winningAction, button, totalVotes: voteResult.totalVotes },
				'Pressed button on emulator',
			);

			// Wait for emulator to process the input
			if (this.emulatorSettleMs > 0) {
				await this.emulator.waitMs(this.emulatorSettleMs);
			}
		} else {
			this.logger.debug({ gameId: this.gameId, tick: tickId }, 'No votes this tick');
		}

		// 3. Read RAM (always, even with no votes)
		const ram = await this.emulator.getRAM();

		// 4. Extract unified game state
		const gameState = extractUnifiedGameState(Array.from(ram), this.gameId, tickId);

		// 5. Persist state to Redis
		const stateJson = JSON.stringify(gameState);
		await this.redis.set(`${STATE_KEY_PREFIX}${this.gameId}`, stateJson);

		// 6. Broadcast to all connected agents via Redis pub/sub
		await this.redis.publish(`${STATE_CHANNEL_PREFIX}${this.gameId}`, stateJson);

		// 7. Clean up processed votes and append event
		if (voteResult.totalVotes > 0) {
			await this.voteAggregator.clearVotes(this.gameId, tickId);

			await this.redis.xadd(
				`${EVENTS_STREAM_PREFIX}${this.gameId}`,
				'*',
				'type',
				'ACTION',
				'turn',
				String(tickId),
				'action',
				voteResult.winningAction,
				'votes',
				String(voteResult.totalVotes),
				'description',
				`Executed ${voteResult.winningAction} (${voteResult.totalVotes} votes)`,
			);
		}

		this.logger.info(
			{
				gameId: this.gameId,
				tick: tickId,
				phase: gameState.phase,
				action: voteResult.totalVotes > 0 ? voteResult.winningAction : null,
				totalVotes: voteResult.totalVotes,
			},
			'Tick processed',
		);

		// 8. Notify callbacks
		await this.notifyCallbacks(gameState);

		// 9. Advance tick
		this.currentTick++;
	}

	private async notifyCallbacks(state: UnifiedGameState): Promise<void> {
		for (const cb of this.tickCallbacks) {
			try {
				await cb(state);
			} catch (err) {
				this.logger.error({ err }, 'Tick callback error');
			}
		}
	}
}
