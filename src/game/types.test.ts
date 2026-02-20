import { describe, expect, it } from 'vitest';

import {
	BattlePhase,
	DEFAULT_FALLBACK_ACTION,
	DEFAULT_TICK_INTERVAL_MS,
	PokemonType,
	SNAPSHOT_INTERVAL,
	StatusCondition,
	VALID_MOVE_INDICES,
	VALID_SWITCH_INDICES,
	VOTE_KEY_EXPIRY_SECONDS,
	battleActionSchema,
	battlePhaseSchema,
	battleStateSchema,
	moveDataSchema,
	pokemonStateSchema,
	pokemonTypeSchema,
	statusConditionSchema,
	voteResultSchema,
	voteSchema,
} from './types.js';

describe('constants', () => {
	it('has positive SNAPSHOT_INTERVAL', () => {
		expect(SNAPSHOT_INTERVAL).toBeGreaterThan(0);
	});

	it('has positive VOTE_KEY_EXPIRY_SECONDS', () => {
		expect(VOTE_KEY_EXPIRY_SECONDS).toBeGreaterThan(0);
	});

	it('has positive DEFAULT_TICK_INTERVAL_MS', () => {
		expect(DEFAULT_TICK_INTERVAL_MS).toBeGreaterThan(0);
	});

	it('has valid VALID_MOVE_INDICES', () => {
		expect(VALID_MOVE_INDICES).toEqual([0, 1, 2, 3]);
	});

	it('has valid VALID_SWITCH_INDICES', () => {
		expect(VALID_SWITCH_INDICES).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('DEFAULT_FALLBACK_ACTION is a valid move action', () => {
		const parsed = battleActionSchema.safeParse(DEFAULT_FALLBACK_ACTION);
		expect(parsed.success).toBe(true);
	});
});

describe('PokemonType enum', () => {
	it('has 15 Gen 1 types', () => {
		expect(Object.values(PokemonType)).toHaveLength(15);
	});

	it('includes key types', () => {
		expect(PokemonType.Fire).toBe('fire');
		expect(PokemonType.Water).toBe('water');
		expect(PokemonType.Psychic).toBe('psychic');
		expect(PokemonType.Dragon).toBe('dragon');
	});
});

describe('StatusCondition enum', () => {
	it('has 6 status conditions', () => {
		expect(Object.values(StatusCondition)).toHaveLength(6);
	});

	it('includes none status', () => {
		expect(StatusCondition.None).toBe('none');
	});
});

describe('BattlePhase enum', () => {
	it('has expected phases', () => {
		expect(BattlePhase.ChooseAction).toBe('choose_action');
		expect(BattlePhase.BattleOver).toBe('battle_over');
		expect(BattlePhase.FaintedSwitch).toBe('fainted_switch');
	});
});

describe('pokemonTypeSchema', () => {
	it('accepts valid types', () => {
		expect(pokemonTypeSchema.safeParse('fire').success).toBe(true);
		expect(pokemonTypeSchema.safeParse('dragon').success).toBe(true);
	});

	it('rejects invalid type', () => {
		expect(pokemonTypeSchema.safeParse('steel').success).toBe(false);
	});
});

describe('statusConditionSchema', () => {
	it('accepts all conditions', () => {
		for (const val of Object.values(StatusCondition)) {
			expect(statusConditionSchema.safeParse(val).success).toBe(true);
		}
	});

	it('rejects invalid condition', () => {
		expect(statusConditionSchema.safeParse('confuse').success).toBe(false);
	});
});

describe('moveDataSchema', () => {
	const validMove = {
		name: 'Flamethrower',
		pokemonType: 'fire',
		power: 95,
		accuracy: 100,
		pp: 15,
		maxPp: 15,
		category: 'special',
	};

	it('accepts valid move', () => {
		expect(moveDataSchema.safeParse(validMove).success).toBe(true);
	});

	it('rejects negative power', () => {
		expect(moveDataSchema.safeParse({ ...validMove, power: -1 }).success).toBe(false);
	});

	it('rejects accuracy over 100', () => {
		expect(moveDataSchema.safeParse({ ...validMove, accuracy: 101 }).success).toBe(false);
	});
});

describe('pokemonStateSchema', () => {
	const validPokemon = {
		species: 'Charizard',
		level: 50,
		hp: 150,
		maxHp: 150,
		attack: 84,
		defense: 78,
		specialAttack: 109,
		specialDefense: 85,
		speed: 100,
		status: 'none',
		types: ['fire', 'flying'],
		moves: [],
	};

	it('accepts valid pokemon', () => {
		expect(pokemonStateSchema.safeParse(validPokemon).success).toBe(true);
	});

	it('rejects level over 100', () => {
		expect(pokemonStateSchema.safeParse({ ...validPokemon, level: 101 }).success).toBe(false);
	});

	it('rejects more than 2 types', () => {
		expect(pokemonStateSchema.safeParse({ ...validPokemon, types: ['fire', 'flying', 'water'] }).success).toBe(false);
	});

	it('rejects 0 types', () => {
		expect(pokemonStateSchema.safeParse({ ...validPokemon, types: [] }).success).toBe(false);
	});
});

describe('battleActionSchema', () => {
	it('accepts move actions', () => {
		for (const i of [0, 1, 2, 3]) {
			expect(battleActionSchema.safeParse(`move:${i}`).success).toBe(true);
		}
	});

	it('accepts switch actions', () => {
		for (const i of [0, 1, 2, 3, 4, 5]) {
			expect(battleActionSchema.safeParse(`switch:${i}`).success).toBe(true);
		}
	});

	it('accepts run', () => {
		expect(battleActionSchema.safeParse('run').success).toBe(true);
	});

	it('rejects out-of-range move index', () => {
		expect(battleActionSchema.safeParse('move:4').success).toBe(false);
		expect(battleActionSchema.safeParse('move:-1').success).toBe(false);
	});

	it('rejects out-of-range switch index', () => {
		expect(battleActionSchema.safeParse('switch:6').success).toBe(false);
	});

	it('rejects invalid action', () => {
		expect(battleActionSchema.safeParse('attack').success).toBe(false);
		expect(battleActionSchema.safeParse('').success).toBe(false);
	});
});

describe('battlePhaseSchema', () => {
	it('accepts valid phases', () => {
		for (const val of Object.values(BattlePhase)) {
			expect(battlePhaseSchema.safeParse(val).success).toBe(true);
		}
	});
});

describe('voteSchema', () => {
	const valid = {
		agentId: 'agent-1',
		action: 'move:0',
		tickId: 5,
		gameId: 'game-1',
		timestamp: Date.now(),
	};

	it('accepts valid vote', () => {
		expect(voteSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects negative tickId', () => {
		expect(voteSchema.safeParse({ ...valid, tickId: -1 }).success).toBe(false);
	});

	it('rejects invalid action', () => {
		expect(voteSchema.safeParse({ ...valid, action: 'fly' }).success).toBe(false);
	});
});

describe('voteResultSchema', () => {
	const valid = {
		tickId: 3,
		gameId: 'game-1',
		winningAction: 'move:0',
		voteCounts: { 'move:0': 5, run: 2 },
		totalVotes: 7,
	};

	it('accepts valid vote result', () => {
		expect(voteResultSchema.safeParse(valid).success).toBe(true);
	});
});

describe('battleStateSchema', () => {
	const validPokemon = {
		species: 'Pikachu',
		level: 25,
		hp: 50,
		maxHp: 50,
		attack: 55,
		defense: 40,
		specialAttack: 50,
		specialDefense: 50,
		speed: 90,
		status: 'none',
		types: ['electric'],
		moves: [],
	};

	const validState = {
		gameId: 'game-1',
		turn: 0,
		phase: 'choose_action',
		playerActive: validPokemon,
		playerParty: [validPokemon],
		opponent: {
			species: 'Rattata',
			hpPercent: 100,
			status: 'none',
			types: ['normal'],
			level: 10,
		},
		availableActions: ['move:0', 'run'],
		weather: 'clear',
		turnHistory: [],
		lastAction: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	it('accepts valid battle state', () => {
		expect(battleStateSchema.safeParse(validState).success).toBe(true);
	});

	it('accepts null lastAction', () => {
		expect(battleStateSchema.safeParse({ ...validState, lastAction: null }).success).toBe(true);
	});

	it('rejects party with more than 6 members', () => {
		const bigParty = Array(7).fill(validPokemon);
		expect(battleStateSchema.safeParse({ ...validState, playerParty: bigParty }).success).toBe(false);
	});

	it('rejects negative turn', () => {
		expect(battleStateSchema.safeParse({ ...validState, turn: -1 }).success).toBe(false);
	});
});
