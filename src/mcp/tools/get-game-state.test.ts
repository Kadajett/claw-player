import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameStateService, GetGameStateOutput } from '../../types/mcp.js';
import { requestContext } from '../request-context.js';
import { registerGetGameStateTool } from './get-game-state.js';

const mockState: GetGameStateOutput = {
	turn: 5,
	phase: 'battle',
	secondsRemaining: 9,
	availableActions: ['a', 'b', 'up', 'down', 'left', 'right', 'start', 'select'],
	player: {
		name: 'ASH',
		money: 5000,
		badges: 3,
		badgeList: ['Boulder', 'Cascade', 'Thunder'],
		location: { mapId: 1, mapName: 'Route 1', x: 5, y: 10 },
		direction: 'down',
		walkBikeSurf: 'walking',
	},
	party: [
		{
			species: 'Pikachu',
			speciesId: 25,
			nickname: 'PIKACHU',
			level: 25,
			hp: 42,
			maxHp: 52,
			status: 'none',
			moves: [{ name: 'Thunderbolt', moveId: 85, pp: 15, maxPp: 24, type: 'Electric', power: 95 }],
			stats: { attack: 55, defense: 40, speed: 90, specialAttack: 50, specialDefense: 50 },
		},
	],
	inventory: [{ itemId: 1, name: 'Potion', quantity: 5 }],
	battle: {
		type: 'wild',
		playerActive: {
			species: 'Pikachu',
			speciesId: 25,
			nickname: 'PIKACHU',
			level: 25,
			hp: 42,
			maxHp: 52,
			status: 'none',
			moves: [{ name: 'Thunderbolt', moveId: 85, pp: 15, maxPp: 24, type: 'Electric', power: 95 }],
			stats: { attack: 55, defense: 40, speed: 90, specialAttack: 50, specialDefense: 50 },
			types: ['Electric'],
		},
		opponent: {
			species: 'Blastoise',
			level: 36,
			hp: 50,
			maxHp: 134,
			status: 'none',
			types: ['Water'],
			knownMoves: [],
			stats: { attack: 83, defense: 100, speed: 78, specialAttack: 85, specialDefense: 85 },
			trainerClass: 0,
			partyCount: 1,
		},
		moveEffectiveness: [{ slot: 0, moveName: 'Thunderbolt', effectiveness: 2 }],
		statModifiers: {
			player: { attack: 0, defense: 0, speed: 0, special: 0, accuracy: 0, evasion: 0 },
			enemy: { attack: 0, defense: 0, speed: 0, special: 0, accuracy: 0, evasion: 0 },
		},
		battleStatus: { playerFlags: [], enemyFlags: [] },
		turnCount: 3,
	},
	overworld: null,
	screenText: null,
	menuState: null,
	progress: { playTimeHours: 10, playTimeMinutes: 30, pokedexOwned: 35, pokedexSeen: 60 },
	yourScore: 100,
	yourRank: 2,
	totalAgents: 5,
	streak: 3,
	tip: 'Thunderbolt is super effective (2x) against Blastoise!',
};

function makeService(state: GetGameStateOutput = mockState): GameStateService {
	return {
		getBattleState: vi.fn(),
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
		registerGetGameStateTool(server, makeService());
	});

	it('tool handler returns unified game state for authenticated agent', async () => {
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
		expect(parsed.turn).toBe(5);
		expect(parsed.phase).toBe('battle');
		expect(parsed.battle?.playerActive.species).toBe('Pikachu');
		expect(parsed.battle?.opponent.species).toBe('Blastoise');
		expect(parsed.streak).toBe(3);
		expect(parsed.availableActions).toContain('a');
	});

	it('tool handler returns isError when service throws', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		(service.getGameState as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Emulator unavailable'));

		const captured = captureToolHandler(server, 'get_game_state');
		registerGetGameStateTool(server, service);

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(result).toMatchObject({ isError: true });
	});
});
