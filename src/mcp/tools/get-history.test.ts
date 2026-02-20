import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameStateService, GetHistoryOutput } from '../../types/mcp.js';
import { requestContext } from '../request-context.js';
import { registerGetHistoryTool } from './get-history.js';

const mockHistory: GetHistoryOutput = {
	rounds: [
		{
			turn: 10,
			winningAction: 'move:0',
			actionCounts: { 'move:0': 5, 'move:1': 2, 'switch:1': 1 },
			outcome: 'Thunderbolt hit Blastoise for 94 damage — super effective!',
			yourAction: 'move:0',
			yourPoints: 15,
			timestamp: '2026-02-19T11:59:00.000Z',
		},
	],
	leaderboard: [
		{ rank: 1, agentId: 'agent-leader', score: 500 },
		{ rank: 2, agentId: 'agent-test', score: 200, isCurrentAgent: true },
	],
	yourStats: {
		totalTurns: 10,
		wins: 7,
		winRate: 0.7,
		bestStreak: 5,
		totalScore: 200,
		rank: 2,
	},
};

function makeService(history: GetHistoryOutput = mockHistory): GameStateService {
	return {
		getBattleState: vi.fn(),
		submitAction: vi.fn(),
		getRateLimit: vi.fn(),
		getHistory: vi.fn().mockResolvedValue(history),
	};
}

function captureHandler<T>(
	server: McpServer,
	toolName: string,
): { handler: ((args: T) => Promise<unknown>) | undefined } {
	const captured: { handler: ((args: T) => Promise<unknown>) | undefined } = { handler: undefined };
	const original = server.registerTool.bind(server);
	vi.spyOn(server, 'registerTool').mockImplementation((name, config, cb) => {
		if (name === toolName) {
			captured.handler = cb as (args: T) => Promise<unknown>;
		}
		return original(name, config, cb);
	});
	return captured;
}

describe('registerGetHistoryTool', () => {
	it('registers get_history tool on the server', () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		registerGetHistoryTool(server, makeService());
	});

	it('tool handler returns battle history with Pokemon outcomes', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureHandler<{ limit: number; includeLeaderboard: boolean }>(server, 'get_history');

		registerGetHistoryTool(server, service);

		expect(captured.handler).toBeDefined();

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({ limit: 10, includeLeaderboard: true });
		});

		expect(service.getHistory).toHaveBeenCalledWith('agent-test', 10, true);

		const content = (result as { content: Array<{ type: string; text: string }> }).content[0];
		const parsed = JSON.parse(content?.text ?? '{}') as GetHistoryOutput;
		expect(parsed.rounds).toHaveLength(1);
		expect(parsed.rounds[0]?.winningAction).toBe('move:0');
		expect(parsed.rounds[0]?.outcome).toContain('super effective');
		expect(parsed.yourStats.winRate).toBe(0.7);
		expect(parsed.leaderboard).toHaveLength(2);
	});

	it('tool handler passes custom limit and includeLeaderboard=false', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureHandler<{ limit: number; includeLeaderboard: boolean }>(server, 'get_history');

		registerGetHistoryTool(server, service);

		await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({ limit: 25, includeLeaderboard: false });
		});

		expect(service.getHistory).toHaveBeenCalledWith('agent-test', 25, false);
	});

	it('tool handler returns isError when service throws', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		(service.getHistory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

		const captured = captureHandler<{ limit: number; includeLeaderboard: boolean }>(server, 'get_history');
		registerGetHistoryTool(server, service);

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({ limit: 10, includeLeaderboard: true });
		});

		expect(result).toMatchObject({ isError: true });
	});
});
