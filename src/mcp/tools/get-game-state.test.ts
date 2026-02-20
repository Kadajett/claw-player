import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameStateService, GetGameStateOutput } from '../../types/mcp.js';
import { requestContext } from '../request-context.js';
import { registerGetGameStateTool } from './get-game-state.js';

const mockState: GetGameStateOutput = {
	round: 5,
	phase: 'voting',
	secondsRemaining: 7,
	clawPosition: { x: 40, y: 60 },
	prizes: [{ id: 'p1', name: 'Duck', value: 75, position: { x: 40, y: 60 } }],
	yourScore: 100,
	yourRank: 2,
	totalAgents: 5,
	streak: 1,
	achievementsPending: [
		{
			id: 'hot-streak',
			name: 'Hot Streak',
			description: '5 wins in a row',
			current: 1,
			required: 5,
			percentComplete: 20,
		},
	],
	leaderboard: [
		{ rank: 1, agentId: 'agent-leader', score: 200 },
		{ rank: 2, agentId: 'agent-test', score: 100, isCurrentAgent: true },
	],
	nextBonusRoundIn: 3,
	tip: 'The claw is directly above a prize — try grab!',
};

function makeService(state: GetGameStateOutput = mockState): GameStateService {
	return {
		getGameState: vi.fn().mockResolvedValue(state),
		submitAction: vi.fn(),
		getRateLimit: vi.fn(),
		getHistory: vi.fn(),
	};
}

function captureToolHandler(
	server: McpServer,
	toolName: string,
): { handler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined } {
	const captured: { handler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined } = {
		handler: undefined,
	};
	const original = server.registerTool.bind(server);
	vi.spyOn(server, 'registerTool').mockImplementation((name, config, cb) => {
		if (name === toolName) {
			captured.handler = cb as (args: Record<string, unknown>) => Promise<unknown>;
		}
		return original(name, config, cb);
	});
	return captured;
}

describe('registerGetGameStateTool', () => {
	it('registers get_game_state tool on the server', () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		registerGetGameStateTool(server, service);
	});

	it('tool handler returns game state for authenticated agent', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureToolHandler(server, 'get_game_state');

		registerGetGameStateTool(server, service);

		expect(captured.handler).toBeDefined();

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(service.getGameState).toHaveBeenCalledWith('agent-test');
		expect(result).toMatchObject({ content: [{ type: 'text' }] });

		const content = (result as { content: Array<{ type: string; text: string }> }).content[0];
		const parsed = JSON.parse(content?.text ?? '{}') as GetGameStateOutput;
		expect(parsed.round).toBe(5);
		expect(parsed.phase).toBe('voting');
		expect(parsed.tip).toContain('grab');
	});

	it('tool handler returns isError when service throws', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		(service.getGameState as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Game engine unavailable'));

		const captured = captureToolHandler(server, 'get_game_state');
		registerGetGameStateTool(server, service);

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(result).toMatchObject({ isError: true });
	});
});
