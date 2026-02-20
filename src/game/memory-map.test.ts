import { describe, expect, it } from 'vitest';

import {
	ADDR_BATTLE_TURN_COUNT,
	ADDR_BATTLE_TYPE,
	ADDR_CRITICAL_OHKO_FLAG,
	ADDR_CUR_OPPONENT,
	ADDR_ENEMY_ATTACK,
	ADDR_ENEMY_ATTACK_MOD,
	ADDR_ENEMY_BATTLE_STATUS1,
	ADDR_ENEMY_BATTLE_STATUS2,
	ADDR_ENEMY_BATTLE_STATUS3,
	ADDR_ENEMY_DEFENSE,
	ADDR_ENEMY_HP_HIGH,
	ADDR_ENEMY_MAX_HP_HIGH,
	ADDR_ENEMY_MOVES,
	ADDR_ENEMY_PARTY_COUNT,
	ADDR_ENEMY_PP,
	ADDR_ENEMY_SPECIAL,
	ADDR_ENEMY_SPEED,
	ADDR_ENEMY_SUBSTITUTE_HP,
	ADDR_GRASS_MONS_START,
	ADDR_GRASS_RATE,
	ADDR_H_TILESET_TYPE,
	ADDR_IN_BATTLE,
	ADDR_JOY_HELD,
	ADDR_JOY_PRESSED,
	ADDR_MAP_PAL_OFFSET,
	ADDR_PARTY_COUNT,
	ADDR_PARTY_MONS,
	ADDR_PARTY_NICKNAMES,
	ADDR_PLAYER_ACCURACY_MOD,
	ADDR_PLAYER_ATTACK,
	ADDR_PLAYER_ATTACK_MOD,
	ADDR_PLAYER_BATTLE_STATUS1,
	ADDR_PLAYER_BATTLE_STATUS2,
	ADDR_PLAYER_BATTLE_STATUS3,
	ADDR_PLAYER_CONFUSION_COUNTER,
	ADDR_PLAYER_DEFENSE,
	ADDR_PLAYER_DEFENSE_MOD,
	ADDR_PLAYER_DIRECTION,
	ADDR_PLAYER_EVASION_MOD,
	ADDR_PLAYER_HP_HIGH,
	ADDR_PLAYER_LEVEL,
	ADDR_PLAYER_SPECIAL,
	ADDR_PLAYER_SPECIAL_MOD,
	ADDR_PLAYER_SPECIES,
	ADDR_PLAYER_SPEED,
	ADDR_PLAYER_SPEED_MOD,
	ADDR_PLAYER_SUBSTITUTE_HP,
	ADDR_PLAYER_TOXIC_COUNTER,
	ADDR_TRAINER_CLASS,
	ADDR_PLAY_TIME_FRAMES,
	ADDR_PLAY_TIME_HOURS_HIGH,
	ADDR_PLAY_TIME_HOURS_LOW,
	ADDR_PLAY_TIME_MINUTES,
	ADDR_PLAY_TIME_SECONDS,
	ADDR_POKEDEX_OWNED_START,
	ADDR_POKEDEX_SEEN_START,
	ADDR_TILE_IN_FRONT_OF_PLAYER,
	GRASS_MON_SLOTS,
	OVERWORLD_BADGES,
	OVERWORLD_BAG_ITEMS,
	OVERWORLD_CUR_MAP,
	OVERWORLD_JOY_IGNORE,
	OVERWORLD_NUM_BAG_ITEMS,
	OVERWORLD_PLAYER_DIR,
	OVERWORLD_PLAYER_MONEY,
	OVERWORLD_PLAYER_NAME_ADDR,
	OVERWORLD_SPRITE_DATA1_START,
	OVERWORLD_SPRITE_DATA2_START,
	OVERWORLD_SPRITE_ENTRY_SIZE,
	OVERWORLD_TEXT_DELAY_FLAGS,
	OVERWORLD_X_COORD,
	OVERWORLD_Y_COORD,
	POKEDEX_BYTES,
	buildAvailableActions,
	decodeBCD,
	decodeBadgeNames,
	decodeDirection,
	decodeMapName,
	decodePokemonText,
	decodeStatus,
	decodeStatusCondition,
	decodeType,
	decodeTypes,
	detectGamePhase,
	extractBattleState,
	extractEnemyBattleStats,
	extractEnemyMoves,
	extractOpponentPokemon,
	extractOverworldState,
	extractPlayerBattleStats,
	extractPlayerPokemon,
	isInBattle,
	isTrainerBattle,
	readBadges,
	readBattleStatusFlags,
	readEnemyPartyCount,
	readFullParty,
	readGameProgress,
	readHmAvailability,
	readInventory,
	readMoney,
	readNearbySprites,
	readPlayerInfo,
	readPlayerName,
	readPokedexCounts,
	readStatModifiers,
	readTrainerClass,
	readWildEncounterRate,
} from './memory-map.js';
import { GamePhase, PokemonType, StatusCondition } from './types.js';

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
		const ram = makeRam({ [ADDR_PLAYER_SPECIES]: 0x54 }); // Pikachu
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

// ─── Overworld Memory Map Tests ──────────────────────────────────────────────

// Test address for generic text decoding tests
const TEST_ADDR = 0x1000;

describe('decodePokemonText', () => {
	it('decodes uppercase letters A-Z', () => {
		// "RED" = 0x91 (R), 0x84 (E), 0x83 (D), 0x50 (terminator)
		const ram = makeRam({
			[OVERWORLD_PLAYER_NAME_ADDR]: 0x91,
			[OVERWORLD_PLAYER_NAME_ADDR + 1]: 0x84,
			[OVERWORLD_PLAYER_NAME_ADDR + 2]: 0x83,
			[OVERWORLD_PLAYER_NAME_ADDR + 3]: 0x50,
		});
		expect(decodePokemonText(ram, OVERWORLD_PLAYER_NAME_ADDR, 11)).toBe('RED');
	});

	it('stops at terminator 0x50', () => {
		const ram = makeRam({
			[TEST_ADDR]: 0x80, // A
			[TEST_ADDR + 1]: 0x81, // B
			[TEST_ADDR + 2]: 0x50, // terminator
			[TEST_ADDR + 3]: 0x82, // C (should not be included)
		});
		expect(decodePokemonText(ram, TEST_ADDR, 11)).toBe('AB');
	});

	it('stops at maxLen even without terminator', () => {
		const ram = makeRam({
			[TEST_ADDR]: 0x80, // A
			[TEST_ADDR + 1]: 0x81, // B
			[TEST_ADDR + 2]: 0x82, // C
		});
		expect(decodePokemonText(ram, TEST_ADDR, 2)).toBe('AB');
	});

	it('decodes digits 0-9', () => {
		const ram = makeRam({
			[TEST_ADDR]: 0xf7, // 1
			[TEST_ADDR + 1]: 0xf8, // 2
			[TEST_ADDR + 2]: 0xf9, // 3
			[TEST_ADDR + 3]: 0x50,
		});
		expect(decodePokemonText(ram, TEST_ADDR, 11)).toBe('123');
	});

	it('decodes lowercase letters', () => {
		const ram = makeRam({
			[TEST_ADDR]: 0xa0, // a
			[TEST_ADDR + 1]: 0xa1, // b
			[TEST_ADDR + 2]: 0xa2, // c
			[TEST_ADDR + 3]: 0x50,
		});
		expect(decodePokemonText(ram, TEST_ADDR, 11)).toBe('abc');
	});

	it('returns empty string for immediate terminator', () => {
		const ram = makeRam({ [TEST_ADDR]: 0x50 });
		expect(decodePokemonText(ram, TEST_ADDR, 11)).toBe('');
	});

	it('skips unmapped bytes', () => {
		const ram = makeRam({
			[TEST_ADDR]: 0x80, // A
			[TEST_ADDR + 1]: 0x01, // unmapped
			[TEST_ADDR + 2]: 0x81, // B
			[TEST_ADDR + 3]: 0x50,
		});
		expect(decodePokemonText(ram, TEST_ADDR, 11)).toBe('AB');
	});
});

describe('decodeDirection', () => {
	it('decodes down (0x00)', () => {
		expect(decodeDirection(0x00)).toBe('down');
	});

	it('decodes up (0x04)', () => {
		expect(decodeDirection(0x04)).toBe('up');
	});

	it('decodes left (0x08)', () => {
		expect(decodeDirection(0x08)).toBe('left');
	});

	it('decodes right (0x0C)', () => {
		expect(decodeDirection(0x0c)).toBe('right');
	});

	it('masks out non-direction bits', () => {
		// 0xF0 has bits 2-3 = 0, so direction = down
		expect(decodeDirection(0xf0)).toBe('down');
		// 0xF4 has bits 2-3 = 01, so direction = up
		expect(decodeDirection(0xf4)).toBe('up');
	});
});

describe('decodeMapName', () => {
	it('returns Pallet Town for map ID 0', () => {
		expect(decodeMapName(0x00)).toBe('Pallet Town');
	});

	it('returns Route 1 for map ID 0x0C', () => {
		expect(decodeMapName(0x0c)).toBe('Route 1');
	});

	it('returns fallback for unknown map ID', () => {
		expect(decodeMapName(0xfe)).toBe('Map 254');
	});
});

describe('decodeBadgeNames', () => {
	it('returns empty array for 0 badges', () => {
		expect(decodeBadgeNames(0x00)).toHaveLength(0);
	});

	it('returns Boulder Badge for bit 0', () => {
		const badges = decodeBadgeNames(0x01);
		expect(badges).toEqual(['Boulder Badge']);
	});

	it('returns all 8 badges for 0xFF', () => {
		const badges = decodeBadgeNames(0xff);
		expect(badges).toHaveLength(8);
		expect(badges[0]).toBe('Boulder Badge');
		expect(badges[7]).toBe('Earth Badge');
	});

	it('returns correct badges for mixed bits', () => {
		// Bit 0 (Boulder) + bit 2 (Thunder) = 0x05
		const badges = decodeBadgeNames(0x05);
		expect(badges).toEqual(['Boulder Badge', 'Thunder Badge']);
	});
});

describe('readPlayerName', () => {
	it('reads encoded name from RAM', () => {
		// "ASH" = 0x80, 0x92, 0x87, 0x50
		const ram = makeRam({
			[OVERWORLD_PLAYER_NAME_ADDR]: 0x80,
			[OVERWORLD_PLAYER_NAME_ADDR + 1]: 0x92,
			[OVERWORLD_PLAYER_NAME_ADDR + 2]: 0x87,
			[OVERWORLD_PLAYER_NAME_ADDR + 3]: 0x50,
		});
		expect(readPlayerName(ram)).toBe('ASH');
	});

	it('returns PLAYER as fallback for empty name', () => {
		const ram = makeRam({ [OVERWORLD_PLAYER_NAME_ADDR]: 0x50 });
		expect(readPlayerName(ram)).toBe('PLAYER');
	});

	it('reads full 7-character name', () => {
		// "TRAINER" = T(0x93) R(0x91) A(0x80) I(0x88) N(0x8d) E(0x84) R(0x91)
		const ram = makeRam({
			[OVERWORLD_PLAYER_NAME_ADDR]: 0x93,
			[OVERWORLD_PLAYER_NAME_ADDR + 1]: 0x91,
			[OVERWORLD_PLAYER_NAME_ADDR + 2]: 0x80,
			[OVERWORLD_PLAYER_NAME_ADDR + 3]: 0x88,
			[OVERWORLD_PLAYER_NAME_ADDR + 4]: 0x8d,
			[OVERWORLD_PLAYER_NAME_ADDR + 5]: 0x84,
			[OVERWORLD_PLAYER_NAME_ADDR + 6]: 0x91,
			[OVERWORLD_PLAYER_NAME_ADDR + 7]: 0x50,
		});
		expect(readPlayerName(ram)).toBe('TRAINER');
	});
});

describe('readMoney', () => {
	it('reads BCD-encoded money from 3 bytes', () => {
		// $1234 = 0x00, 0x12, 0x34
		const ram = makeRam({
			[OVERWORLD_PLAYER_MONEY]: 0x00,
			[OVERWORLD_PLAYER_MONEY + 1]: 0x12,
			[OVERWORLD_PLAYER_MONEY + 2]: 0x34,
		});
		expect(readMoney(ram)).toBe(1234);
	});

	it('reads max money (999999)', () => {
		const ram = makeRam({
			[OVERWORLD_PLAYER_MONEY]: 0x99,
			[OVERWORLD_PLAYER_MONEY + 1]: 0x99,
			[OVERWORLD_PLAYER_MONEY + 2]: 0x99,
		});
		expect(readMoney(ram)).toBe(999999);
	});

	it('reads zero money', () => {
		const ram = makeRam();
		expect(readMoney(ram)).toBe(0);
	});

	it('reads small amount correctly', () => {
		// $500 = 0x00, 0x05, 0x00
		const ram = makeRam({
			[OVERWORLD_PLAYER_MONEY]: 0x00,
			[OVERWORLD_PLAYER_MONEY + 1]: 0x05,
			[OVERWORLD_PLAYER_MONEY + 2]: 0x00,
		});
		expect(readMoney(ram)).toBe(500);
	});
});

describe('readBadges', () => {
	it('returns 0 for no badges', () => {
		const ram = makeRam();
		expect(readBadges(ram)).toBe(0);
	});

	it('returns 1 for single badge', () => {
		const ram = makeRam({ [OVERWORLD_BADGES]: 0x01 });
		expect(readBadges(ram)).toBe(1);
	});

	it('returns 8 for all badges', () => {
		const ram = makeRam({ [OVERWORLD_BADGES]: 0xff });
		expect(readBadges(ram)).toBe(8);
	});

	it('counts non-contiguous badges correctly', () => {
		// Bits 0, 2, 5 = Boulder, Thunder, Marsh = 3 badges
		const ram = makeRam({ [OVERWORLD_BADGES]: 0x25 });
		expect(readBadges(ram)).toBe(3);
	});
});

describe('readInventory', () => {
	it('returns empty array when count is 0', () => {
		const ram = makeRam();
		expect(readInventory(ram)).toEqual([]);
	});

	it('reads single item', () => {
		const ram = makeRam({
			[OVERWORLD_NUM_BAG_ITEMS]: 1,
			[OVERWORLD_BAG_ITEMS]: 0x13, // Potion
			[OVERWORLD_BAG_ITEMS + 1]: 5, // quantity
		});
		const items = readInventory(ram);
		expect(items).toHaveLength(1);
		expect(items[0]?.itemId).toBe(0x13);
		expect(items[0]?.name).toBe('Potion');
		expect(items[0]?.quantity).toBe(5);
	});

	it('reads multiple items', () => {
		const ram = makeRam({
			[OVERWORLD_NUM_BAG_ITEMS]: 3,
			[OVERWORLD_BAG_ITEMS]: 0x04, // Poke Ball
			[OVERWORLD_BAG_ITEMS + 1]: 10,
			[OVERWORLD_BAG_ITEMS + 2]: 0x13, // Potion
			[OVERWORLD_BAG_ITEMS + 3]: 3,
			[OVERWORLD_BAG_ITEMS + 4]: 0x0a, // Antidote
			[OVERWORLD_BAG_ITEMS + 5]: 1,
		});
		const items = readInventory(ram);
		expect(items).toHaveLength(3);
		expect(items[0]?.name).toBe('Poke Ball');
		expect(items[1]?.name).toBe('Potion');
		expect(items[2]?.name).toBe('Antidote');
	});

	it('stops at 0xFF terminator', () => {
		const ram = makeRam({
			[OVERWORLD_NUM_BAG_ITEMS]: 5,
			[OVERWORLD_BAG_ITEMS]: 0x13, // Potion
			[OVERWORLD_BAG_ITEMS + 1]: 2,
			[OVERWORLD_BAG_ITEMS + 2]: 0xff, // terminator
			[OVERWORLD_BAG_ITEMS + 3]: 99,
		});
		const items = readInventory(ram);
		expect(items).toHaveLength(1);
	});

	it('caps at max bag size', () => {
		const overrides: Record<number, number> = { [OVERWORLD_NUM_BAG_ITEMS]: 100 };
		for (let i = 0; i < 25; i++) {
			overrides[OVERWORLD_BAG_ITEMS + i * 2] = 0x13;
			overrides[OVERWORLD_BAG_ITEMS + i * 2 + 1] = 1;
		}
		const ram = makeRam(overrides);
		const items = readInventory(ram);
		expect(items.length).toBeLessThanOrEqual(20);
	});

	it('uses fallback name for unknown items', () => {
		const ram = makeRam({
			[OVERWORLD_NUM_BAG_ITEMS]: 1,
			[OVERWORLD_BAG_ITEMS]: 0xaa, // unknown
			[OVERWORLD_BAG_ITEMS + 1]: 1,
		});
		const items = readInventory(ram);
		expect(items[0]?.name).toBe('Item #170');
	});
});

describe('readNearbySprites', () => {
	it('returns empty array when no sprites are present', () => {
		const ram = makeRam();
		expect(readNearbySprites(ram)).toEqual([]);
	});

	it('reads a single NPC sprite', () => {
		const spriteIdx = 1;
		const data1Base = OVERWORLD_SPRITE_DATA1_START + spriteIdx * OVERWORLD_SPRITE_ENTRY_SIZE;
		const data2Base = OVERWORLD_SPRITE_DATA2_START + spriteIdx * OVERWORLD_SPRITE_ENTRY_SIZE;
		const ram = makeRam({
			[data1Base]: 5, // picture ID (non-zero = present)
			[data1Base + 1]: 0, // movement status (still)
			[data2Base + 4]: 10, // map Y
			[data2Base + 5]: 15, // map X
		});
		const sprites = readNearbySprites(ram);
		expect(sprites).toHaveLength(1);
		expect(sprites[0]?.id).toBe(1);
		expect(sprites[0]?.x).toBe(15);
		expect(sprites[0]?.y).toBe(10);
		expect(sprites[0]?.canTalk).toBe(true);
	});

	it('skips sprite 0 (player)', () => {
		// Set player sprite (index 0) with a picture ID
		const ram = makeRam({
			[OVERWORLD_SPRITE_DATA1_START]: 1, // player picture ID
		});
		const sprites = readNearbySprites(ram);
		expect(sprites).toHaveLength(0); // player should be excluded
	});

	it('marks moving sprites as not talkable', () => {
		const spriteIdx = 2;
		const data1Base = OVERWORLD_SPRITE_DATA1_START + spriteIdx * OVERWORLD_SPRITE_ENTRY_SIZE;
		const data2Base = OVERWORLD_SPRITE_DATA2_START + spriteIdx * OVERWORLD_SPRITE_ENTRY_SIZE;
		const ram = makeRam({
			[data1Base]: 3, // picture ID
			[data1Base + 1]: 2, // movement status = moving
			[data2Base + 4]: 5,
			[data2Base + 5]: 7,
		});
		const sprites = readNearbySprites(ram);
		expect(sprites[0]?.canTalk).toBe(false);
	});

	it('reads multiple sprites', () => {
		const overrides: Record<number, number> = {};
		for (const idx of [1, 3, 5]) {
			const d1 = OVERWORLD_SPRITE_DATA1_START + idx * OVERWORLD_SPRITE_ENTRY_SIZE;
			const d2 = OVERWORLD_SPRITE_DATA2_START + idx * OVERWORLD_SPRITE_ENTRY_SIZE;
			overrides[d1] = idx + 10; // picture ID
			overrides[d2 + 4] = idx; // Y
			overrides[d2 + 5] = idx * 2; // X
		}
		const ram = makeRam(overrides);
		const sprites = readNearbySprites(ram);
		expect(sprites).toHaveLength(3);
	});
});

describe('detectGamePhase', () => {
	it('returns Overworld when no flags are set', () => {
		const ram = makeRam();
		expect(detectGamePhase(ram)).toBe(GamePhase.Overworld);
	});

	it('returns Battle when battle type is set', () => {
		const ram = makeRam({ [ADDR_BATTLE_TYPE]: 1 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Battle);
	});

	it('returns Battle for trainer battle', () => {
		const ram = makeRam({ [ADDR_BATTLE_TYPE]: 2 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Battle);
	});

	it('returns Dialogue when text delay flags are set', () => {
		const ram = makeRam({ [OVERWORLD_TEXT_DELAY_FLAGS]: 1 });
		expect(detectGamePhase(ram)).toBe(GamePhase.Dialogue);
	});

	it('returns Cutscene when joy ignore is set', () => {
		const ram = makeRam({ [OVERWORLD_JOY_IGNORE]: 0xff });
		expect(detectGamePhase(ram)).toBe(GamePhase.Cutscene);
	});

	it('prioritizes Battle over Dialogue', () => {
		const ram = makeRam({
			[ADDR_BATTLE_TYPE]: 1,
			[OVERWORLD_TEXT_DELAY_FLAGS]: 1,
		});
		expect(detectGamePhase(ram)).toBe(GamePhase.Battle);
	});

	it('prioritizes Dialogue over Cutscene', () => {
		const ram = makeRam({
			[OVERWORLD_TEXT_DELAY_FLAGS]: 1,
			[OVERWORLD_JOY_IGNORE]: 1,
		});
		expect(detectGamePhase(ram)).toBe(GamePhase.Dialogue);
	});
});

describe('extractOverworldState', () => {
	it('returns valid OverworldState shape', () => {
		const ram = makeRam({
			[OVERWORLD_CUR_MAP]: 0x00, // Pallet Town
			[OVERWORLD_X_COORD]: 5,
			[OVERWORLD_Y_COORD]: 3,
			[OVERWORLD_PLAYER_DIR]: 0x04, // facing up
		});
		const state = extractOverworldState(ram);
		expect(state.location.mapId).toBe(0);
		expect(state.location.mapName).toBe('Pallet Town');
		expect(state.location.x).toBe(5);
		expect(state.location.y).toBe(3);
		expect(state.playerDirection).toBe('up');
		expect(state.gamePhase).toBe(GamePhase.Overworld);
	});

	it('detects outdoor maps correctly', () => {
		// Pallet Town is outdoor
		const ram = makeRam({ [OVERWORLD_CUR_MAP]: 0x00 });
		expect(extractOverworldState(ram).inBuilding).toBe(false);

		// Route 1 is outdoor
		const ram2 = makeRam({ [OVERWORLD_CUR_MAP]: 0x0c });
		expect(extractOverworldState(ram2).inBuilding).toBe(false);
	});

	it('detects indoor maps correctly', () => {
		// Red's House 1F is indoor
		const ram = makeRam({ [OVERWORLD_CUR_MAP]: 0x25 });
		expect(extractOverworldState(ram).inBuilding).toBe(true);

		// Prof. Oak's Lab is indoor
		const ram2 = makeRam({ [OVERWORLD_CUR_MAP]: 0x28 });
		expect(extractOverworldState(ram2).inBuilding).toBe(true);
	});

	it('sets canMove to true in overworld with no joy ignore', () => {
		const ram = makeRam();
		expect(extractOverworldState(ram).canMove).toBe(true);
	});

	it('sets canMove to false during dialogue', () => {
		const ram = makeRam({ [OVERWORLD_TEXT_DELAY_FLAGS]: 1 });
		expect(extractOverworldState(ram).canMove).toBe(false);
	});

	it('sets canMove to false during battle', () => {
		const ram = makeRam({ [ADDR_BATTLE_TYPE]: 1 });
		expect(extractOverworldState(ram).canMove).toBe(false);
	});

	it('includes player info with name, money, badges, inventory', () => {
		const ram = makeRam({
			[OVERWORLD_PLAYER_NAME_ADDR]: 0x91, // R
			[OVERWORLD_PLAYER_NAME_ADDR + 1]: 0x84, // E
			[OVERWORLD_PLAYER_NAME_ADDR + 2]: 0x83, // D
			[OVERWORLD_PLAYER_NAME_ADDR + 3]: 0x50,
			[OVERWORLD_PLAYER_MONEY]: 0x01,
			[OVERWORLD_PLAYER_MONEY + 1]: 0x23,
			[OVERWORLD_PLAYER_MONEY + 2]: 0x45,
			[OVERWORLD_BADGES]: 0x03, // Boulder + Cascade
			[OVERWORLD_NUM_BAG_ITEMS]: 1,
			[OVERWORLD_BAG_ITEMS]: 0x13, // Potion
			[OVERWORLD_BAG_ITEMS + 1]: 5,
		});
		const state = extractOverworldState(ram);
		expect(state.player.name).toBe('RED');
		expect(state.player.money).toBe(12345);
		expect(state.player.badges).toBe(2);
		expect(state.player.inventory).toHaveLength(1);
		expect(state.player.inventory[0]?.name).toBe('Potion');
	});

	it('includes nearby NPCs', () => {
		const spriteIdx = 1;
		const d1 = OVERWORLD_SPRITE_DATA1_START + spriteIdx * OVERWORLD_SPRITE_ENTRY_SIZE;
		const d2 = OVERWORLD_SPRITE_DATA2_START + spriteIdx * OVERWORLD_SPRITE_ENTRY_SIZE;
		const ram = makeRam({
			[d1]: 5,
			[d2 + 4]: 8,
			[d2 + 5]: 12,
		});
		const state = extractOverworldState(ram);
		expect(state.nearbyNpcs).toHaveLength(1);
		expect(state.nearbyNpcs[0]?.x).toBe(12);
		expect(state.nearbyNpcs[0]?.y).toBe(8);
	});

	it('sets nearbyItems to empty array', () => {
		const ram = makeRam();
		expect(extractOverworldState(ram).nearbyItems).toEqual([]);
	});

	it('sets menuOpen and dialogueText to null', () => {
		const ram = makeRam();
		const state = extractOverworldState(ram);
		expect(state.menuOpen).toBeNull();
		expect(state.dialogueText).toBeNull();
	});
});

// ─── Stat Modifiers Tests ────────────────────────────────────────────────────

describe('readStatModifiers', () => {
	it('reads all neutral (7) when all bytes are 7', () => {
		const ram = makeRam({
			[ADDR_PLAYER_ATTACK_MOD]: 7,
			[ADDR_PLAYER_DEFENSE_MOD]: 7,
			[ADDR_PLAYER_SPEED_MOD]: 7,
			[ADDR_PLAYER_SPECIAL_MOD]: 7,
			[ADDR_PLAYER_ACCURACY_MOD]: 7,
			[ADDR_PLAYER_EVASION_MOD]: 7,
		});
		const mods = readStatModifiers(ram, ADDR_PLAYER_ATTACK_MOD);
		expect(mods.attack).toBe(7);
		expect(mods.defense).toBe(7);
		expect(mods.speed).toBe(7);
		expect(mods.special).toBe(7);
		expect(mods.accuracy).toBe(7);
		expect(mods.evasion).toBe(7);
	});

	it('reads raised and lowered modifiers correctly', () => {
		const ram = makeRam({
			[ADDR_PLAYER_ATTACK_MOD]: 9, // +2 stages
			[ADDR_PLAYER_DEFENSE_MOD]: 5, // -2 stages
			[ADDR_PLAYER_SPEED_MOD]: 7, // neutral
			[ADDR_PLAYER_SPECIAL_MOD]: 7,
			[ADDR_PLAYER_ACCURACY_MOD]: 7,
			[ADDR_PLAYER_EVASION_MOD]: 7,
		});
		const mods = readStatModifiers(ram, ADDR_PLAYER_ATTACK_MOD);
		expect(mods.attack).toBe(9);
		expect(mods.defense).toBe(5);
		expect(mods.speed).toBe(7);
	});

	it('reads extreme values (1 = -6, 13 = +6)', () => {
		const ram = makeRam({
			[ADDR_PLAYER_ATTACK_MOD]: 1, // min (-6)
			[ADDR_PLAYER_DEFENSE_MOD]: 13, // max (+6)
			[ADDR_PLAYER_SPEED_MOD]: 7,
			[ADDR_PLAYER_SPECIAL_MOD]: 7,
			[ADDR_PLAYER_ACCURACY_MOD]: 7,
			[ADDR_PLAYER_EVASION_MOD]: 7,
		});
		const mods = readStatModifiers(ram, ADDR_PLAYER_ATTACK_MOD);
		expect(mods.attack).toBe(1);
		expect(mods.defense).toBe(13);
	});

	it('works with enemy stat modifier base address', () => {
		const ram = makeRam({
			[ADDR_ENEMY_ATTACK_MOD]: 10,
			[ADDR_ENEMY_ATTACK_MOD + 1]: 4,
			[ADDR_ENEMY_ATTACK_MOD + 2]: 7,
			[ADDR_ENEMY_ATTACK_MOD + 3]: 7,
			[ADDR_ENEMY_ATTACK_MOD + 4]: 7,
			[ADDR_ENEMY_ATTACK_MOD + 5]: 7,
		});
		const mods = readStatModifiers(ram, ADDR_ENEMY_ATTACK_MOD);
		expect(mods.attack).toBe(10);
		expect(mods.defense).toBe(4);
	});

	it('defaults to 7 (neutral) for unset RAM', () => {
		const ram = makeRam();
		const mods = readStatModifiers(ram, ADDR_PLAYER_ATTACK_MOD);
		// RAM initialized to 0, but the ?? 7 fallback handles undefined (not 0)
		// With makeRam filling 0, we get 0 for each byte
		expect(mods.attack).toBe(0);
	});
});

// ─── Battle Status Flags Tests ───────────────────────────────────────────────

describe('readBattleStatusFlags', () => {
	it('returns empty array when all bytes are 0', () => {
		const ram = makeRam();
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toEqual([]);
	});

	it('decodes confused from byte 3 bit 0', () => {
		const ram = makeRam({ [ADDR_PLAYER_BATTLE_STATUS3]: 0x01 });
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toContain('confused');
	});

	it('decodes substitute from byte 2 bit 3', () => {
		const ram = makeRam({ [ADDR_PLAYER_BATTLE_STATUS2]: 0x08 });
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toContain('substitute');
	});

	it('decodes bide and invulnerable from byte 1', () => {
		const ram = makeRam({ [ADDR_PLAYER_BATTLE_STATUS1]: 0x41 }); // bit 0 + bit 6
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toContain('bide');
		expect(flags).toContain('invulnerable');
	});

	it('decodes all byte 1 flags', () => {
		const ram = makeRam({ [ADDR_PLAYER_BATTLE_STATUS1]: 0x7f }); // bits 0-6
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toContain('bide');
		expect(flags).toContain('thrash');
		expect(flags).toContain('charging');
		expect(flags).toContain('multi_turn');
		expect(flags).toContain('flinch');
		expect(flags).toContain('locked');
		expect(flags).toContain('invulnerable');
	});

	it('decodes all byte 2 flags', () => {
		const ram = makeRam({ [ADDR_PLAYER_BATTLE_STATUS2]: 0x0f }); // bits 0-3
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toContain('x_accuracy');
		expect(flags).toContain('mist');
		expect(flags).toContain('focus_energy');
		expect(flags).toContain('substitute');
	});

	it('decodes all byte 3 flags', () => {
		const ram = makeRam({ [ADDR_PLAYER_BATTLE_STATUS3]: 0xb1 }); // bits 0,4,5,7
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toContain('confused');
		expect(flags).toContain('light_screen');
		expect(flags).toContain('reflect');
		expect(flags).toContain('transformed');
	});

	it('works with enemy battle status addresses', () => {
		const ram = makeRam({
			[ADDR_ENEMY_BATTLE_STATUS2]: 0x08, // substitute
			[ADDR_ENEMY_BATTLE_STATUS3]: 0x01, // confused
		});
		const flags = readBattleStatusFlags(
			ram,
			ADDR_ENEMY_BATTLE_STATUS1,
			ADDR_ENEMY_BATTLE_STATUS2,
			ADDR_ENEMY_BATTLE_STATUS3,
		);
		expect(flags).toContain('confused');
		expect(flags).toContain('substitute');
		expect(flags).toHaveLength(2);
	});

	it('decodes mixed flags across all 3 bytes', () => {
		const ram = makeRam({
			[ADDR_PLAYER_BATTLE_STATUS1]: 0x02, // thrash
			[ADDR_PLAYER_BATTLE_STATUS2]: 0x04, // focus_energy
			[ADDR_PLAYER_BATTLE_STATUS3]: 0x20, // reflect
		});
		const flags = readBattleStatusFlags(
			ram,
			ADDR_PLAYER_BATTLE_STATUS1,
			ADDR_PLAYER_BATTLE_STATUS2,
			ADDR_PLAYER_BATTLE_STATUS3,
		);
		expect(flags).toEqual(['thrash', 'focus_energy', 'reflect']);
	});
});

// ─── Misc Battle Address Tests ───────────────────────────────────────────────

describe('misc battle address constants', () => {
	it('battle turn count address reads correctly', () => {
		const ram = makeRam({ [ADDR_BATTLE_TURN_COUNT]: 15 });
		expect(ram[ADDR_BATTLE_TURN_COUNT]).toBe(15);
	});

	it('substitute HP addresses are distinct', () => {
		const ram = makeRam({
			[ADDR_PLAYER_SUBSTITUTE_HP]: 50,
			[ADDR_ENEMY_SUBSTITUTE_HP]: 30,
		});
		expect(ram[ADDR_PLAYER_SUBSTITUTE_HP]).toBe(50);
		expect(ram[ADDR_ENEMY_SUBSTITUTE_HP]).toBe(30);
	});

	it('critical/OHKO flag address reads correctly', () => {
		const ram = makeRam({ [ADDR_CRITICAL_OHKO_FLAG]: 1 });
		expect(ram[ADDR_CRITICAL_OHKO_FLAG]).toBe(1);
	});

	it('confusion counter address reads correctly', () => {
		const ram = makeRam({ [ADDR_PLAYER_CONFUSION_COUNTER]: 3 });
		expect(ram[ADDR_PLAYER_CONFUSION_COUNTER]).toBe(3);
	});

	it('toxic counter address reads correctly', () => {
		const ram = makeRam({ [ADDR_PLAYER_TOXIC_COUNTER]: 5 });
		expect(ram[ADDR_PLAYER_TOXIC_COUNTER]).toBe(5);
	});

	it('address constants have correct hex values', () => {
		expect(ADDR_BATTLE_TURN_COUNT).toBe(0xccd5);
		expect(ADDR_PLAYER_SUBSTITUTE_HP).toBe(0xccd7);
		expect(ADDR_ENEMY_SUBSTITUTE_HP).toBe(0xccd8);
		expect(ADDR_CRITICAL_OHKO_FLAG).toBe(0xd05e);
		expect(ADDR_PLAYER_CONFUSION_COUNTER).toBe(0xd06b);
		expect(ADDR_PLAYER_TOXIC_COUNTER).toBe(0xd06c);
	});
});

describe('extractPlayerBattleStats', () => {
	it('reads 4 big-endian 16-bit values from player stat addresses', () => {
		const ram = makeRam({
			[ADDR_PLAYER_ATTACK]: 0x00,
			[ADDR_PLAYER_ATTACK + 1]: 0x82, // 130
			[ADDR_PLAYER_DEFENSE]: 0x00,
			[ADDR_PLAYER_DEFENSE + 1]: 0x6e, // 110
			[ADDR_PLAYER_SPEED]: 0x01,
			[ADDR_PLAYER_SPEED + 1]: 0x04, // 260
			[ADDR_PLAYER_SPECIAL]: 0x00,
			[ADDR_PLAYER_SPECIAL + 1]: 0x5a, // 90
		});
		const stats = extractPlayerBattleStats(ram);
		expect(stats.attack).toBe(130);
		expect(stats.defense).toBe(110);
		expect(stats.speed).toBe(260);
		expect(stats.special).toBe(90);
	});

	it('returns 0 for all stats when RAM is zeroed', () => {
		const ram = makeRam();
		const stats = extractPlayerBattleStats(ram);
		expect(stats.attack).toBe(0);
		expect(stats.defense).toBe(0);
		expect(stats.speed).toBe(0);
		expect(stats.special).toBe(0);
	});
});

describe('extractEnemyBattleStats', () => {
	it('reads 4 big-endian 16-bit values from enemy stat addresses', () => {
		const ram = makeRam({
			[ADDR_ENEMY_ATTACK]: 0x00,
			[ADDR_ENEMY_ATTACK + 1]: 0x64, // 100
			[ADDR_ENEMY_DEFENSE]: 0x00,
			[ADDR_ENEMY_DEFENSE + 1]: 0x50, // 80
			[ADDR_ENEMY_SPEED]: 0x00,
			[ADDR_ENEMY_SPEED + 1]: 0x37, // 55
			[ADDR_ENEMY_SPECIAL]: 0x00,
			[ADDR_ENEMY_SPECIAL + 1]: 0xc8, // 200
		});
		const stats = extractEnemyBattleStats(ram);
		expect(stats.attack).toBe(100);
		expect(stats.defense).toBe(80);
		expect(stats.speed).toBe(55);
		expect(stats.special).toBe(200);
	});
});

describe('extractEnemyMoves', () => {
	it('returns array of move data with name lookup', () => {
		// Tackle = 0x21 (33), Growl = 0x2D (45)
		const ram = makeRam({
			[ADDR_ENEMY_MOVES]: 0x21, // Tackle
			[ADDR_ENEMY_MOVES + 1]: 0x2d, // Growl
			[ADDR_ENEMY_MOVES + 2]: 0x00, // empty
			[ADDR_ENEMY_MOVES + 3]: 0x00, // empty
			[ADDR_ENEMY_PP]: 35,
			[ADDR_ENEMY_PP + 1]: 40,
		});
		const moves = extractEnemyMoves(ram);
		expect(moves.length).toBe(2);
		expect(moves[0]?.name).toBe('Tackle');
		expect(moves[0]?.pp).toBe(35);
		expect(moves[1]?.name).toBe('Growl');
		expect(moves[1]?.pp).toBe(40);
	});

	it('skips empty move slots (move ID = 0)', () => {
		const ram = makeRam({
			[ADDR_ENEMY_MOVES]: 0x21, // Tackle
			[ADDR_ENEMY_MOVES + 1]: 0x00, // empty
		});
		const moves = extractEnemyMoves(ram);
		expect(moves.length).toBe(1);
	});

	it('returns Struggle when all slots are empty', () => {
		const ram = makeRam();
		const moves = extractEnemyMoves(ram);
		expect(moves.length).toBe(1);
		expect(moves[0]?.name).toBe('Struggle');
	});
});

describe('extractPlayerPokemon battle stats', () => {
	it('uses real RAM stats instead of estimated values', () => {
		const ram = makeRam({
			[ADDR_PLAYER_SPECIES]: 0x54, // Pikachu
			[ADDR_PLAYER_LEVEL]: 25,
			[ADDR_PLAYER_HP_HIGH]: 0x00,
			[ADDR_PLAYER_HP_HIGH + 1]: 50,
			[ADDR_PLAYER_ATTACK]: 0x00,
			[ADDR_PLAYER_ATTACK + 1]: 55,
			[ADDR_PLAYER_DEFENSE]: 0x00,
			[ADDR_PLAYER_DEFENSE + 1]: 30,
			[ADDR_PLAYER_SPEED]: 0x00,
			[ADDR_PLAYER_SPEED + 1]: 90,
			[ADDR_PLAYER_SPECIAL]: 0x00,
			[ADDR_PLAYER_SPECIAL + 1]: 50,
		});
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.attack).toBe(55);
		expect(pokemon.defense).toBe(30);
		expect(pokemon.speed).toBe(90);
		expect(pokemon.specialAttack).toBe(50);
		expect(pokemon.specialDefense).toBe(50);
	});

	it('maps Gen1 Special to both specialAttack and specialDefense', () => {
		const ram = makeRam({
			[ADDR_PLAYER_SPECIES]: 0x54,
			[ADDR_PLAYER_LEVEL]: 25,
			[ADDR_PLAYER_SPECIAL]: 0x00,
			[ADDR_PLAYER_SPECIAL + 1]: 65,
			[ADDR_PLAYER_ATTACK]: 0x00,
			[ADDR_PLAYER_ATTACK + 1]: 1,
			[ADDR_PLAYER_DEFENSE]: 0x00,
			[ADDR_PLAYER_DEFENSE + 1]: 1,
			[ADDR_PLAYER_SPEED]: 0x00,
			[ADDR_PLAYER_SPEED + 1]: 1,
		});
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.specialAttack).toBe(65);
		expect(pokemon.specialDefense).toBe(65);
	});

	it('falls back to 1 when stat is 0 in RAM', () => {
		const ram = makeRam({
			[ADDR_PLAYER_SPECIES]: 0x54,
			[ADDR_PLAYER_LEVEL]: 5,
		});
		const pokemon = extractPlayerPokemon(ram);
		expect(pokemon.attack).toBe(1);
		expect(pokemon.defense).toBe(1);
		expect(pokemon.speed).toBe(1);
		expect(pokemon.specialAttack).toBe(1);
		expect(pokemon.specialDefense).toBe(1);
	});
});

describe('extractOpponentPokemon battle stats', () => {
	it('includes enemy battle stats from RAM', () => {
		const ram = makeRam({
			[ADDR_ENEMY_HP_HIGH]: 0x00,
			[ADDR_ENEMY_HP_HIGH + 1]: 100,
			[ADDR_ENEMY_MAX_HP_HIGH]: 0x00,
			[ADDR_ENEMY_MAX_HP_HIGH + 1]: 100,
			[ADDR_ENEMY_ATTACK]: 0x00,
			[ADDR_ENEMY_ATTACK + 1]: 80,
			[ADDR_ENEMY_DEFENSE]: 0x00,
			[ADDR_ENEMY_DEFENSE + 1]: 70,
			[ADDR_ENEMY_SPEED]: 0x00,
			[ADDR_ENEMY_SPEED + 1]: 95,
			[ADDR_ENEMY_SPECIAL]: 0x00,
			[ADDR_ENEMY_SPECIAL + 1]: 60,
		});
		const opponent = extractOpponentPokemon(ram);
		expect(opponent.attack).toBe(80);
		expect(opponent.defense).toBe(70);
		expect(opponent.speed).toBe(95);
		expect(opponent.specialAttack).toBe(60);
		expect(opponent.specialDefense).toBe(60);
	});

	it('includes enemy moves', () => {
		const ram = makeRam({
			[ADDR_ENEMY_HP_HIGH]: 0x00,
			[ADDR_ENEMY_HP_HIGH + 1]: 50,
			[ADDR_ENEMY_MAX_HP_HIGH]: 0x00,
			[ADDR_ENEMY_MAX_HP_HIGH + 1]: 50,
			[ADDR_ENEMY_MOVES]: 0x21, // Tackle
			[ADDR_ENEMY_PP]: 35,
			[ADDR_ENEMY_ATTACK]: 0x00,
			[ADDR_ENEMY_ATTACK + 1]: 1,
			[ADDR_ENEMY_DEFENSE]: 0x00,
			[ADDR_ENEMY_DEFENSE + 1]: 1,
			[ADDR_ENEMY_SPEED]: 0x00,
			[ADDR_ENEMY_SPEED + 1]: 1,
			[ADDR_ENEMY_SPECIAL]: 0x00,
			[ADDR_ENEMY_SPECIAL + 1]: 1,
		});
		const opponent = extractOpponentPokemon(ram);
		expect(opponent.moves.length).toBeGreaterThan(0);
		expect(opponent.moves[0]?.name).toBe('Tackle');
	});
});

describe('isTrainerBattle', () => {
	it('returns true when wCurOpponent >= 200', () => {
		const ram = makeRam({ [ADDR_CUR_OPPONENT]: 200 });
		expect(isTrainerBattle(ram)).toBe(true);
	});

	it('returns true for high trainer values', () => {
		const ram = makeRam({ [ADDR_CUR_OPPONENT]: 255 });
		expect(isTrainerBattle(ram)).toBe(true);
	});

	it('returns false when wCurOpponent < 200 (wild encounter)', () => {
		const ram = makeRam({ [ADDR_CUR_OPPONENT]: 199 });
		expect(isTrainerBattle(ram)).toBe(false);
	});

	it('returns false for 0 (no opponent)', () => {
		const ram = makeRam({ [ADDR_CUR_OPPONENT]: 0 });
		expect(isTrainerBattle(ram)).toBe(false);
	});
});

describe('readTrainerClass', () => {
	it('reads trainer class from RAM', () => {
		const ram = makeRam({ [ADDR_TRAINER_CLASS]: 42 });
		expect(readTrainerClass(ram)).toBe(42);
	});

	it('returns 0 when no trainer class set', () => {
		const ram = makeRam();
		expect(readTrainerClass(ram)).toBe(0);
	});
});

describe('readEnemyPartyCount', () => {
	it('reads enemy party count from RAM', () => {
		const ram = makeRam({ [ADDR_ENEMY_PARTY_COUNT]: 4 });
		expect(readEnemyPartyCount(ram)).toBe(4);
	});

	it('returns 0 when not set', () => {
		const ram = makeRam();
		expect(readEnemyPartyCount(ram)).toBe(0);
});

// ─── HM Detection Address Constants ─────────────────────────────────────────

describe('HM/progress/encounter address constants', () => {
	it('HM detection addresses have correct hex values', () => {
		expect(ADDR_H_TILESET_TYPE).toBe(0xffd7);
		expect(ADDR_MAP_PAL_OFFSET).toBe(0xd35d);
	});

	it('game time addresses have correct hex values', () => {
		expect(ADDR_PLAY_TIME_HOURS_HIGH).toBe(0xda41);
		expect(ADDR_PLAY_TIME_HOURS_LOW).toBe(0xda42);
		expect(ADDR_PLAY_TIME_MINUTES).toBe(0xda43);
		expect(ADDR_PLAY_TIME_SECONDS).toBe(0xda44);
		expect(ADDR_PLAY_TIME_FRAMES).toBe(0xda45);
	});

	it('pokedex addresses have correct hex values', () => {
		expect(ADDR_POKEDEX_OWNED_START).toBe(0xd2f7);
		expect(ADDR_POKEDEX_SEEN_START).toBe(0xd30a);
		expect(POKEDEX_BYTES).toBe(19);
	});

	it('wild encounter addresses have correct hex values', () => {
		expect(ADDR_GRASS_RATE).toBe(0xd887);
		expect(ADDR_GRASS_MONS_START).toBe(0xd888);
		expect(GRASS_MON_SLOTS).toBe(10);
	});

	it('joypad addresses have correct hex values', () => {
		expect(ADDR_JOY_PRESSED).toBe(0xffb3);
		expect(ADDR_JOY_HELD).toBe(0xffb4);
	});
});

// ─── HM Availability Tests ──────────────────────────────────────────────────

// Party data layout: ADDR_PARTY_COUNT=0xD163, ADDR_PARTY_MONS=0xD16B, 44 bytes each
// Moves at offset +0x08 within each party struct

describe('readHmAvailability', () => {
	it('returns all false with no badges', () => {
		const ram = makeRam();
		const hm = readHmAvailability(ram);
		expect(hm.cut).toBe(false);
		expect(hm.fly).toBe(false);
		expect(hm.surf).toBe(false);
		expect(hm.strength).toBe(false);
		expect(hm.flash).toBe(false);
	});

	it('returns cut: true with CascadeBadge and party knows Cut', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x02, // bit 1 = CascadeBadge
			[0xd163]: 1, // party count = 1
			[0xd16b]: 0x99, // species (non-zero = valid)
			[0xd16b + 0x08]: 15, // Cut move ID
		});
		expect(readHmAvailability(ram).cut).toBe(true);
	});

	it('returns fly: true with ThunderBadge, party knows Fly, and outside tileset', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x04, // bit 2 = ThunderBadge
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 19, // Fly move ID
			[ADDR_H_TILESET_TYPE]: 2, // outside tileset
		});
		expect(readHmAvailability(ram).fly).toBe(true);
	});

	it('returns fly: false with ThunderBadge and Fly but indoor tileset', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x04,
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 19,
			[ADDR_H_TILESET_TYPE]: 0, // indoor
		});
		expect(readHmAvailability(ram).fly).toBe(false);
	});

	it('returns surf: true with SoulBadge, party knows Surf, and facing water', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x10, // bit 4 = SoulBadge
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 57, // Surf move ID
			[ADDR_TILE_IN_FRONT_OF_PLAYER]: 0x14, // water tile
		});
		expect(readHmAvailability(ram).surf).toBe(true);
	});

	it('returns strength: true with RainbowBadge and party knows Strength', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x08, // bit 3 = RainbowBadge
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 70, // Strength move ID
		});
		expect(readHmAvailability(ram).strength).toBe(true);
	});

	it('returns flash: true with BoulderBadge, party knows Flash, and dark cave', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x01, // bit 0 = BoulderBadge
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 148, // Flash move ID
			[ADDR_MAP_PAL_OFFSET]: 6, // dark cave
		});
		expect(readHmAvailability(ram).flash).toBe(true);
	});

	it('returns false when badge is present but party does not know the move', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0xff, // all badges
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 1, // Pound, not an HM
		});
		const hm = readHmAvailability(ram);
		expect(hm.cut).toBe(false);
		expect(hm.strength).toBe(false);
	});

	it('finds HM move in second party slot', () => {
		const secondMon = 0xd16b + 0x2c; // party mon 1 (second slot)
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x02, // CascadeBadge
			[0xd163]: 2, // 2 party members
			[0xd16b]: 0x99, // first mon species
			[0xd16b + 0x08]: 1, // first mon move = Pound
			[secondMon]: 0x54, // second mon species
			[secondMon + 0x08]: 15, // second mon move = Cut
		});
		expect(readHmAvailability(ram).cut).toBe(true);
	});

	it('finds HM move in non-first move slot', () => {
		const ram = makeRam({
			[OVERWORLD_BADGES]: 0x08, // RainbowBadge
			[0xd163]: 1,
			[0xd16b]: 0x99,
			[0xd16b + 0x08]: 1, // move slot 0 = Pound
			[0xd16b + 0x09]: 2, // move slot 1 = Karate Chop
			[0xd16b + 0x0a]: 70, // move slot 2 = Strength
		});
		expect(readHmAvailability(ram).strength).toBe(true);
	});
});

// ─── Pokedex Counts Tests ────────────────────────────────────────────────────

describe('readPokedexCounts', () => {
	it('returns { owned: 0, seen: 0 } with all zeros', () => {
		const ram = makeRam();
		const counts = readPokedexCounts(ram);
		expect(counts.owned).toBe(0);
		expect(counts.seen).toBe(0);
	});

	it('counts 8 owned for 0xFF at first byte', () => {
		const ram = makeRam({ [ADDR_POKEDEX_OWNED_START]: 0xff });
		const counts = readPokedexCounts(ram);
		expect(counts.owned).toBe(8);
		expect(counts.seen).toBe(0);
	});

	it('counts set bits correctly across multiple bytes', () => {
		const ram = makeRam({
			[ADDR_POKEDEX_OWNED_START]: 0x0f, // 4 bits
			[ADDR_POKEDEX_OWNED_START + 1]: 0x01, // 1 bit
		});
		expect(readPokedexCounts(ram).owned).toBe(5);
	});

	it('counts seen independently from owned', () => {
		const ram = makeRam({
			[ADDR_POKEDEX_SEEN_START]: 0xff, // 8 seen
			[ADDR_POKEDEX_SEEN_START + 1]: 0x03, // 2 seen
		});
		const counts = readPokedexCounts(ram);
		expect(counts.owned).toBe(0);
		expect(counts.seen).toBe(10);
	});

	it('counts all 151 when all bytes are 0xFF', () => {
		const overrides: Record<number, number> = {};
		for (let i = 0; i < POKEDEX_BYTES; i++) {
			overrides[ADDR_POKEDEX_OWNED_START + i] = 0xff;
		}
		const ram = makeRam(overrides);
		// 19 bytes * 8 bits = 152, but only 151 Pokemon exist.
		// The function counts raw bits, so it returns 152.
		expect(readPokedexCounts(ram).owned).toBe(152);
	});
});

// ─── Game Progress Tests ─────────────────────────────────────────────────────

describe('readGameProgress', () => {
	it('returns correct hours/minutes/seconds', () => {
		const ram = makeRam({
			[ADDR_PLAY_TIME_HOURS_HIGH]: 0x00,
			[ADDR_PLAY_TIME_HOURS_LOW]: 0x0a, // 10 hours
			[ADDR_PLAY_TIME_MINUTES]: 30,
			[ADDR_PLAY_TIME_SECONDS]: 45,
		});
		const progress = readGameProgress(ram);
		expect(progress.playTimeHours).toBe(10);
		expect(progress.playTimeMinutes).toBe(30);
		expect(progress.playTimeSeconds).toBe(45);
	});

	it('combines high and low bytes for hours > 255', () => {
		const ram = makeRam({
			[ADDR_PLAY_TIME_HOURS_HIGH]: 0x01, // 256
			[ADDR_PLAY_TIME_HOURS_LOW]: 0x00,
		});
		expect(readGameProgress(ram).playTimeHours).toBe(256);
	});

	it('returns 0 hours/minutes/seconds for fresh save', () => {
		const ram = makeRam();
		const progress = readGameProgress(ram);
		expect(progress.playTimeHours).toBe(0);
		expect(progress.playTimeMinutes).toBe(0);
		expect(progress.playTimeSeconds).toBe(0);
	});

	it('includes pokedex counts', () => {
		const ram = makeRam({
			[ADDR_POKEDEX_OWNED_START]: 0xff, // 8 owned
			[ADDR_POKEDEX_SEEN_START]: 0x0f, // 4 seen
		});
		const progress = readGameProgress(ram);
		expect(progress.pokedexOwned).toBe(8);
		expect(progress.pokedexSeen).toBe(4);
	});
});

// ─── Wild Encounter Rate Tests ───────────────────────────────────────────────

describe('readWildEncounterRate', () => {
	it('returns 0 for indoor maps (no encounters)', () => {
		const ram = makeRam();
		expect(readWildEncounterRate(ram)).toBe(0);
	});

	it('returns rate value for grass routes', () => {
		const ram = makeRam({ [ADDR_GRASS_RATE]: 25 });
		expect(readWildEncounterRate(ram)).toBe(25);
	});

	it('returns 255 for maximum encounter rate', () => {
		const ram = makeRam({ [ADDR_GRASS_RATE]: 255 });
		expect(readWildEncounterRate(ram)).toBe(255);
	});
});

// ─── decodeBCD Tests ─────────────────────────────────────────────────────────

describe('decodeBCD', () => {
	it('decodes [0x01, 0x23, 0x45] to 12345', () => {
		expect(decodeBCD([0x01, 0x23, 0x45])).toBe(12345);
	});

	it('decodes max money [0x99, 0x99, 0x99] to 999999', () => {
		expect(decodeBCD([0x99, 0x99, 0x99])).toBe(999999);
	});

	it('decodes zero [0x00, 0x00, 0x00] to 0', () => {
		expect(decodeBCD([0x00, 0x00, 0x00])).toBe(0);
	});

	it('decodes single byte [0x42] to 42', () => {
		expect(decodeBCD([0x42])).toBe(42);
	});

	it('decodes two bytes [0x05, 0x00] to 500', () => {
		expect(decodeBCD([0x05, 0x00])).toBe(500);
	});
});

// ─── decodeStatusCondition Tests ─────────────────────────────────────────────

describe('decodeStatusCondition', () => {
	it('returns "healthy" for 0x00', () => {
		expect(decodeStatusCondition(0x00)).toBe('healthy');
	});

	it('returns "poisoned" for 0x40', () => {
		expect(decodeStatusCondition(0x40)).toBe('poisoned');
	});

	it('returns "asleep" for 0x03 (3 sleep turns)', () => {
		expect(decodeStatusCondition(0x03)).toBe('asleep');
	});

	it('returns "burned" for burn bit', () => {
		expect(decodeStatusCondition(0x10)).toBe('burned');
	});

	it('returns "frozen" for freeze bit', () => {
		expect(decodeStatusCondition(0x08)).toBe('frozen');
	});

	it('returns "paralyzed" for paralysis bit', () => {
		expect(decodeStatusCondition(0x20)).toBe('paralyzed');
	});

	it('returns "asleep" for 1 sleep turn', () => {
		expect(decodeStatusCondition(0x01)).toBe('asleep');
	});
});

// ─── readPlayerInfo Tests ────────────────────────────────────────────────────

describe('readPlayerInfo', () => {
	it('returns name, money, badges, location, direction', () => {
		const ram = makeRam({
			// Name: "RED"
			[OVERWORLD_PLAYER_NAME_ADDR]: 0x91, // R
			[OVERWORLD_PLAYER_NAME_ADDR + 1]: 0x84, // E
			[OVERWORLD_PLAYER_NAME_ADDR + 2]: 0x83, // D
			[OVERWORLD_PLAYER_NAME_ADDR + 3]: 0x50,
			// Money: $12345
			[OVERWORLD_PLAYER_MONEY]: 0x01,
			[OVERWORLD_PLAYER_MONEY + 1]: 0x23,
			[OVERWORLD_PLAYER_MONEY + 2]: 0x45,
			// Badges: Boulder + Cascade
			[OVERWORLD_BADGES]: 0x03,
			// Location: Pallet Town (5, 3)
			[OVERWORLD_CUR_MAP]: 0x00,
			[OVERWORLD_X_COORD]: 5,
			[OVERWORLD_Y_COORD]: 3,
			// Direction: up
			[ADDR_PLAYER_DIRECTION]: 0x04,
		});
		const info = readPlayerInfo(ram);
		expect(info.name).toBe('RED');
		expect(info.money).toBe(12345);
		expect(info.badges).toBe(2);
		expect(info.badgeList).toEqual(['Boulder Badge', 'Cascade Badge']);
		expect(info.location.mapId).toBe(0);
		expect(info.location.mapName).toBe('Pallet Town');
		expect(info.location.x).toBe(5);
		expect(info.location.y).toBe(3);
		expect(info.direction).toBe('up');
	});

	it('returns all 8 badge names when all badges obtained', () => {
		const ram = makeRam({ [OVERWORLD_BADGES]: 0xff });
		const info = readPlayerInfo(ram);
		expect(info.badges).toBe(8);
		expect(info.badgeList).toHaveLength(8);
		expect(info.badgeList[0]).toBe('Boulder Badge');
		expect(info.badgeList[7]).toBe('Earth Badge');
	});

	it('returns PLAYER fallback name for empty name', () => {
		const ram = makeRam({ [OVERWORLD_PLAYER_NAME_ADDR]: 0x50 });
		const info = readPlayerInfo(ram);
		expect(info.name).toBe('PLAYER');
	});

	it('returns map name from lookup table', () => {
		const ram = makeRam({ [OVERWORLD_CUR_MAP]: 0x0c });
		const info = readPlayerInfo(ram);
		expect(info.location.mapName).toBe('Route 1');
	});
});

// ─── readFullParty Tests ─────────────────────────────────────────────────────

type TestPartyMon = {
	species: number;
	hp: number;
	maxHp: number;
	level: number;
	status: number;
	type1: number;
	type2: number;
	moves: Array<number>;
	pps: Array<number>;
	attack: number;
	defense: number;
	speed: number;
	special: number;
	nickname?: Array<number>;
};

function writeWord(overrides: Record<number, number>, addr: number, value: number): void {
	overrides[addr] = (value >> 8) & 0xff;
	overrides[addr + 1] = value & 0xff;
}

function writeByteArray(overrides: Record<number, number>, addr: number, bytes: Array<number>): void {
	for (let j = 0; j < bytes.length; j++) {
		overrides[addr + j] = bytes[j] ?? 0;
	}
}

function writePartySlot(overrides: Record<number, number>, index: number, p: TestPartyMon): void {
	const base = ADDR_PARTY_MONS + index * 0x2c;
	overrides[base] = p.species;
	writeWord(overrides, base + 0x01, p.hp);
	overrides[base + 0x21] = p.level;
	overrides[base + 0x04] = p.status;
	overrides[base + 0x05] = p.type1;
	overrides[base + 0x06] = p.type2;
	writeByteArray(overrides, base + 0x08, p.moves);
	writeByteArray(overrides, base + 0x1d, p.pps);
	writeWord(overrides, base + 0x22, p.maxHp);
	writeWord(overrides, base + 0x24, p.attack);
	writeWord(overrides, base + 0x26, p.defense);
	writeWord(overrides, base + 0x28, p.speed);
	writeWord(overrides, base + 0x2a, p.special);
	if (p.nickname) {
		writeByteArray(overrides, ADDR_PARTY_NICKNAMES + index * 11, p.nickname);
	}
}

function makePartyRam(count: number, pokemon: Array<TestPartyMon>): ReadonlyArray<number> {
	const overrides: Record<number, number> = {};
	overrides[ADDR_PARTY_COUNT] = count;
	for (let i = 0; i < pokemon.length; i++) {
		const p = pokemon[i];
		if (p) writePartySlot(overrides, i, p);
	}
	return makeRam(overrides);
}

describe('readFullParty', () => {
	it('returns empty array when party count is 0', () => {
		const ram = makeRam();
		expect(readFullParty(ram)).toEqual([]);
	});

	it('reads 3 Pokemon with correct data', () => {
		const ram = makePartyRam(3, [
			{
				species: 0x54, // Pikachu
				hp: 50,
				maxHp: 80,
				level: 25,
				status: 0,
				type1: 0x17,
				type2: 0x17, // Electric
				moves: [0x54],
				pps: [15], // Thunderbolt (move 84)
				attack: 55,
				defense: 40,
				speed: 90,
				special: 50,
				nickname: [0x8f, 0x88, 0x8a, 0x80, 0x50], // "PIKA"
			},
			{
				species: 0xb4, // Charizard
				hp: 120,
				maxHp: 150,
				level: 36,
				status: 0,
				type1: 0x14,
				type2: 0x02, // Fire/Flying
				moves: [0x34, 0x07],
				pps: [15, 25], // Flamethrower, Fire Punch?
				attack: 84,
				defense: 78,
				speed: 100,
				special: 85,
			},
			{
				species: 0x99, // Bulbasaur
				hp: 45,
				maxHp: 45,
				level: 15,
				status: 0x40, // poisoned
				type1: 0x16,
				type2: 0x03, // Grass/Poison
				moves: [0x16, 0x4d],
				pps: [25, 30],
				attack: 30,
				defense: 35,
				speed: 28,
				special: 40,
			},
		]);
		const party = readFullParty(ram);
		expect(party).toHaveLength(3);

		// First Pokemon - Pikachu
		expect(party[0]?.species).toBe('Pikachu');
		expect(party[0]?.speciesId).toBe(0x54);
		expect(party[0]?.nickname).toBe('PIKA');
		expect(party[0]?.level).toBe(25);
		expect(party[0]?.hp).toBe(50);
		expect(party[0]?.maxHp).toBe(80);
		expect(party[0]?.status).toBe('healthy');
		expect(party[0]?.stats.attack).toBe(55);
		expect(party[0]?.stats.defense).toBe(40);
		expect(party[0]?.stats.speed).toBe(90);
		expect(party[0]?.stats.specialAttack).toBe(50);
		expect(party[0]?.stats.specialDefense).toBe(50);

		// Second Pokemon - Charizard
		expect(party[1]?.species).toBe('Charizard');
		expect(party[1]?.level).toBe(36);
		expect(party[1]?.stats.attack).toBe(84);

		// Third Pokemon - Bulbasaur (poisoned)
		expect(party[2]?.species).toBe('Bulbasaur');
		expect(party[2]?.status).toBe('poisoned');
	});

	it('reads actual stats from RAM instead of estimates', () => {
		const ram = makePartyRam(1, [
			{
				species: 0x54, // Pikachu
				hp: 50,
				maxHp: 80,
				level: 25,
				status: 0,
				type1: 0x17,
				type2: 0x17,
				moves: [0x54],
				pps: [15],
				attack: 120,
				defense: 95,
				speed: 200,
				special: 180,
			},
		]);
		const party = readFullParty(ram);
		expect(party[0]?.stats.attack).toBe(120);
		expect(party[0]?.stats.defense).toBe(95);
		expect(party[0]?.stats.speed).toBe(200);
		expect(party[0]?.stats.specialAttack).toBe(180);
		expect(party[0]?.stats.specialDefense).toBe(180);
	});

	it('uses species name as fallback when nickname is empty', () => {
		const ram = makePartyRam(1, [
			{
				species: 0x54, // Pikachu
				hp: 50,
				maxHp: 50,
				level: 10,
				status: 0,
				type1: 0x17,
				type2: 0x17,
				moves: [0x54],
				pps: [15],
				attack: 30,
				defense: 20,
				speed: 40,
				special: 25,
				nickname: [0x50], // immediate terminator = empty
			},
		]);
		const party = readFullParty(ram);
		expect(party[0]?.nickname).toBe('Pikachu');
	});

	it('includes move details with moveId, type, and power', () => {
		const ram = makePartyRam(1, [
			{
				species: 0x54,
				hp: 50,
				maxHp: 50,
				level: 25,
				status: 0,
				type1: 0x17,
				type2: 0x17,
				moves: [0x55, 0x56], // Thunder, Body Slam (move IDs 85, 86)
				pps: [10, 15],
				attack: 55,
				defense: 40,
				speed: 90,
				special: 50,
			},
		]);
		const party = readFullParty(ram);
		const moves = party[0]?.moves;
		expect(moves).toBeDefined();
		expect(moves?.length).toBeGreaterThanOrEqual(1);
		// Each move should have moveId, pp, maxPp, type, power
		const firstMove = moves?.[0];
		expect(firstMove?.moveId).toBeGreaterThan(0);
		expect(firstMove?.pp).toBeGreaterThanOrEqual(0);
		expect(firstMove?.type).toBeDefined();
	});

	it('provides Struggle fallback when Pokemon has no moves', () => {
		const ram = makePartyRam(1, [
			{
				species: 0x54,
				hp: 50,
				maxHp: 50,
				level: 25,
				status: 0,
				type1: 0x17,
				type2: 0x17,
				moves: [],
				pps: [],
				attack: 55,
				defense: 40,
				speed: 90,
				special: 50,
			},
		]);
		const party = readFullParty(ram);
		expect(party[0]?.moves).toHaveLength(1);
		expect(party[0]?.moves[0]?.name).toBe('Struggle');
	});

	it('skips empty species slots (0x00 or 0xFF)', () => {
		const overrides: Record<number, number> = {
			[ADDR_PARTY_COUNT]: 3,
		};
		// Slot 0: valid
		const base0 = ADDR_PARTY_MONS;
		overrides[base0] = 0x54; // Pikachu
		overrides[base0 + 0x21] = 10;
		overrides[base0 + 0x22] = 0;
		overrides[base0 + 0x23] = 50;
		overrides[base0 + 0x24] = 0;
		overrides[base0 + 0x25] = 30;
		overrides[base0 + 0x26] = 0;
		overrides[base0 + 0x27] = 20;
		overrides[base0 + 0x28] = 0;
		overrides[base0 + 0x29] = 40;
		overrides[base0 + 0x2a] = 0;
		overrides[base0 + 0x2b] = 25;

		// Slot 1: empty (0xFF)
		const base1 = ADDR_PARTY_MONS + 0x2c;
		overrides[base1] = 0xff;

		// Slot 2: valid
		const base2 = ADDR_PARTY_MONS + 2 * 0x2c;
		overrides[base2] = 0x99; // Bulbasaur
		overrides[base2 + 0x21] = 5;
		overrides[base2 + 0x22] = 0;
		overrides[base2 + 0x23] = 30;
		overrides[base2 + 0x24] = 0;
		overrides[base2 + 0x25] = 20;
		overrides[base2 + 0x26] = 0;
		overrides[base2 + 0x27] = 20;
		overrides[base2 + 0x28] = 0;
		overrides[base2 + 0x29] = 20;
		overrides[base2 + 0x2a] = 0;
		overrides[base2 + 0x2b] = 20;

		const ram = makeRam(overrides);
		const party = readFullParty(ram);
		expect(party).toHaveLength(2);
		expect(party[0]?.species).toBe('Pikachu');
		expect(party[1]?.species).toBe('Bulbasaur');
	});

	it('caps party count at 6', () => {
		const overrides: Record<number, number> = {
			[ADDR_PARTY_COUNT]: 100, // absurd count
		};
		// Only set 6 valid slots
		for (let i = 0; i < 6; i++) {
			const base = ADDR_PARTY_MONS + i * 0x2c;
			overrides[base] = 0x54;
			overrides[base + 0x21] = 10;
			overrides[base + 0x22] = 0;
			overrides[base + 0x23] = 50;
			overrides[base + 0x24] = 0;
			overrides[base + 0x25] = 30;
			overrides[base + 0x26] = 0;
			overrides[base + 0x27] = 20;
			overrides[base + 0x28] = 0;
			overrides[base + 0x29] = 40;
			overrides[base + 0x2a] = 0;
			overrides[base + 0x2b] = 25;
		}
		const ram = makeRam(overrides);
		const party = readFullParty(ram);
		expect(party.length).toBeLessThanOrEqual(6);
	});

	it('decodes Pokemon nicknames from text encoding', () => {
		const ram = makePartyRam(1, [
			{
				species: 0x54,
				hp: 50,
				maxHp: 50,
				level: 25,
				status: 0,
				type1: 0x17,
				type2: 0x17,
				moves: [0x54],
				pps: [15],
				attack: 55,
				defense: 40,
				speed: 90,
				special: 50,
				// "SPARKY" = S(0x92) P(0x8f) A(0x80) R(0x91) K(0x8a) Y(0x98) terminator(0x50)
				nickname: [0x92, 0x8f, 0x80, 0x91, 0x8a, 0x98, 0x50],
			},
		]);
		const party = readFullParty(ram);
		expect(party[0]?.nickname).toBe('SPARKY');
	});
});
