import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { TOKEN_BUCKET_SCRIPT, VOTE_DEDUP_SCRIPT, runTokenBucket, runVoteDedup } from './lua-scripts.js';

describe('TOKEN_BUCKET_SCRIPT', () => {
	it('is a non-empty string', () => {
		expect(typeof TOKEN_BUCKET_SCRIPT).toBe('string');
		expect(TOKEN_BUCKET_SCRIPT.length).toBeGreaterThan(0);
	});

	it('contains key Lua operations', () => {
		expect(TOKEN_BUCKET_SCRIPT).toContain('HMGET');
		expect(TOKEN_BUCKET_SCRIPT).toContain('HMSET');
		expect(TOKEN_BUCKET_SCRIPT).toContain('EXPIRE');
	});
});

describe('runTokenBucket', () => {
	it('returns allowed=true when tokens are available', async () => {
		const mockEval = vi.fn().mockResolvedValue([1, 19]);
		const client = { eval: mockEval } as unknown as Redis;

		const result = await runTokenBucket(client, 'rl:test', Date.now(), 20, 30, 1);

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(19);
		expect(mockEval).toHaveBeenCalledOnce();
	});

	it('returns allowed=false when rate limited', async () => {
		const mockEval = vi.fn().mockResolvedValue([0, 0]);
		const client = { eval: mockEval } as unknown as Redis;

		const result = await runTokenBucket(client, 'rl:test', Date.now(), 20, 30, 1);

		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it('throws on unexpected Lua result', async () => {
		const mockEval = vi.fn().mockResolvedValue('unexpected');
		const client = { eval: mockEval } as unknown as Redis;

		await expect(runTokenBucket(client, 'rl:test', Date.now(), 20, 30, 1)).rejects.toThrow(
			'Unexpected Lua script result',
		);
	});

	it('passes correct arguments to eval', async () => {
		const mockEval = vi.fn().mockResolvedValue([1, 5]);
		const client = { eval: mockEval } as unknown as Redis;

		const now = 1700000000000;
		await runTokenBucket(client, 'rl:agent-1', now, 5, 8, 1);

		expect(mockEval).toHaveBeenCalledWith(TOKEN_BUCKET_SCRIPT, 1, 'rl:agent-1', now, 5, 8, 1);
	});
});

describe('VOTE_DEDUP_SCRIPT', () => {
	it('is a non-empty string', () => {
		expect(typeof VOTE_DEDUP_SCRIPT).toBe('string');
		expect(VOTE_DEDUP_SCRIPT.length).toBeGreaterThan(0);
	});

	it('contains key Lua operations', () => {
		expect(VOTE_DEDUP_SCRIPT).toContain('HGET');
		expect(VOTE_DEDUP_SCRIPT).toContain('HSET');
		expect(VOTE_DEDUP_SCRIPT).toContain('ZINCRBY');
		expect(VOTE_DEDUP_SCRIPT).toContain('EXPIRE');
	});
});

describe('runVoteDedup', () => {
	it('returns new for code 1', async () => {
		const mockEval = vi.fn().mockResolvedValue(1);
		const client = { eval: mockEval } as unknown as Redis;

		const result = await runVoteDedup(client, 'agent_votes:g:1', 'votes:g:1', 'agent-1', 'move:0', 3600);

		expect(result.status).toBe('new');
		expect(mockEval).toHaveBeenCalledOnce();
	});

	it('returns duplicate for code 0', async () => {
		const mockEval = vi.fn().mockResolvedValue(0);
		const client = { eval: mockEval } as unknown as Redis;

		const result = await runVoteDedup(client, 'agent_votes:g:1', 'votes:g:1', 'agent-1', 'move:0', 3600);

		expect(result.status).toBe('duplicate');
	});

	it('returns changed for code 2', async () => {
		const mockEval = vi.fn().mockResolvedValue(2);
		const client = { eval: mockEval } as unknown as Redis;

		const result = await runVoteDedup(client, 'agent_votes:g:1', 'votes:g:1', 'agent-1', 'move:1', 3600);

		expect(result.status).toBe('changed');
	});

	it('passes correct arguments to eval with 2 keys', async () => {
		const mockEval = vi.fn().mockResolvedValue(1);
		const client = { eval: mockEval } as unknown as Redis;

		await runVoteDedup(client, 'agent_votes:g:5', 'votes:g:5', 'agent-42', 'run', 7200);

		expect(mockEval).toHaveBeenCalledWith(
			VOTE_DEDUP_SCRIPT,
			2,
			'agent_votes:g:5',
			'votes:g:5',
			'agent-42',
			'run',
			7200,
		);
	});
});
