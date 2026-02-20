import { describe, expect, it } from 'vitest';
import {
	HomeClientMessageSchema,
	HomeHeartbeatAckSchema,
	HomeStatePushSchema,
	HomeVotesRequestSchema,
	RelayAuthSchema,
	RelayErrorSchema,
	RelayHeartbeatSchema,
	RelayMessageSchema,
	RelayStateUpdateSchema,
	RelayVoteBatchSchema,
} from './types.js';

const validPokemonState = {
	species: 'Charizard',
	level: 36,
	hp: 112,
	maxHp: 126,
	attack: 80,
	defense: 70,
	specialAttack: 90,
	specialDefense: 75,
	speed: 100,
	status: 'none',
	types: ['fire', 'flying'],
	moves: [
		{
			name: 'Flamethrower',
			pokemonType: 'fire',
			power: 95,
			accuracy: 100,
			pp: 12,
			maxPp: 15,
			category: 'special',
		},
	],
};

const validOpponentState = {
	species: 'Blastoise',
	hp: 77,
	maxHp: 120,
	hpPercent: 64,
	status: 'none',
	types: ['water'],
	level: 38,
	attack: 83,
	defense: 100,
	specialAttack: 85,
	specialDefense: 85,
	speed: 78,
	moves: [
		{
			name: 'Hydro Pump',
			pokemonType: 'water',
			power: 120,
			accuracy: 80,
			pp: 5,
			maxPp: 5,
			category: 'special',
		},
	],
};

const validBattleState = {
	gameId: 'game-1',
	turn: 5,
	phase: 'choose_action',
	playerActive: validPokemonState,
	playerParty: [],
	opponent: validOpponentState,
	availableActions: ['a', 'b'],
	weather: 'none',
	turnHistory: [],
	lastAction: null,
	createdAt: 1_000_000,
	updatedAt: 1_000_100,
};

const validGameState = {
	gameId: 'game-1',
	turn: 5,
	phase: 'battle',
	player: {
		name: 'RED',
		money: 1000,
		badges: 2,
		badgeList: ['Boulder', 'Cascade'],
		location: { mapId: 1, mapName: 'Route 1', x: 10, y: 20 },
		direction: 'down',
		walkBikeSurf: 'walking',
	},
	party: [],
	inventory: [],
	battle: validBattleState,
	overworld: null,
	screen: { textBoxActive: false, menuState: null, menuText: null, screenText: null },
	progress: { playTimeHours: 1, playTimeMinutes: 30, pokedexOwned: 5, pokedexSeen: 10 },
};

describe('RelayVoteBatchSchema', () => {
	it('parses a valid vote batch with GameAction', () => {
		const result = RelayVoteBatchSchema.safeParse({
			type: 'vote_batch',
			tickId: 3,
			gameId: 'game-1',
			votes: [{ agentId: 'agent-1', action: 'a', timestamp: 1_700_000_000 }],
		});
		expect(result.success).toBe(true);
	});

	it('accepts all valid GameAction values', () => {
		const actions = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
		for (const action of actions) {
			const result = RelayVoteBatchSchema.safeParse({
				type: 'vote_batch',
				tickId: 3,
				gameId: 'game-1',
				votes: [{ agentId: 'agent-1', action, timestamp: 1_700_000_000 }],
			});
			expect(result.success).toBe(true);
		}
	});

	it('rejects missing votes array', () => {
		const result = RelayVoteBatchSchema.safeParse({
			type: 'vote_batch',
			tickId: 3,
			gameId: 'game-1',
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid action in votes', () => {
		const result = RelayVoteBatchSchema.safeParse({
			type: 'vote_batch',
			tickId: 3,
			gameId: 'game-1',
			votes: [{ agentId: 'agent-1', action: 'invalid-action', timestamp: 1_700_000_000 }],
		});
		expect(result.success).toBe(false);
	});

	it('rejects old-format BattleAction values', () => {
		const oldActions = ['move:0', 'move:1', 'move:2', 'move:3', 'switch:0', 'switch:5', 'run'];
		for (const action of oldActions) {
			const result = RelayVoteBatchSchema.safeParse({
				type: 'vote_batch',
				tickId: 3,
				gameId: 'game-1',
				votes: [{ agentId: 'agent-1', action, timestamp: 1_700_000_000 }],
			});
			expect(result.success).toBe(false);
		}
	});
});

describe('RelayStateUpdateSchema', () => {
	it('parses a valid state update with unified game state', () => {
		const result = RelayStateUpdateSchema.safeParse({
			type: 'state_update',
			tickId: 5,
			gameId: 'game-1',
			state: validGameState,
		});
		expect(result.success).toBe(true);
	});

	it('passes through extra state fields', () => {
		const result = RelayStateUpdateSchema.safeParse({
			type: 'state_update',
			tickId: 5,
			gameId: 'game-1',
			state: validGameState,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.state.phase).toBe('battle');
			expect(result.data.state.gameId).toBe('game-1');
		}
	});

	it('rejects state missing required fields', () => {
		const result = RelayStateUpdateSchema.safeParse({
			type: 'state_update',
			tickId: 5,
			gameId: 'game-1',
			state: { someField: 'not a valid state' },
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing state', () => {
		const result = RelayStateUpdateSchema.safeParse({
			type: 'state_update',
			tickId: 5,
			gameId: 'game-1',
		});
		expect(result.success).toBe(false);
	});
});

describe('RelayHeartbeatSchema', () => {
	it('parses a valid heartbeat', () => {
		const result = RelayHeartbeatSchema.safeParse({ type: 'heartbeat', timestamp: 1_700_000_000 });
		expect(result.success).toBe(true);
	});

	it('rejects missing timestamp', () => {
		const result = RelayHeartbeatSchema.safeParse({ type: 'heartbeat' });
		expect(result.success).toBe(false);
	});
});

describe('RelayAuthSchema', () => {
	it('parses a valid auth message', () => {
		const result = RelayAuthSchema.safeParse({ type: 'auth', secret: 'supersecretvalue' });
		expect(result.success).toBe(true);
	});

	it('rejects empty secret', () => {
		const result = RelayAuthSchema.safeParse({ type: 'auth', secret: '' });
		expect(result.success).toBe(false);
	});
});

describe('RelayErrorSchema', () => {
	it('parses a valid error message', () => {
		const result = RelayErrorSchema.safeParse({ type: 'error', code: 'AUTH_FAILED', message: 'Bad credentials' });
		expect(result.success).toBe(true);
	});
});

describe('RelayMessageSchema discriminated union', () => {
	it('parses a heartbeat via union', () => {
		const result = RelayMessageSchema.safeParse({ type: 'heartbeat', timestamp: 1_700_000_000 });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('heartbeat');
		}
	});

	it('parses an error via union', () => {
		const result = RelayMessageSchema.safeParse({ type: 'error', code: 'X', message: 'y' });
		expect(result.success).toBe(true);
	});

	it('rejects unknown type', () => {
		const result = RelayMessageSchema.safeParse({ type: 'unknown_type' });
		expect(result.success).toBe(false);
	});
});

describe('HomeVotesRequestSchema', () => {
	it('parses a valid votes_request', () => {
		const result = HomeVotesRequestSchema.safeParse({ type: 'votes_request', tickId: 2, gameId: 'game-1' });
		expect(result.success).toBe(true);
	});
});

describe('HomeStatePushSchema', () => {
	it('parses a valid state_push with unified game state', () => {
		const result = HomeStatePushSchema.safeParse({
			type: 'state_push',
			tickId: 5,
			gameId: 'game-1',
			state: validGameState,
		});
		expect(result.success).toBe(true);
	});

	it('rejects state missing required fields', () => {
		const result = HomeStatePushSchema.safeParse({
			type: 'state_push',
			tickId: 5,
			gameId: 'game-1',
			state: { someField: 'not valid' },
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing state', () => {
		const result = HomeStatePushSchema.safeParse({ type: 'state_push', tickId: 5, gameId: 'game-1' });
		expect(result.success).toBe(false);
	});
});

describe('HomeHeartbeatAckSchema', () => {
	it('parses a valid heartbeat_ack', () => {
		const result = HomeHeartbeatAckSchema.safeParse({ type: 'heartbeat_ack', timestamp: 1_700_000_000 });
		expect(result.success).toBe(true);
	});
});

describe('HomeClientMessageSchema discriminated union', () => {
	it('parses votes_request', () => {
		const result = HomeClientMessageSchema.safeParse({ type: 'votes_request', tickId: 1, gameId: 'g' });
		expect(result.success).toBe(true);
	});

	it('parses state_push', () => {
		const result = HomeClientMessageSchema.safeParse({
			type: 'state_push',
			tickId: 1,
			gameId: 'g',
			state: validGameState,
		});
		expect(result.success).toBe(true);
	});

	it('parses heartbeat_ack', () => {
		const result = HomeClientMessageSchema.safeParse({ type: 'heartbeat_ack', timestamp: 1_700_000_000 });
		expect(result.success).toBe(true);
	});

	it('rejects unknown type', () => {
		const result = HomeClientMessageSchema.safeParse({ type: 'not_real' });
		expect(result.success).toBe(false);
	});
});
