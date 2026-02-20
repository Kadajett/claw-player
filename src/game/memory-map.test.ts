import { describe, expect, it } from 'vitest';

import {
	ADDR_BATTLE_TYPE,
	ADDR_ENEMY_HP_HIGH,
	ADDR_ENEMY_MAX_HP_HIGH,
	ADDR_IN_BATTLE,
	ADDR_PLAYER_HP_HIGH,
	ADDR_PLAYER_LEVEL,
	ADDR_PLAYER_SPECIES,
	buildAvailableActions,
	decodeStatus,
	decodeType,
	decodeTypes,
	extractBattleState,
	extractOpponentPokemon,
	extractPlayerPokemon,
	isInBattle,
} from './memory-map.js';
import { PokemonType, StatusCondition } from './types.js';

function makeRam(overrides?: Record<number, number>): ReadonlyArray<number> {
	const ram = new Array(65536).fill(0) as Array<number>;
	if (overrides) {
		for (const [addr, val] of Object.entries(overrides)) {
			ram[Number(addr)] = val;
		}
	}
	return ram;
}

describe('decodeStatus', () => {
	it('returns None for 0', () => {
		expect(decodeStatus(0).condition).toBe(StatusCondition.None);
	});

	it('decodes burn (0x10)', () => {
		expect(decodeStatus(0x10).condition).toBe(StatusCondition.Burn);
	});

	it('decodes freeze (0x08)', () => {
		expect(decodeStatus(0x08).condition).toBe(StatusCondition.Freeze);
	});

	it('decodes paralysis (0x20)', () => {
		expect(decodeStatus(0x20).condition).toBe(StatusCondition.Paralysis);
	});

	it('decodes poison (0x40)', () => {
		expect(decodeStatus(0x40).condition).toBe(StatusCondition.Poison);
	});

	it('decodes sleep with turn count (lower 3 bits)', () => {
		const result = decodeStatus(0x03);
		expect(result.condition).toBe(StatusCondition.Sleep);
		expect(result.sleepTurns).toBe(3);
	});
});

describe('decodeType', () => {
	it('returns Normal for unknown code', () => {
		expect(decodeType(0xff)).toBe(PokemonType.Normal);
	});

	it('decodes fire type', () => {
		expect(decodeType(0x14)).toBe(PokemonType.Fire);
	});

	it('decodes psychic type', () => {
		expect(decodeType(0x18)).toBe(PokemonType.Psychic);
	});
});

describe('decodeTypes', () => {
	it('returns single type for monotype', () => {
		const types = decodeTypes(0x14, 0x14); // fire, fire
		expect(types).toHaveLength(1);
		expect(types[0]).toBe(PokemonType.Fire);
	});

	it('returns two types for dual type', () => {
		const types = decodeTypes(0x14, 0x02); // fire, flying
		expect(types).toHaveLength(2);
		expect(types).toContain(PokemonType.Fire);
		expect(types).toContain(PokemonType.Flying);
	});
});

describe('isInBattle', () => {
	it('returns false when both battle flags are 0', () => {
		const ram = makeRam();
		expect(isInBattle(ram)).toBe(false);
	});

	it('returns true when battle type is set', () => {
		const ram = makeRam({ [ADDR_BATTLE_TYPE]: 1 });
		expect(isInBattle(ram)).toBe(true);
	});

	it('returns true when in-battle flag is set', () => {
		const ram = makeRam({ [ADDR_IN_BATTLE]: 1 });
		expect(isInBattle(ram)).toBe(true);
	});
});

describe('extractPlayerPokemon', () => {
	it('returns default species for 0 species code', () => {
		const ram = makeRam();
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.species).toContain('Unknown');
	});

	it('extracts HP as 16-bit big-endian word', () => {
		// HP = 0x00FF = 255
		const ram = makeRam({ [ADDR_PLAYER_HP_HIGH]: 0x00, [ADDR_PLAYER_HP_HIGH + 1]: 0xff });
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.hp).toBe(255);
	});

	it('extracts level', () => {
		const ram = makeRam({ [ADDR_PLAYER_LEVEL]: 42 });
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.level).toBe(42);
	});

	it('extracts species name for known code', () => {
		const ram = makeRam({ [ADDR_PLAYER_SPECIES]: 0x23 }); // Pikachu
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.species).toBe('Pikachu');
	});

	it('returns at least one move (Struggle fallback)', () => {
		const ram = makeRam();
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.moves.length).toBeGreaterThan(0);
	});
});

describe('extractOpponentPokemon', () => {
	it('returns 0% HP when max HP is 0', () => {
		const ram = makeRam();
		const opponent = extractOpponentPokemon(ram);
		expect(opponent.hpPercent).toBe(0);
	});

	it('returns full HP percent when equal', () => {
		const ram = makeRam({
			[ADDR_ENEMY_HP_HIGH]: 0x00,
			[ADDR_ENEMY_HP_HIGH + 1]: 0x64, // HP = 100
			[ADDR_ENEMY_MAX_HP_HIGH]: 0x00,
			[ADDR_ENEMY_MAX_HP_HIGH + 1]: 0x64, // max HP = 100
		});
		const opponent = extractOpponentPokemon(ram);
		expect(opponent.hpPercent).toBe(100);
	});
});

describe('buildAvailableActions', () => {
	const pokemonWithMoves = {
		species: 'Pikachu',
		level: 25,
		hp: 50,
		maxHp: 50,
		attack: 55,
		defense: 40,
		specialAttack: 50,
		specialDefense: 50,
		speed: 90,
		status: StatusCondition.None,
		types: [PokemonType.Electric] as Array<PokemonType>,
		moves: [
			{
				name: 'Thunderbolt',
				pokemonType: PokemonType.Electric,
				power: 95,
				accuracy: 100,
				pp: 15,
				maxPp: 15,
				category: 'physical' as const,
			},
		],
	};

	it('includes move:0 when PP > 0', () => {
		const actions = buildAvailableActions(pokemonWithMoves);
		expect(actions).toContain('move:0');
	});

	it('always includes run', () => {
		const actions = buildAvailableActions(pokemonWithMoves);
		expect(actions).toContain('run');
	});

	it('excludes moves with 0 PP when other moves have PP', () => {
		const moveWithPp = pokemonWithMoves.moves[0];
		const pokemon = {
			...pokemonWithMoves,
			moves: [
				{ ...moveWithPp, pp: 0 },
				{ ...moveWithPp, name: 'Quick Attack', pp: 10 },
			],
		};
		const actions = buildAvailableActions(pokemon);
		expect(actions).not.toContain('move:0');
		expect(actions).toContain('move:1');
	});

	it('uses move:0 fallback when all PP is 0', () => {
		const pokemon = {
			...pokemonWithMoves,
			moves: [{ ...pokemonWithMoves.moves[0], pp: 0 }],
		};
		const actions = buildAvailableActions(pokemon);
		expect(actions).toContain('move:0'); // Struggle fallback
	});
});

describe('extractBattleState', () => {
	it('returns valid BattleState shape', () => {
		const ram = makeRam({ [ADDR_PLAYER_LEVEL]: 10 });
		const state = extractBattleState(ram, 'game-1', 5);
		expect(state.gameId).toBe('game-1');
		expect(state.turn).toBe(5);
		expect(state.playerActive).toBeDefined();
		expect(state.opponent).toBeDefined();
		expect(state.availableActions.length).toBeGreaterThan(0);
	});
});
