import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import {
	type BattleAction,
	DEFAULT_FALLBACK_ACTION,
	VOTE_KEY_EXPIRY_SECONDS,
	type VoteResult,
	battleActionSchema,
} from './types.js';

const VOTES_KEY_PREFIX = 'votes:';

export class VoteAggregator {
	private readonly redis: Redis;
	private readonly logger: Logger;

	constructor(redis: Redis, logger: Logger) {
		this.redis = redis;
		this.logger = logger;
	}

	voteKey(gameId: string, tickId: number): string {
		return `${VOTES_KEY_PREFIX}${gameId}:${tickId}`;
	}

	async recordVote(gameId: string, tickId: number, action: BattleAction): Promise<void> {
		const key = this.voteKey(gameId, tickId);
		const pipeline = this.redis.pipeline();
		pipeline.zadd(key, 'INCR', 1, action);
		pipeline.expire(key, VOTE_KEY_EXPIRY_SECONDS);
		await pipeline.exec();
		this.logger.debug({ gameId, tickId, action }, 'Vote recorded');
	}

	async tallyVotes(gameId: string, tickId: number): Promise<VoteResult> {
		const key = this.voteKey(gameId, tickId);
		const raw = await this.redis.zrevrange(key, 0, -1, 'WITHSCORES');

		const voteCounts: Record<string, number> = {};
		let totalVotes = 0;
		let winningAction: BattleAction = DEFAULT_FALLBACK_ACTION;
		let highestCount = 0;

		for (let i = 0; i < raw.length - 1; i += 2) {
			const member = raw[i];
			const scoreStr = raw[i + 1];
			if (!(member && scoreStr)) continue;

			const count = Number.parseInt(scoreStr, 10);
			if (Number.isNaN(count)) continue;

			const parsed = battleActionSchema.safeParse(member);
			if (!parsed.success) continue;

			const action = parsed.data;
			voteCounts[action] = count;
			totalVotes += count;

			if (count > highestCount) {
				highestCount = count;
				winningAction = action;
			}
		}

		this.logger.debug({ gameId, tickId, winningAction, totalVotes }, 'Votes tallied');
		return { tickId, gameId, winningAction, voteCounts, totalVotes };
	}

	async clearVotes(gameId: string, tickId: number): Promise<void> {
		const key = this.voteKey(gameId, tickId);
		await this.redis.del(key);
		this.logger.debug({ gameId, tickId }, 'Votes cleared');
	}

	async getVoteCount(gameId: string, tickId: number, action: BattleAction): Promise<number> {
		const key = this.voteKey(gameId, tickId);
		const score = await this.redis.zscore(key, action);
		if (!score) return 0;
		const count = Number.parseInt(score, 10);
		return Number.isNaN(count) ? 0 : count;
	}
}
