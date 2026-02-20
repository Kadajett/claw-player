import { describe, expect, it } from 'vitest';

import {
	ALL_GAME_ACTIONS,
	BattlePhase,
	battleActionSchema,
	battlePhaseSchema,
	battleStateSchema,
	DEFAULT_TICK_INTERVAL_MS,
	directionSchema,
	GamePhase,
	gameActionSchema,
	gameActionToGbButton,
	gamePhaseSchema,
	gameStateSchema,
	inventoryItemSchema,
	itemInfoSchema,
	mapLocationSchema,
	moveDataSchema,
	npcInfoSchema,
	overworldActionSchema,
	overworldStateSchema,
	PokemonType,
	playerInfoSchema,
	pokemonStateSchema,
	pokemonTypeSchema,
	SNAPSHOT_INTERVAL,
	StatusCondition,
	statusConditionSchema,
	VALID_MOVE_INDICES,
	VALID_SWITCH_INDICES,
	VOTE_KEY_EXPIRY_SECONDS,
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
});

describe('gameActionSchema', () => {
	it('accepts all 8 button actions', () => {
		for (const action of ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']) {
			expect(gameActionSchema.safeParse(action).success).toBe(true);
		}
	});

	it('rejects old BattleAction values', () => {
		expect(gameActionSchema.safeParse('move:0').success).toBe(false);
		expect(gameActionSchema.safeParse('switch:3').success).toBe(false);
		expect(gameActionSchema.safeParse('run').success).toBe(false);
		expect(gameActionSchema.safeParse('a_button').success).toBe(false);
	});

	it('rejects empty string and arbitrary values', () => {
		expect(gameActionSchema.safeParse('').success).toBe(false);
		expect(gameActionSchema.safeParse('jump').success).toBe(false);
	});
});

describe('ALL_GAME_ACTIONS', () => {
	it('has length 8', () => {
		expect(ALL_GAME_ACTIONS).toHaveLength(8);
	});

	it('contains all expected buttons', () => {
		expect(ALL_GAME_ACTIONS).toContain('up');
		expect(ALL_GAME_ACTIONS).toContain('down');
		expect(ALL_GAME_ACTIONS).toContain('left');
		expect(ALL_GAME_ACTIONS).toContain('right');
		expect(ALL_GAME_ACTIONS).toContain('a');
		expect(ALL_GAME_ACTIONS).toContain('b');
		expect(ALL_GAME_ACTIONS).toContain('start');
		expect(ALL_GAME_ACTIONS).toContain('select');
	});
});

describe('gameActionToGbButton', () => {
	it('maps all 8 actions to correct GbButton values', () => {
		expect(gameActionToGbButton('up')).toBe('UP');
		expect(gameActionToGbButton('down')).toBe('DOWN');
		expect(gameActionToGbButton('left')).toBe('LEFT');
		expect(gameActionToGbButton('right')).toBe('RIGHT');
		expect(gameActionToGbButton('a')).toBe('A');
		expect(gameActionToGbButton('b')).toBe('B');
		expect(gameActionToGbButton('start')).toBe('START');
		expect(gameActionToGbButton('select')).toBe('SELECT');
	});
});

describe('constants (VALID_MOVE_INDICES)', () => {
	it('has valid VALID_MOVE_INDICES', () => {
		expect(VALID_MOVE_INDICES).toEqual([0, 1, 2, 3]);
	});

	it('has valid VALID_SWITCH_INDICES', () => {
		expect(VALID_SWITCH_INDICES).toEqual([0, 1, 2, 3, 4, 5]);
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
		action: 'a',
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

	it('rejects old BattleAction values', () => {
		expect(voteSchema.safeParse({ ...valid, action: 'move:0' }).success).toBe(false);
		expect(voteSchema.safeParse({ ...valid, action: 'run' }).success).toBe(false);
	});
});

describe('voteResultSchema', () => {
	const valid = {
		tickId: 3,
		gameId: 'game-1',
		winningAction: 'a',
		voteCounts: { a: 5, b: 2 },
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
			hp: 30,
			maxHp: 30,
			hpPercent: 100,
			status: 'none',
			types: ['normal'],
			level: 10,
		},
		availableActions: ['a', 'b'],
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

describe('GamePhase enum', () => {
	it('has 5 game phases', () => {
		expect(Object.values(GamePhase)).toHaveLength(5);
	});

	it('has expected values', () => {
		expect(GamePhase.Overworld).toBe('overworld');
		expect(GamePhase.Battle).toBe('battle');
		expect(GamePhase.Menu).toBe('menu');
		expect(GamePhase.Dialogue).toBe('dialogue');
		expect(GamePhase.Cutscene).toBe('cutscene');
	});
});

describe('gamePhaseSchema', () => {
	it('accepts all phases', () => {
		for (const val of Object.values(GamePhase)) {
			expect(gamePhaseSchema.safeParse(val).success).toBe(true);
		}
	});

	it('rejects invalid phase', () => {
		expect(gamePhaseSchema.safeParse('loading').success).toBe(false);
	});
});

describe('overworldActionSchema', () => {
	it('accepts all directional actions', () => {
		for (const action of ['up', 'down', 'left', 'right']) {
			expect(overworldActionSchema.safeParse(action).success).toBe(true);
		}
	});

	it('accepts button actions', () => {
		for (const action of ['a', 'b', 'start', 'select']) {
			expect(overworldActionSchema.safeParse(action).success).toBe(true);
		}
	});

	it('rejects old a_button/b_button values', () => {
		expect(overworldActionSchema.safeParse('a_button').success).toBe(false);
		expect(overworldActionSchema.safeParse('b_button').success).toBe(false);
	});

	it('rejects invalid action', () => {
		expect(overworldActionSchema.safeParse('jump').success).toBe(false);
		expect(overworldActionSchema.safeParse('').success).toBe(false);
	});
});

describe('directionSchema', () => {
	it('accepts all directions', () => {
		for (const dir of ['up', 'down', 'left', 'right']) {
			expect(directionSchema.safeParse(dir).success).toBe(true);
		}
	});

	it('rejects invalid direction', () => {
		expect(directionSchema.safeParse('northeast').success).toBe(false);
	});
});

describe('mapLocationSchema', () => {
	const valid = { mapId: 1, mapName: 'Pallet Town', x: 5, y: 10 };

	it('accepts valid location', () => {
		expect(mapLocationSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects negative coordinates', () => {
		expect(mapLocationSchema.safeParse({ ...valid, x: -1 }).success).toBe(false);
		expect(mapLocationSchema.safeParse({ ...valid, y: -1 }).success).toBe(false);
	});

	it('rejects negative mapId', () => {
		expect(mapLocationSchema.safeParse({ ...valid, mapId: -1 }).success).toBe(false);
	});
});

describe('npcInfoSchema', () => {
	const valid = { id: 1, name: 'Old Man', x: 3, y: 7, canTalk: true };

	it('accepts valid NPC', () => {
		expect(npcInfoSchema.safeParse(valid).success).toBe(true);
	});

	it('accepts non-talking NPC', () => {
		expect(npcInfoSchema.safeParse({ ...valid, canTalk: false }).success).toBe(true);
	});

	it('rejects negative position', () => {
		expect(npcInfoSchema.safeParse({ ...valid, x: -1 }).success).toBe(false);
	});
});

describe('itemInfoSchema', () => {
	const valid = { id: 4, name: 'Potion', x: 2, y: 8 };

	it('accepts valid item', () => {
		expect(itemInfoSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects negative position', () => {
		expect(itemInfoSchema.safeParse({ ...valid, y: -3 }).success).toBe(false);
	});
});

describe('inventoryItemSchema', () => {
	const valid = { itemId: 4, name: 'Potion', quantity: 5 };

	it('accepts valid inventory item', () => {
		expect(inventoryItemSchema.safeParse(valid).success).toBe(true);
	});

	it('accepts zero quantity', () => {
		expect(inventoryItemSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(true);
	});

	it('rejects negative quantity', () => {
		expect(inventoryItemSchema.safeParse({ ...valid, quantity: -1 }).success).toBe(false);
	});
});

describe('playerInfoSchema', () => {
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

	const valid = {
		name: 'Red',
		money: 3000,
		badges: 2,
		inventory: [{ itemId: 4, name: 'Potion', quantity: 3 }],
		party: [validPokemon],
	};

	it('accepts valid player info', () => {
		expect(playerInfoSchema.safeParse(valid).success).toBe(true);
	});

	it('accepts empty inventory and party', () => {
		expect(playerInfoSchema.safeParse({ ...valid, inventory: [], party: [] }).success).toBe(true);
	});

	it('rejects negative money', () => {
		expect(playerInfoSchema.safeParse({ ...valid, money: -1 }).success).toBe(false);
	});

	it('rejects badges over 8', () => {
		expect(playerInfoSchema.safeParse({ ...valid, badges: 9 }).success).toBe(false);
	});

	it('rejects party with more than 6 members', () => {
		const bigParty = Array(7).fill(validPokemon);
		expect(playerInfoSchema.safeParse({ ...valid, party: bigParty }).success).toBe(false);
	});
});

describe('overworldStateSchema', () => {
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

	const valid = {
		gamePhase: 'overworld',
		location: { mapId: 1, mapName: 'Pallet Town', x: 5, y: 10 },
		playerDirection: 'down',
		inBuilding: false,
		canMove: true,
		nearbyNpcs: [],
		nearbyItems: [],
		player: {
			name: 'Red',
			money: 3000,
			badges: 0,
			inventory: [],
			party: [validPokemon],
		},
		menuOpen: null,
		dialogueText: null,
		secondsRemaining: 15,
	};

	it('accepts valid overworld state', () => {
		expect(overworldStateSchema.safeParse(valid).success).toBe(true);
	});

	it('accepts null menuOpen and dialogueText', () => {
		expect(overworldStateSchema.safeParse({ ...valid, menuOpen: null, dialogueText: null }).success).toBe(true);
	});

	it('accepts string menuOpen', () => {
		expect(overworldStateSchema.safeParse({ ...valid, menuOpen: 'bag' }).success).toBe(true);
	});

	it('accepts string dialogueText', () => {
		expect(overworldStateSchema.safeParse({ ...valid, dialogueText: 'Hello there!' }).success).toBe(true);
	});

	it('rejects negative secondsRemaining', () => {
		expect(overworldStateSchema.safeParse({ ...valid, secondsRemaining: -1 }).success).toBe(false);
	});

	it('rejects invalid gamePhase', () => {
		expect(overworldStateSchema.safeParse({ ...valid, gamePhase: 'flying' }).success).toBe(false);
	});

	it('rejects invalid playerDirection', () => {
		expect(overworldStateSchema.safeParse({ ...valid, playerDirection: 'diagonal' }).success).toBe(false);
	});
});

describe('gameStateSchema', () => {
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

	const validBattle = {
		gameId: 'game-1',
		turn: 0,
		phase: 'choose_action',
		playerActive: validPokemon,
		playerParty: [validPokemon],
		opponent: {
			species: 'Rattata',
			hp: 30,
			maxHp: 30,
			hpPercent: 100,
			status: 'none',
			types: ['normal'],
			level: 10,
		},
		availableActions: ['a'],
		weather: 'clear',
		turnHistory: [],
		lastAction: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	const validOverworld = {
		gamePhase: 'overworld',
		location: { mapId: 1, mapName: 'Pallet Town', x: 5, y: 10 },
		playerDirection: 'down',
		inBuilding: false,
		canMove: true,
		nearbyNpcs: [],
		nearbyItems: [],
		player: {
			name: 'Red',
			money: 3000,
			badges: 0,
			inventory: [],
			party: [validPokemon],
		},
		menuOpen: null,
		dialogueText: null,
		secondsRemaining: 15,
	};

	it('accepts battle mode state', () => {
		const state = { mode: 'battle', battle: validBattle };
		expect(gameStateSchema.safeParse(state).success).toBe(true);
	});

	it('accepts overworld mode state', () => {
		const state = { mode: 'overworld', overworld: validOverworld };
		expect(gameStateSchema.safeParse(state).success).toBe(true);
	});

	it('rejects unknown mode', () => {
		expect(gameStateSchema.safeParse({ mode: 'loading' }).success).toBe(false);
	});

	it('rejects battle mode without battle data', () => {
		expect(gameStateSchema.safeParse({ mode: 'battle' }).success).toBe(false);
	});

	it('rejects overworld mode without overworld data', () => {
		expect(gameStateSchema.safeParse({ mode: 'overworld' }).success).toBe(false);
	});
});
