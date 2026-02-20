import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameStateService, GetBattleStateOutput } from '../../types/mcp.js';
import { requestContext } from '../request-context.js';
import { registerGetGameStateTool } from './get-game-state.js';

const baseMove = {
	index: 0,
	name: 'Thunderbolt',
	type: 'Electric',
	pp: 15,
	maxPp: 24,
	power: 95,
	accuracy: 100,
	category: 'special' as const,
	disabled: false,
};

const mockState: GetBattleStateOutput = {
	turn: 5,
	phase: 'voting',
	secondsRemaining: 9,
	isPlayerTurn: true,
	weather: null,
	playerPokemon: {
		name: 'Pikachu',
		species: 'Pikachu',
		level: 25,
		currentHp: 42,
		maxHp: 52,
		hpPercent: 80.8,
		status: null,
		types: ['Electric'],
		moves: [baseMove],
	},
	opponentPokemon: {
		name: 'Blastoise',
		species: 'Blastoise',
		level: 36,
		currentHp: 50,
		maxHp: 134,
		hpPercent: 37.3,
		status: null,
		types: ['Water'],
	},
	playerParty: [],
	availableActions: ['a', 'b', 'up', 'down', 'left', 'right', 'start', 'select'],
	typeMatchups: {},
	yourScore: 100,
	yourRank: 2,
	totalAgents: 5,
	streak: 3,
	achievementsPending: [
		{
			id: 'super-effective',
			name: 'Super Effective Specialist',
			description: 'Use 10 super effective moves',
			current: 7,
			required: 10,
			percentComplete: 70,
		},
	],
	leaderboard: [
		{ rank: 1, agentId: 'agent-leader', score: 200 },
		{ rank: 2, agentId: 'agent-test', score: 100, isCurrentAgent: true },
	],
	nextBonusRoundIn: 5,
	tip: 'Thunderbolt is neutral vs Blastoise. Consider a Grass move for super effective damage.',
};

function makeService(state: GetBattleStateOutput = mockState): GameStateService {
	return {
		getBattleState: vi.fn().mockResolvedValue(state),
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
		registerGetGameStateTool(server, makeService());
	});

	it('tool handler returns Pokemon battle state for authenticated agent', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureToolHandler(server, 'get_game_state');

		registerGetGameStateTool(server, service);

		expect(captured.handler).toBeDefined();

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(service.getBattleState).toHaveBeenCalledWith('agent-test');
		expect(result).toMatchObject({ content: [{ type: 'text' }] });

		const content = (result as { content: Array<{ type: string; text: string }> }).content[0];
		const parsed = JSON.parse(content?.text ?? '{}') as GetBattleStateOutput;
		expect(parsed.turn).toBe(5);
		expect(parsed.phase).toBe('voting');
		expect(parsed.playerPokemon.name).toBe('Pikachu');
		expect(parsed.opponentPokemon.name).toBe('Blastoise');
		expect(parsed.streak).toBe(3);
		expect(parsed.availableActions).toContain('a');
	});

	it('tool handler returns isError when service throws', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		(service.getBattleState as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Emulator unavailable'));

		const captured = captureToolHandler(server, 'get_game_state');
		registerGetGameStateTool(server, service);

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(result).toMatchObject({ isError: true });
	});
});
