import {
	type BattleAction,
	BattlePhase,
	type BattleState,
	type Direction,
	GamePhase,
	type InventoryItem,
	type MapLocation,
	type MoveData,
	type NpcInfo,
	type OpponentState,
	type OverworldState,
	type PokemonState,
	PokemonType,
	StatusCondition,
} from './types.js';

// ─── Pokemon Red Memory Map (English version) ────────────────────────────────
// Addresses from the pret/pokered disassembly project

// Battle flags
export const ADDR_BATTLE_TYPE = 0xd057; // 0=no battle, 1=wild, 2=trainer
export const ADDR_IN_BATTLE = 0xd058; // non-zero when in battle

// Player's active Pokemon (battle copy)
export const ADDR_PLAYER_SPECIES = 0xcfe5; // species index (1-151)
export const ADDR_PLAYER_HP_HIGH = 0xd015; // current HP high byte
export const ADDR_PLAYER_HP_LOW = 0xd016; // current HP low byte
export const ADDR_PLAYER_MAX_HP_HIGH = 0xd017; // max HP high byte
export const ADDR_PLAYER_MAX_HP_LOW = 0xd018; // max HP low byte
export const ADDR_PLAYER_STATUS = 0xd019; // status bitmask
export const ADDR_PLAYER_TYPE1 = 0xd01a; // type 1
export const ADDR_PLAYER_TYPE2 = 0xd01b; // type 2 (same as type 1 if single-type)
export const ADDR_PLAYER_LEVEL = 0xd022; // current level
export const ADDR_PLAYER_MOVES = 0xd01c; // 4 move IDs (1 byte each)
export const ADDR_PLAYER_PP = 0xd02d; // 4 PP values (1 byte each)

// Enemy Pokemon
export const ADDR_ENEMY_SPECIES = 0xcfe6; // species index
export const ADDR_ENEMY_HP_HIGH = 0xcfe7; // current HP high byte
export const ADDR_ENEMY_HP_LOW = 0xcfe8; // current HP low byte
export const ADDR_ENEMY_MAX_HP_HIGH = 0xd025; // max HP high byte
export const ADDR_ENEMY_MAX_HP_LOW = 0xd026; // max HP low byte
export const ADDR_ENEMY_STATUS = 0xcfe9; // status bitmask
export const ADDR_ENEMY_TYPE1 = 0xd0ac; // enemy type 1
export const ADDR_ENEMY_TYPE2 = 0xd0ad; // enemy type 2
export const ADDR_ENEMY_LEVEL = 0xcfeb; // enemy level

// Status bitmasks (Gen 1)
const STATUS_SLEEP_MASK = 0x07; // lower 3 bits = sleep turns remaining
const STATUS_FROZEN_BIT = 0x08;
const STATUS_BURNED_BIT = 0x10;
const STATUS_PARALYZED_BIT = 0x20;
const STATUS_POISONED_BIT = 0x40;

// Gen 1 type codes -> PokemonType
const TYPE_CODE_MAP: ReadonlyMap<number, PokemonType> = new Map([
	[0x00, PokemonType.Normal],
	[0x01, PokemonType.Fighting],
	[0x02, PokemonType.Flying],
	[0x03, PokemonType.Poison],
	[0x04, PokemonType.Ground],
	[0x05, PokemonType.Rock],
	[0x07, PokemonType.Bug],
	[0x08, PokemonType.Ghost],
	[0x14, PokemonType.Fire],
	[0x15, PokemonType.Water],
	[0x16, PokemonType.Grass],
	[0x17, PokemonType.Electric],
	[0x18, PokemonType.Psychic],
	[0x19, PokemonType.Ice],
	[0x1a, PokemonType.Dragon],
]);

// Gen 1 species codes (1-151) -> species names
// Partial list - codes map to internal dex order, not National Dex order
const SPECIES_CODE_MAP: ReadonlyMap<number, string> = new Map([
	[0x99, 'Bulbasaur'],
	[0x09, 'Ivysaur'],
	[0x9a, 'Venusaur'],
	[0xb0, 'Charmander'],
	[0xb2, 'Charmeleon'],
	[0xb4, 'Charizard'],
	[0xb1, 'Squirtle'],
	[0xb3, 'Wartortle'],
	[0x1c, 'Blastoise'],
	[0x7b, 'Caterpie'],
	[0x7c, 'Metapod'],
	[0x7d, 'Butterfree'],
	[0x70, 'Weedle'],
	[0x71, 'Kakuna'],
	[0x72, 'Beedrill'],
	[0x24, 'Pidgey'],
	[0x96, 'Pidgeotto'],
	[0x97, 'Pidgeot'],
	[0xa5, 'Rattata'],
	[0xa6, 'Raticate'],
	[0x05, 'Charmeleon'], // duplicate guard placeholder
	[0x23, 'Pikachu'],
	[0xa8, 'Raichu'],
	[0x60, 'Mewtwo'],
	[0x62, 'Mew'],
]);

// Move IDs (partial) for display names
const MOVE_NAME_MAP: ReadonlyMap<number, string> = new Map([
	[0x00, '(none)'],
	[0x01, 'Pound'],
	[0x02, 'Karate Chop'],
	[0x03, 'DoubleSlap'],
	[0x04, 'Comet Punch'],
	[0x05, 'Mega Punch'],
	[0x0a, 'Scratch'],
	[0x0b, 'Vice Grip'],
	[0x0d, 'Wing Attack'],
	[0x0e, 'Whirlwind'],
	[0x11, 'Tackle'],
	[0x12, 'Body Slam'],
	[0x14, 'Slash'],
	[0x18, 'Water Gun'],
	[0x19, 'Hydro Pump'],
	[0x1a, 'Surf'],
	[0x1b, 'Ice Beam'],
	[0x1c, 'Blizzard'],
	[0x1d, 'Psybeam'],
	[0x1e, 'BubbleBeam'],
	[0x21, 'Thunder'],
	[0x22, 'Rock Throw'],
	[0x24, 'Earthquake'],
	[0x27, 'Dig'],
	[0x29, 'Toxic'],
	[0x2c, 'Agility'],
	[0x2d, 'Quick Attack'],
	[0x2e, 'Rage'],
	[0x31, 'Teleport'],
	[0x32, 'Night Shade'],
	[0x33, 'Mimic'],
	[0x34, 'Screech'],
	[0x39, 'Thunderbolt'],
	[0x3a, 'Thunder Wave'],
	[0x3d, 'Ember'],
	[0x3e, 'Flamethrower'],
	[0x41, 'Fire Blast'],
	[0x4d, 'Hyper Beam'],
	[0x55, 'Psychic'],
	[0x5e, 'Swords Dance'],
	[0x62, 'Amnesia'],
	[0x63, 'Kinesis'],
	[0x73, 'Fly'],
	[0xf8, 'Struggle'],
]);

export function decodeStatus(statusByte: number): { condition: StatusCondition; sleepTurns: number } {
	if (statusByte === 0) {
		return { condition: StatusCondition.None, sleepTurns: 0 };
	}
	const sleepTurns = statusByte & STATUS_SLEEP_MASK;
	if (sleepTurns > 0) {
		return { condition: StatusCondition.Sleep, sleepTurns };
	}
	if (statusByte & STATUS_FROZEN_BIT) {
		return { condition: StatusCondition.Freeze, sleepTurns: 0 };
	}
	if (statusByte & STATUS_BURNED_BIT) {
		return { condition: StatusCondition.Burn, sleepTurns: 0 };
	}
	if (statusByte & STATUS_PARALYZED_BIT) {
		return { condition: StatusCondition.Paralysis, sleepTurns: 0 };
	}
	if (statusByte & STATUS_POISONED_BIT) {
		return { condition: StatusCondition.Poison, sleepTurns: 0 };
	}
	return { condition: StatusCondition.None, sleepTurns: 0 };
}

export function decodeType(typeCode: number): PokemonType {
	return TYPE_CODE_MAP.get(typeCode) ?? PokemonType.Normal;
}

export function decodeTypes(type1Code: number, type2Code: number): Array<PokemonType> {
	const t1 = decodeType(type1Code);
	const t2 = decodeType(type2Code);
	return t1 === t2 ? [t1] : [t1, t2];
}

export function decodeSpecies(speciesCode: number): string {
	return SPECIES_CODE_MAP.get(speciesCode) ?? `Unknown(0x${speciesCode.toString(16).padStart(2, '0')})`;
}

export function decodeMoves(ram: ReadonlyArray<number>, movesAddr: number, ppAddr: number): Array<MoveData> {
	const moves: Array<MoveData> = [];
	for (let i = 0; i < 4; i++) {
		const moveId = ram[movesAddr + i] ?? 0;
		if (moveId === 0) break;
		const pp = ram[ppAddr + i] ?? 0;
		moves.push({
			name: MOVE_NAME_MAP.get(moveId) ?? `Move#${moveId}`,
			pokemonType: PokemonType.Normal, // move type lookup requires full move table
			power: 40, // default - real value requires move table
			accuracy: 100,
			pp,
			maxPp: pp, // best estimate without additional data
			category: 'physical',
		});
	}
	return moves.length > 0
		? moves
		: [
				{
					name: 'Struggle',
					pokemonType: PokemonType.Normal,
					power: 50,
					accuracy: 100,
					pp: 1,
					maxPp: 1,
					category: 'physical',
				},
			];
}

export function isInBattle(ram: ReadonlyArray<number>): boolean {
	const battleFlag = ram[ADDR_IN_BATTLE] ?? 0;
	const battleType = ram[ADDR_BATTLE_TYPE] ?? 0;
	return battleFlag !== 0 || battleType !== 0;
}

function readWord(ram: ReadonlyArray<number>, addrHigh: number): number {
	const high = ram[addrHigh] ?? 0;
	const low = ram[addrHigh + 1] ?? 0;
	return (high << 8) | low;
}

export function extractPlayerPokemon(ram: ReadonlyArray<number>): PokemonState {
	const hp = readWord(ram, ADDR_PLAYER_HP_HIGH);
	const maxHp = readWord(ram, ADDR_PLAYER_MAX_HP_HIGH);
	const statusByte = ram[ADDR_PLAYER_STATUS] ?? 0;
	const { condition } = decodeStatus(statusByte);
	const level = ram[ADDR_PLAYER_LEVEL] ?? 1;

	// Stats estimated from level until full stat RAM extraction is implemented
	const estimatedStat = Math.max(1, Math.floor(level * 1.5 + 20));

	return {
		species: decodeSpecies(ram[ADDR_PLAYER_SPECIES] ?? 0),
		level,
		hp,
		maxHp: maxHp > 0 ? maxHp : 1,
		attack: estimatedStat,
		defense: estimatedStat,
		specialAttack: estimatedStat,
		specialDefense: estimatedStat,
		speed: estimatedStat,
		status: condition,
		types: decodeTypes(ram[ADDR_PLAYER_TYPE1] ?? 0, ram[ADDR_PLAYER_TYPE2] ?? 0),
		moves: decodeMoves(ram, ADDR_PLAYER_MOVES, ADDR_PLAYER_PP),
	};
}

export function extractOpponentPokemon(ram: ReadonlyArray<number>): OpponentState {
	const enemyHp = readWord(ram, ADDR_ENEMY_HP_HIGH);
	const enemyMaxHp = readWord(ram, ADDR_ENEMY_MAX_HP_HIGH);
	const hpPercent = enemyMaxHp > 0 ? (enemyHp / enemyMaxHp) * 100 : 0;
	const { condition } = decodeStatus(ram[ADDR_ENEMY_STATUS] ?? 0);

	return {
		species: decodeSpecies(ram[ADDR_ENEMY_SPECIES] ?? 0),
		hpPercent: Math.round(hpPercent * 10) / 10,
		status: condition,
		types: decodeTypes(ram[ADDR_ENEMY_TYPE1] ?? 0, ram[ADDR_ENEMY_TYPE2] ?? 0),
		level: ram[ADDR_ENEMY_LEVEL] ?? 1,
	};
}

export function buildAvailableActions(player: PokemonState): Array<BattleAction> {
	const actions: Array<BattleAction> = [];
	for (const i of [0, 1, 2, 3] as const) {
		const move = player.moves[i];
		if (move && move.pp > 0) {
			actions.push(`move:${i}`);
		}
	}
	if (actions.length === 0) {
		actions.push('move:0'); // Struggle fallback
	}
	actions.push('run');
	return actions;
}

export function extractBattleState(ram: ReadonlyArray<number>, gameId: string, turn: number): BattleState {
	const playerActive = extractPlayerPokemon(ram);
	const opponent = extractOpponentPokemon(ram);
	const now = Date.now();

	return {
		gameId,
		turn,
		phase: BattlePhase.ChooseAction,
		playerActive,
		playerParty: [playerActive], // full party requires reading party data
		opponent,
		availableActions: buildAvailableActions(playerActive),
		weather: '',
		turnHistory: [],
		lastAction: null,
		createdAt: now,
		updatedAt: now,
	};
}

// ─── Pokemon Red Overworld Memory Map ────────────────────────────────────────
// Addresses from the pret/pokered disassembly project

// Player position
export const OVERWORLD_Y_COORD = 0xd361; // wYCoord: player Y on current map
export const OVERWORLD_X_COORD = 0xd362; // wXCoord: player X on current map
export const OVERWORLD_CUR_MAP = 0xd35e; // wCurMap: current map ID (0-247)
export const OVERWORLD_PLAYER_DIR = 0xc109; // sprite 0 facing direction byte

// Map dimensions
export const OVERWORLD_MAP_HEIGHT = 0xd368; // wCurMapHeight
export const OVERWORLD_MAP_WIDTH = 0xd369; // wCurMapWidth

// Sprite/NPC data
export const OVERWORLD_SPRITE_DATA1_START = 0xc100; // wSpriteStateData1
export const OVERWORLD_SPRITE_DATA2_START = 0xc200; // wSpriteStateData2 (map coords)
export const OVERWORLD_SPRITE_ENTRY_SIZE = 0x10; // 16 bytes per sprite entry
export const OVERWORLD_MAX_SPRITES = 16; // sprite 0 = player, 1-15 = NPCs

// Player info
export const OVERWORLD_PLAYER_NAME_ADDR = 0xd158; // wPlayerName (up to 11 bytes, 0x50 terminated)
export const OVERWORLD_PLAYER_NAME_MAX_LEN = 11;
export const OVERWORLD_PLAYER_MONEY = 0xd347; // 3 bytes, BCD encoded
export const OVERWORLD_BADGES = 0xd356; // 1 byte bitfield (bit 0 = Boulder through bit 7 = Earth)

// Inventory
export const OVERWORLD_NUM_BAG_ITEMS = 0xd31d; // wNumBagItems
export const OVERWORLD_BAG_ITEMS = 0xd31e; // pairs: (item_id, quantity), terminated 0xFF
export const OVERWORLD_MAX_BAG_ITEMS = 20; // Gen 1 bag limit

// Game state detection
export const OVERWORLD_JOY_IGNORE = 0xcd6b; // wJoyIgnore: nonzero = input ignored (dialogue/cutscene)
export const OVERWORLD_CURRENT_MENU = 0xcc26; // wCurrentMenuItem
export const OVERWORLD_TEXT_DELAY_FLAGS = 0xd358; // wLetterPrintingDelayFlags

// Sprite data offsets within each 16-byte entry
const SPRITE1_PICTURE_ID = 0; // 0 = no sprite present
const SPRITE1_MOVEMENT_STATUS = 1; // 0=still, 1=ready, 2=moving
// SPRITE1_FACING_DIR (offset 9) is used via OVERWORLD_PLAYER_DIR for sprite 0

// Sprite data2 offsets (map-relative coordinates)
const SPRITE2_MAP_Y = 4;
const SPRITE2_MAP_X = 5;

// Direction encoding (bits 2-3 of facing direction byte)
const DIR_MASK = 0x0c;
// DIR_DOWN = 0x00 is the default case in decodeDirection switch
const DIR_UP = 0x04;
const DIR_LEFT = 0x08;
const DIR_RIGHT = 0x0c;

// Pokemon text encoding terminator
const TEXT_TERMINATOR = 0x50;

// Gen 1 Pokemon text encoding -> ASCII
const POKEMON_TEXT_MAP: ReadonlyMap<number, string> = new Map([
	[0x7f, ' '],
	// Uppercase A-Z
	[0x80, 'A'],
	[0x81, 'B'],
	[0x82, 'C'],
	[0x83, 'D'],
	[0x84, 'E'],
	[0x85, 'F'],
	[0x86, 'G'],
	[0x87, 'H'],
	[0x88, 'I'],
	[0x89, 'J'],
	[0x8a, 'K'],
	[0x8b, 'L'],
	[0x8c, 'M'],
	[0x8d, 'N'],
	[0x8e, 'O'],
	[0x8f, 'P'],
	[0x90, 'Q'],
	[0x91, 'R'],
	[0x92, 'S'],
	[0x93, 'T'],
	[0x94, 'U'],
	[0x95, 'V'],
	[0x96, 'W'],
	[0x97, 'X'],
	[0x98, 'Y'],
	[0x99, 'Z'],
	// Lowercase a-z
	[0xa0, 'a'],
	[0xa1, 'b'],
	[0xa2, 'c'],
	[0xa3, 'd'],
	[0xa4, 'e'],
	[0xa5, 'f'],
	[0xa6, 'g'],
	[0xa7, 'h'],
	[0xa8, 'i'],
	[0xa9, 'j'],
	[0xaa, 'k'],
	[0xab, 'l'],
	[0xac, 'm'],
	[0xad, 'n'],
	[0xae, 'o'],
	[0xaf, 'p'],
	[0xb0, 'q'],
	[0xb1, 'r'],
	[0xb2, 's'],
	[0xb3, 't'],
	[0xb4, 'u'],
	[0xb5, 'v'],
	[0xb6, 'w'],
	[0xb7, 'x'],
	[0xb8, 'y'],
	[0xb9, 'z'],
	// Digits 0-9
	[0xf6, '0'],
	[0xf7, '1'],
	[0xf8, '2'],
	[0xf9, '3'],
	[0xfa, '4'],
	[0xfb, '5'],
	[0xfc, '6'],
	[0xfd, '7'],
	[0xfe, '8'],
	[0xff, '9'],
	// Special characters
	[0xe0, "'"],
	[0xe3, '-'],
	[0xf4, '.'],
	[0xf5, '/'],
]);

// Badge names indexed by bit position
const BADGE_NAMES: ReadonlyArray<string> = [
	'Boulder Badge',
	'Cascade Badge',
	'Thunder Badge',
	'Rainbow Badge',
	'Soul Badge',
	'Marsh Badge',
	'Volcano Badge',
	'Earth Badge',
];

// Map ID -> name (towns, routes, and key locations)
const MAP_NAME_TABLE: ReadonlyMap<number, string> = new Map([
	[0x00, 'Pallet Town'],
	[0x01, 'Viridian City'],
	[0x02, 'Pewter City'],
	[0x03, 'Cerulean City'],
	[0x04, 'Lavender Town'],
	[0x05, 'Vermilion City'],
	[0x06, 'Celadon City'],
	[0x07, 'Fuchsia City'],
	[0x08, 'Cinnabar Island'],
	[0x09, 'Indigo Plateau'],
	[0x0a, 'Saffron City'],
	[0x0c, 'Route 1'],
	[0x0d, 'Route 2'],
	[0x0e, 'Route 3'],
	[0x0f, 'Route 4'],
	[0x10, 'Route 5'],
	[0x11, 'Route 6'],
	[0x12, 'Route 7'],
	[0x13, 'Route 8'],
	[0x14, 'Route 9'],
	[0x15, 'Route 10'],
	[0x16, 'Route 11'],
	[0x17, 'Route 12'],
	[0x18, 'Route 13'],
	[0x19, 'Route 14'],
	[0x1a, 'Route 15'],
	[0x1b, 'Route 16'],
	[0x1c, 'Route 17'],
	[0x1d, 'Route 18'],
	[0x1e, 'Route 19'],
	[0x1f, 'Route 20'],
	[0x20, 'Route 21'],
	[0x21, 'Route 22'],
	[0x22, 'Route 23'],
	[0x23, 'Route 24'],
	[0x24, 'Route 25'],
	[0x25, "Red's House 1F"],
	[0x26, "Red's House 2F"],
	[0x27, "Blue's House"],
	[0x28, "Prof. Oak's Lab"],
	[0x29, 'Viridian Pokemart'],
	[0x2a, 'Viridian Pokemon Center'],
	[0x2f, 'Pewter Pokemon Center'],
	[0x36, 'Cerulean Pokemon Center'],
	[0x3a, 'Vermilion Pokemon Center'],
	[0x58, 'Pokemon Tower 1F'],
	[0x8e, 'Silph Co. 1F'],
	[0xc7, 'Mt. Moon 1F'],
	[0xc8, 'Mt. Moon B1F'],
	[0xc9, 'Mt. Moon B2F'],
	[0xe5, 'Victory Road 1F'],
]);

// Item ID -> name (common items)
const ITEM_NAME_TABLE: ReadonlyMap<number, string> = new Map([
	[0x01, 'Master Ball'],
	[0x02, 'Ultra Ball'],
	[0x03, 'Great Ball'],
	[0x04, 'Poke Ball'],
	[0x05, 'Town Map'],
	[0x06, 'Bicycle'],
	[0x0a, 'Antidote'],
	[0x0b, 'Burn Heal'],
	[0x0c, 'Ice Heal'],
	[0x0d, 'Awakening'],
	[0x0e, 'Parlyz Heal'],
	[0x0f, 'Full Restore'],
	[0x10, 'Max Potion'],
	[0x11, 'Hyper Potion'],
	[0x12, 'Super Potion'],
	[0x13, 'Potion'],
	[0x1d, 'Escape Rope'],
	[0x1e, 'Repel'],
	[0x28, 'Fire Stone'],
	[0x29, 'Thunder Stone'],
	[0x2a, 'Water Stone'],
	[0x2b, 'HP Up'],
	[0x2c, 'Protein'],
	[0x2d, 'Iron'],
	[0x2e, 'Carbos'],
	[0x2f, 'Calcium'],
	[0x30, 'Rare Candy'],
	[0x31, 'Dome Fossil'],
	[0x32, 'Helix Fossil'],
	[0x40, 'Nugget'],
	[0x43, 'Poke Doll'],
	[0x44, 'Full Heal'],
	[0x45, 'Revive'],
	[0x46, 'Max Revive'],
	[0x48, 'Super Repel'],
	[0x49, 'Max Repel'],
	[0x4c, 'Fresh Water'],
	[0x4d, 'Soda Pop'],
	[0x4e, 'Lemonade'],
	[0x4f, 'S.S. Ticket'],
	[0xc4, 'HM01 Cut'],
	[0xc5, 'HM02 Fly'],
	[0xc6, 'HM03 Surf'],
	[0xc7, 'HM04 Strength'],
	[0xc8, 'HM05 Flash'],
]);

// ─── Overworld Helper Functions ──────────────────────────────────────────────

export function decodePokemonText(ram: ReadonlyArray<number>, addr: number, maxLen: number): string {
	let result = '';
	for (let i = 0; i < maxLen; i++) {
		const byte = ram[addr + i] ?? 0;
		if (byte === TEXT_TERMINATOR) break;
		const char = POKEMON_TEXT_MAP.get(byte);
		if (char !== undefined) {
			result += char;
		}
	}
	return result;
}

function decodeBcd(byte: number): number {
	return ((byte >> 4) & 0x0f) * 10 + (byte & 0x0f);
}

export function decodeDirection(dirByte: number): Direction {
	const dir = dirByte & DIR_MASK;
	switch (dir) {
		case DIR_UP:
			return 'up';
		case DIR_LEFT:
			return 'left';
		case DIR_RIGHT:
			return 'right';
		default:
			return 'down';
	}
}

export function decodeMapName(mapId: number): string {
	return MAP_NAME_TABLE.get(mapId) ?? `Map ${mapId}`;
}

export function decodeItemName(itemId: number): string {
	return ITEM_NAME_TABLE.get(itemId) ?? `Item #${itemId}`;
}

export function decodeBadgeNames(badgeByte: number): Array<string> {
	const badges: Array<string> = [];
	for (let i = 0; i < 8; i++) {
		if (badgeByte & (1 << i)) {
			badges.push(BADGE_NAMES[i] ?? `Badge ${i}`);
		}
	}
	return badges;
}

export function readPlayerName(ram: ReadonlyArray<number>): string {
	const name = decodePokemonText(ram, OVERWORLD_PLAYER_NAME_ADDR, OVERWORLD_PLAYER_NAME_MAX_LEN);
	return name.length > 0 ? name : 'PLAYER';
}

export function readMoney(ram: ReadonlyArray<number>): number {
	const b0 = ram[OVERWORLD_PLAYER_MONEY] ?? 0;
	const b1 = ram[OVERWORLD_PLAYER_MONEY + 1] ?? 0;
	const b2 = ram[OVERWORLD_PLAYER_MONEY + 2] ?? 0;
	return decodeBcd(b0) * 10000 + decodeBcd(b1) * 100 + decodeBcd(b2);
}

export function readBadges(ram: ReadonlyArray<number>): number {
	const badgeByte = ram[OVERWORLD_BADGES] ?? 0;
	let count = 0;
	for (let i = 0; i < 8; i++) {
		if (badgeByte & (1 << i)) {
			count++;
		}
	}
	return count;
}

export function readInventory(ram: ReadonlyArray<number>): Array<InventoryItem> {
	const count = Math.min(ram[OVERWORLD_NUM_BAG_ITEMS] ?? 0, OVERWORLD_MAX_BAG_ITEMS);
	const items: Array<InventoryItem> = [];
	for (let i = 0; i < count; i++) {
		const offset = OVERWORLD_BAG_ITEMS + i * 2;
		const itemId = ram[offset] ?? 0;
		if (itemId === 0xff) break; // terminator
		const quantity = ram[offset + 1] ?? 0;
		items.push({
			itemId,
			name: decodeItemName(itemId),
			quantity,
		});
	}
	return items;
}

export function readNearbySprites(ram: ReadonlyArray<number>): Array<NpcInfo> {
	const sprites: Array<NpcInfo> = [];
	// Skip sprite 0 (player), read sprites 1-15
	for (let i = 1; i < OVERWORLD_MAX_SPRITES; i++) {
		const data1Offset = OVERWORLD_SPRITE_DATA1_START + i * OVERWORLD_SPRITE_ENTRY_SIZE;
		const pictureId = ram[data1Offset + SPRITE1_PICTURE_ID] ?? 0;
		if (pictureId === 0) continue; // empty sprite slot

		const data2Offset = OVERWORLD_SPRITE_DATA2_START + i * OVERWORLD_SPRITE_ENTRY_SIZE;
		const mapY = ram[data2Offset + SPRITE2_MAP_Y] ?? 0;
		const mapX = ram[data2Offset + SPRITE2_MAP_X] ?? 0;
		const movementStatus = ram[data1Offset + SPRITE1_MOVEMENT_STATUS] ?? 0;

		sprites.push({
			id: i,
			name: `NPC #${i}`,
			x: mapX,
			y: mapY,
			canTalk: movementStatus !== 2, // can't interact while moving
		});
	}
	return sprites;
}

export function detectGamePhase(ram: ReadonlyArray<number>): GamePhase {
	// Check battle first (most specific)
	const battleType = ram[ADDR_BATTLE_TYPE] ?? 0;
	if (battleType !== 0) {
		return GamePhase.Battle;
	}

	// Check if input is being ignored (dialogue or cutscene)
	const joyIgnore = ram[OVERWORLD_JOY_IGNORE] ?? 0;
	const textFlags = ram[OVERWORLD_TEXT_DELAY_FLAGS] ?? 0;

	if (textFlags !== 0) {
		return GamePhase.Dialogue;
	}

	if (joyIgnore !== 0) {
		return GamePhase.Cutscene;
	}

	return GamePhase.Overworld;
}

export function extractOverworldState(ram: ReadonlyArray<number>): OverworldState {
	const mapId = ram[OVERWORLD_CUR_MAP] ?? 0;
	const playerX = ram[OVERWORLD_X_COORD] ?? 0;
	const playerY = ram[OVERWORLD_Y_COORD] ?? 0;

	const location: MapLocation = {
		mapId,
		mapName: decodeMapName(mapId),
		x: playerX,
		y: playerY,
	};

	const dirByte = ram[OVERWORLD_PLAYER_DIR] ?? 0;
	const playerDirection = decodeDirection(dirByte);

	const gamePhase = detectGamePhase(ram);

	// Outdoor maps: towns (0x00-0x0A) and routes (0x0C-0x24)
	const isOutdoor = mapId <= 0x0a || (mapId >= 0x0c && mapId <= 0x24);

	const joyIgnore = ram[OVERWORLD_JOY_IGNORE] ?? 0;
	const canMove = gamePhase === GamePhase.Overworld && joyIgnore === 0;

	return {
		gamePhase,
		location,
		playerDirection,
		inBuilding: !isOutdoor,
		canMove,
		nearbyNpcs: readNearbySprites(ram),
		nearbyItems: [], // overworld item detection requires map object data
		player: {
			name: readPlayerName(ram),
			money: readMoney(ram),
			badges: readBadges(ram),
			inventory: readInventory(ram),
			party: [], // full party extraction requires party RAM addresses
		},
		menuOpen: null,
		dialogueText: null,
		secondsRemaining: 0,
	};
}
