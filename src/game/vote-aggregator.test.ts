import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VoteAggregator } from './vote-aggregator.js';

function makeMockRedis(overrides?: { zrevrange?: Array<string>; zscore?: string | null; evalResult?: number }) {
	return {
		eval: vi.fn().mockResolvedValue(overrides?.evalResult ?? 1),
		zrevrange: vi.fn().mockResolvedValue(overrides?.zrevrange ?? []),
		zscore: vi.fn().mockResolvedValue(overrides?.zscore ?? null),
		del: vi.fn().mockResolvedValue(1),
	};
}

const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

describe('VoteAggregator', () => {
	let redis: ReturnType<typeof makeMockRedis>;
	let aggregator: VoteAggregator;

	beforeEach(() => {
		redis = makeMockRedis();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		aggregator = new VoteAggregator(redis as any, mockLogger as any);
		vi.clearAllMocks();
	});

	describe('voteKey', () => {
		it('generates correct key', () => {
			expect(aggregator.voteKey('game-1', 5)).toBe('votes:game-1:5');
		});
	});

	describe('agentVoteKey', () => {
		it('generates correct key', () => {
			expect(aggregator.agentVoteKey('game-1', 5)).toBe('agent_votes:game-1:5');
		});
	});

	describe('recordVote', () => {
		it('calls eval with dedup script and correct keys', async () => {
			redis = makeMockRedis({ evalResult: 1 });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.recordVote('game-1', 3, 'agent-42', 'move:0');

			expect(redis.eval).toHaveBeenCalledOnce();
			const args = redis.eval.mock.calls[0];
			expect(args[1]).toBe(2); // 2 KEYS
			expect(args[2]).toBe('agent_votes:game-1:3');
			expect(args[3]).toBe('votes:game-1:3');
			expect(args[4]).toBe('agent-42');
			expect(args[5]).toBe('move:0');
			expect(result.status).toBe('new');
		});

		it('returns duplicate when agent votes same action', async () => {
			redis = makeMockRedis({ evalResult: 0 });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.recordVote('game-1', 3, 'agent-42', 'move:0');
			expect(result.status).toBe('duplicate');
		});

		it('returns changed when agent switches vote', async () => {
			redis = makeMockRedis({ evalResult: 2 });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.recordVote('game-1', 3, 'agent-42', 'move:1');
			expect(result.status).toBe('changed');
		});
	});

	describe('tallyVotes', () => {
		it('returns default action when no votes', async () => {
			redis = makeMockRedis({ zrevrange: [] });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.tallyVotes('game-1', 5);

			expect(result.totalVotes).toBe(0);
			expect(result.tickId).toBe(5);
			expect(result.gameId).toBe('game-1');
		});

		it('correctly tallies votes and picks winner', async () => {
			const raw = ['move:0', '10', 'run', '5', 'switch:1', '3'];
			redis = makeMockRedis({ zrevrange: raw });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.tallyVotes('game-1', 5);

			expect(result.winningAction).toBe('move:0');
			expect(result.totalVotes).toBe(18);
			expect(result.voteCounts['move:0']).toBe(10);
			expect(result.voteCounts.run).toBe(5);
			expect(result.voteCounts['switch:1']).toBe(3);
		});

		it('ignores invalid action names in Redis', async () => {
			const raw = ['move:0', '5', 'fly', '99'];
			redis = makeMockRedis({ zrevrange: raw });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.tallyVotes('game-1', 5);

			expect(result.winningAction).toBe('move:0');
			expect(result.totalVotes).toBe(5);
		});

		it('ignores entries with non-numeric scores', async () => {
			const raw = ['move:0', 'NaN', 'run', '3'];
			redis = makeMockRedis({ zrevrange: raw });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const result = await aggregator.tallyVotes('game-1', 5);

			expect(result.winningAction).toBe('run');
			expect(result.totalVotes).toBe(3);
		});
	});

	describe('clearVotes', () => {
		it('calls redis.del with both tally and agent vote keys', async () => {
			redis = makeMockRedis();
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			await aggregator.clearVotes('game-1', 7);

			expect(redis.del).toHaveBeenCalledWith('votes:game-1:7', 'agent_votes:game-1:7');
		});
	});

	describe('getVoteCount', () => {
		it('returns 0 when no score', async () => {
			redis = makeMockRedis({ zscore: null });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const count = await aggregator.getVoteCount('game-1', 5, 'move:0');
			expect(count).toBe(0);
		});

		it('returns parsed count when score exists', async () => {
			redis = makeMockRedis({ zscore: '7' });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const count = await aggregator.getVoteCount('game-1', 5, 'move:0');
			expect(count).toBe(7);
		});

		it('returns 0 when score is NaN string', async () => {
			redis = makeMockRedis({ zscore: 'bad' });
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			aggregator = new VoteAggregator(redis as any, mockLogger as any);

			const count = await aggregator.getVoteCount('game-1', 5, 'run');
			expect(count).toBe(0);
		});
	});
});
