import { compare } from 'fast-json-patch';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { type BattleState, SNAPSHOT_INTERVAL, type StateDelta, battleStateSchema } from './types.js';

const STATE_KEY_PREFIX = 'game:state:';
const SNAPSHOT_KEY_PREFIX = 'game:snapshot:';
const EVENTS_STREAM_PREFIX = 'game_events:';
const SNAPSHOT_TTL_SECONDS = 86400; // 24h

export class StateManager {
	private readonly redis: Redis;
	private readonly logger: Logger;

	constructor(redis: Redis, logger: Logger) {
		this.redis = redis;
		this.logger = logger;
	}

	stateKey(gameId: string): string {
		return `${STATE_KEY_PREFIX}${gameId}`;
	}

	snapshotKey(gameId: string, turn: number): string {
		return `${SNAPSHOT_KEY_PREFIX}${gameId}:${turn}`;
	}

	eventsKey(gameId: string): string {
		return `${EVENTS_STREAM_PREFIX}${gameId}`;
	}

	async saveState(state: BattleState): Promise<void> {
		const json = JSON.stringify(state);
		const pipeline = this.redis.pipeline();
		pipeline.set(this.stateKey(state.gameId), json);

		if (state.turn % SNAPSHOT_INTERVAL === 0) {
			pipeline.set(this.snapshotKey(state.gameId, state.turn), json);
			pipeline.expire(this.snapshotKey(state.gameId, state.turn), SNAPSHOT_TTL_SECONDS);
		}

		await pipeline.exec();
		this.logger.debug({ gameId: state.gameId, turn: state.turn }, 'Battle state saved');
	}

	async loadState(gameId: string): Promise<BattleState | null> {
		const json = await this.redis.get(this.stateKey(gameId));
		if (!json) return null;

		const parsed: unknown = JSON.parse(json);
		const result = battleStateSchema.safeParse(parsed);

		if (!result.success) {
			this.logger.error({ gameId, errors: result.error.flatten() }, 'Invalid battle state in Redis');
			return null;
		}

		return result.data;
	}

	async loadSnapshot(gameId: string, turn: number): Promise<BattleState | null> {
		const json = await this.redis.get(this.snapshotKey(gameId, turn));
		if (!json) return null;

		const parsed: unknown = JSON.parse(json);
		const result = battleStateSchema.safeParse(parsed);

		if (!result.success) {
			this.logger.error({ gameId, turn, errors: result.error.flatten() }, 'Invalid snapshot in Redis');
			return null;
		}

		return result.data;
	}

	async appendEvent(gameId: string, turn: number, action: string, votes: number, description: string): Promise<void> {
		await this.redis.xadd(
			this.eventsKey(gameId),
			'*',
			'type',
			'ACTION',
			'turn',
			String(turn),
			'action',
			action,
			'votes',
			String(votes),
			'description',
			description,
		);
		this.logger.debug({ gameId, turn, action, votes }, 'Battle event appended to stream');
	}

	computeDelta(gameId: string, turn: number, previous: BattleState, current: BattleState): StateDelta {
		const patches = compare(
			previous as unknown as Record<string, unknown>,
			current as unknown as Record<string, unknown>,
		);
		return { turn, gameId, patches };
	}

	async publishState(gameId: string, state: BattleState): Promise<void> {
		const channel = `game_state:${gameId}`;
		await this.redis.publish(channel, JSON.stringify(state));
		this.logger.debug({ gameId, turn: state.turn }, 'Battle state published to pub/sub');
	}

	async deleteState(gameId: string): Promise<void> {
		await this.redis.del(this.stateKey(gameId));
		this.logger.debug({ gameId }, 'Battle state deleted');
	}
}
