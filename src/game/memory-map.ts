import { MOVE_TABLE } from './move-data.js';
import {
	type BattleAction,
	BattlePhase,
	type BattleState,
	type Direction,
	type FullPlayerInfo,
	type GameAction,
	GamePhase,
	type InventoryItem,
	type MapLocation,
	type MoveData,
	type NpcInfo,
	type OpponentState,
	type OverworldState,
	type PartyPokemon,
	type PartyPokemonMove,
	type PokemonState,
	PokemonType,
	StatusCondition,
	type WarpInfo,
} from './types.js';

// ─── Pokemon Red Memory Map (English version) ────────────────────────────────
// Addresses from the pret/pokered disassembly project

// Battle flags
export const ADDR_BATTLE_TYPE = 0xd057; // 0=no battle, 1=wild, 2=trainer
export const ADDR_IN_BATTLE = 0xd058; // non-zero when in battle
export const ADDR_W_BATTLE_TYPE = 0xd05a; // wBattleType: 0=normal, 1=Old Man, 2=Safari Zone

// Game state flags (wStatusFlags1-7)
export const ADDR_STATUS_FLAGS_1 = 0xd728; // wStatusFlags1: bit flags for game state
export const ADDR_STATUS_FLAGS_2 = 0xd729; // wStatusFlags2: more state flags
export const ADDR_STATUS_FLAGS_3 = 0xd72a; // wStatusFlags3: more state flags
export const ADDR_STATUS_FLAGS_4 = 0xd72b; // wStatusFlags4: more state flags
export const ADDR_STATUS_FLAGS_5 = 0xd72c; // wStatusFlags5: more state flags
export const ADDR_STATUS_FLAGS_6 = 0xd72d; // wStatusFlags6: more state flags
export const ADDR_STATUS_FLAGS_7 = 0xd72e; // wStatusFlags7: more state flags
export const ADDR_ELITE4_FLAGS = 0xd734; // wElite4Flags: Elite Four progress flags
export const ADDR_MOVEMENT_FLAGS = 0xd736; // wMovementFlags: movement restriction flags

// Movement
export const ADDR_WALK_BIKE_SURF_STATE = 0xd700; // wWalkBikeSurfState: 0=walking, 1=biking, 2=surfing
export const ADDR_PLAYER_DIRECTION = 0xd52a; // wPlayerDirection: more accurate than sprite facing

// Collision
export const ADDR_TILE_IN_FRONT_OF_PLAYER = 0xcfc6; // wTileInFrontOfPlayer: tile ID player is facing
export const ADDR_BOULDER_COLLISION_RESULT = 0xd71c; // wTileInFrontOfBoulderCollisionResult
export const ADDR_GRASS_TILE = 0xd535; // wGrassTile: grass tile ID for current map

// Player stat modifiers (Section 12, 7 = neutral, 1 = -6 stages, 13 = +6 stages)
export const ADDR_PLAYER_ATTACK_MOD = 0xcd1a; // wPlayerAttackMod
export const ADDR_PLAYER_DEFENSE_MOD = 0xcd1b; // wPlayerDefenseMod
export const ADDR_PLAYER_SPEED_MOD = 0xcd1c; // wPlayerSpeedMod
export const ADDR_PLAYER_SPECIAL_MOD = 0xcd1d; // wPlayerSpecialMod
export const ADDR_PLAYER_ACCURACY_MOD = 0xcd1e; // wPlayerAccuracyMod
export const ADDR_PLAYER_EVASION_MOD = 0xcd1f; // wPlayerEvasionMod

// Enemy stat modifiers (Section 12, same layout as player)
export const ADDR_ENEMY_ATTACK_MOD = 0xcd2e; // wEnemyAttackMod
export const ADDR_ENEMY_DEFENSE_MOD = 0xcd2f; // wEnemyDefenseMod
export const ADDR_ENEMY_SPEED_MOD = 0xcd30; // wEnemySpeedMod
export const ADDR_ENEMY_SPECIAL_MOD = 0xcd31; // wEnemySpecialMod
export const ADDR_ENEMY_ACCURACY_MOD = 0xcd32; // wEnemyAccuracyMod
export const ADDR_ENEMY_EVASION_MOD = 0xcd33; // wEnemyEvasionMod

// Player battle status bitfields (Section 12)
export const ADDR_PLAYER_BATTLE_STATUS1 = 0xd062; // wPlayerBattleStatus1
export const ADDR_PLAYER_BATTLE_STATUS2 = 0xd063; // wPlayerBattleStatus2
export const ADDR_PLAYER_BATTLE_STATUS3 = 0xd064; // wPlayerBattleStatus3

// Enemy battle status bitfields (Section 12, same bit layout as player)
export const ADDR_ENEMY_BATTLE_STATUS1 = 0xd067; // wEnemyBattleStatus1
export const ADDR_ENEMY_BATTLE_STATUS2 = 0xd068; // wEnemyBattleStatus2
export const ADDR_ENEMY_BATTLE_STATUS3 = 0xd069; // wEnemyBattleStatus3

// Player active battle stats (Section 11, big-endian 16-bit)
export const ADDR_PLAYER_ATTACK = 0xd025; // wPlayerAttack (2 bytes)
export const ADDR_PLAYER_DEFENSE = 0xd027; // wPlayerDefense (2 bytes)
export const ADDR_PLAYER_SPEED = 0xd029; // wPlayerSpeed (2 bytes)
export const ADDR_PLAYER_SPECIAL = 0xd02b; // wPlayerSpecial (2 bytes)

// Enemy active battle stats (Section 11, big-endian 16-bit)
export const ADDR_ENEMY_ATTACK = 0xcff6; // wEnemyAttack (2 bytes)
export const ADDR_ENEMY_DEFENSE = 0xcff8; // wEnemyDefense (2 bytes)
export const ADDR_ENEMY_SPEED = 0xcffa; // wEnemySpeed (2 bytes)
export const ADDR_ENEMY_SPECIAL = 0xcffc; // wEnemySpecial (2 bytes)

// Enemy moves + PP
export const ADDR_ENEMY_MOVES = 0xcfed; // wEnemyMoves (4 bytes, move IDs)
export const ADDR_ENEMY_PP = 0xcffe; // wEnemyMovePP (4 bytes)

// Current move being used this turn
export const ADDR_PLAYER_MOVE_ID = 0xcfd2; // wPlayerMoveID
export const ADDR_PLAYER_MOVE_EFFECT = 0xcfd3; // wPlayerMoveEffect
export const ADDR_PLAYER_MOVE_POWER = 0xcfd4; // wPlayerMovePower
export const ADDR_PLAYER_MOVE_TYPE = 0xcfd5; // wPlayerMoveType
export const ADDR_PLAYER_MOVE_ACCURACY = 0xcfd6; // wPlayerMoveAccuracy
export const ADDR_ENEMY_MOVE_ID = 0xcfcc; // wEnemyMoveID
export const ADDR_ENEMY_MOVE_EFFECT = 0xcfcd; // wEnemyMoveEffect
export const ADDR_ENEMY_MOVE_POWER = 0xcfce; // wEnemyMovePower
export const ADDR_ENEMY_MOVE_TYPE = 0xcfcf; // wEnemyMoveType
export const ADDR_ENEMY_MOVE_ACCURACY = 0xcfd0; // wEnemyMoveAccuracy

// Enemy trainer data (Section 13)
export const ADDR_TRAINER_CLASS = 0xd031; // wTrainerClass
export const ADDR_CUR_OPPONENT = 0xd059; // wCurOpponent: >200 = trainer, else wild
export const ADDR_ENEMY_PARTY_COUNT = 0xd89c; // wEnemyPartyCount

// Misc battle state
export const ADDR_BATTLE_TURN_COUNT = 0xccd5; // wBattleTurnCount
export const ADDR_PLAYER_SUBSTITUTE_HP = 0xccd7; // wPlayerSubstituteHP
export const ADDR_ENEMY_SUBSTITUTE_HP = 0xccd8; // wEnemySubstituteHP
export const ADDR_CRITICAL_OHKO_FLAG = 0xd05e; // wCriticalOHKOFlag
export const ADDR_PLAYER_CONFUSION_COUNTER = 0xd06b; // wPlayerConfusionCounter
export const ADDR_PLAYER_TOXIC_COUNTER = 0xd06c; // wPlayerToxicCounter

// Player's active Pokemon (wBattleMon @ 0xD014, from pret/pokered battle_struct)
export const ADDR_PLAYER_SPECIES = 0xd014; // wBattleMonSpecies
export const ADDR_PLAYER_HP_HIGH = 0xd015; // wBattleMonHP (2 bytes, big-endian)
export const ADDR_PLAYER_HP_LOW = 0xd016;
export const ADDR_PLAYER_STATUS = 0xd018; // wBattleMonStatus (offset +4)
export const ADDR_PLAYER_TYPE1 = 0xd019; // wBattleMonType1 (offset +5)
export const ADDR_PLAYER_TYPE2 = 0xd01a; // wBattleMonType2 (offset +6)
export const ADDR_PLAYER_MOVES = 0xd01c; // wBattleMonMoves (offset +8, 4 bytes)
export const ADDR_PLAYER_LEVEL = 0xd022; // wBattleMonLevel (offset +14)
export const ADDR_PLAYER_MAX_HP_HIGH = 0xd023; // wBattleMonMaxHP (offset +15, 2 bytes)
export const ADDR_PLAYER_MAX_HP_LOW = 0xd024;
export const ADDR_PLAYER_PP = 0xd02d; // wBattleMonPP (offset +25, 4 bytes)

// Enemy Pokemon (wEnemyMon @ 0xCFE5, from pret/pokered battle_struct)
export const ADDR_ENEMY_SPECIES = 0xcfe5; // wEnemyMonSpecies (offset +0)
export const ADDR_ENEMY_HP_HIGH = 0xcfe6; // wEnemyMonHP (offset +1, 2 bytes)
export const ADDR_ENEMY_HP_LOW = 0xcfe7;
export const ADDR_ENEMY_STATUS = 0xcfe9; // wEnemyMonStatus (offset +4)
export const ADDR_ENEMY_TYPE1 = 0xcfea; // wEnemyMonType1 (offset +5)
export const ADDR_ENEMY_TYPE2 = 0xcfeb; // wEnemyMonType2 (offset +6)
export const ADDR_ENEMY_LEVEL = 0xcff3; // wEnemyMonLevel (offset +14)
export const ADDR_ENEMY_MAX_HP_HIGH = 0xcff4; // wEnemyMonMaxHP (offset +15, 2 bytes)
export const ADDR_ENEMY_MAX_HP_LOW = 0xcff5;

// Party data addresses
export const ADDR_PARTY_COUNT = 0xd163; // wPartyCount: number of Pokemon in party (0-6)
export const ADDR_PARTY_SPECIES_LIST = 0xd164; // wPartySpecies: species IDs (6 bytes)
export const ADDR_PARTY_MONS = 0xd16b; // wPartyMon1: start of party Pokemon structs (44 bytes each)
const PARTY_MON_SIZE = 0x2c; // 44 bytes per party member
export const ADDR_PARTY_OT_NAMES = 0xd273; // wPartyMonOT1: Original Trainer names (11 bytes each)
export const ADDR_PARTY_NICKNAMES = 0xd2b5; // wPartyMonNick1: nicknames (11 bytes each)
const PARTY_NICKNAME_SIZE = 11; // max nickname length including terminator

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

// Gen 1 species codes -> species names (complete, all 151 Pokemon)
// Internal index order from pret/pokered disassembly (NOT National Dex order)
const SPECIES_CODE_MAP: ReadonlyMap<number, string> = new Map([
	[0x01, 'Rhydon'],
	[0x02, 'Kangaskhan'],
	[0x03, 'Nidoran M'],
	[0x04, 'Clefairy'],
	[0x05, 'Spearow'],
	[0x06, 'Voltorb'],
	[0x07, 'Nidoking'],
	[0x08, 'Slowbro'],
	[0x09, 'Ivysaur'],
	[0x0a, 'Exeggutor'],
	[0x0b, 'Lickitung'],
	[0x0c, 'Exeggcute'],
	[0x0d, 'Grimer'],
	[0x0e, 'Gengar'],
	[0x0f, 'Nidoran F'],
	[0x10, 'Nidoqueen'],
	[0x11, 'Cubone'],
	[0x12, 'Rhyhorn'],
	[0x13, 'Lapras'],
	[0x14, 'Arcanine'],
	[0x15, 'Mew'],
	[0x16, 'Gyarados'],
	[0x17, 'Shellder'],
	[0x18, 'Tentacool'],
	[0x19, 'Gastly'],
	[0x1a, 'Scyther'],
	[0x1b, 'Staryu'],
	[0x1c, 'Blastoise'],
	[0x1d, 'Pinsir'],
	[0x1e, 'Tangela'],
	[0x21, 'Growlithe'],
	[0x22, 'Onix'],
	[0x23, 'Fearow'],
	[0x24, 'Pidgey'],
	[0x25, 'Slowpoke'],
	[0x26, 'Kadabra'],
	[0x27, 'Graveler'],
	[0x28, 'Chansey'],
	[0x29, 'Machoke'],
	[0x2a, 'Mr. Mime'],
	[0x2b, 'Hitmonlee'],
	[0x2c, 'Hitmonchan'],
	[0x2d, 'Arbok'],
	[0x2e, 'Parasect'],
	[0x2f, 'Psyduck'],
	[0x30, 'Drowzee'],
	[0x31, 'Golem'],
	[0x33, 'Magmar'],
	[0x35, 'Electabuzz'],
	[0x36, 'Magneton'],
	[0x37, 'Koffing'],
	[0x39, 'Mankey'],
	[0x3a, 'Seel'],
	[0x3b, 'Diglett'],
	[0x3c, 'Tauros'],
	[0x40, "Farfetch'd"],
	[0x41, 'Venonat'],
	[0x42, 'Dragonite'],
	[0x46, 'Doduo'],
	[0x47, 'Poliwag'],
	[0x48, 'Jynx'],
	[0x49, 'Moltres'],
	[0x4a, 'Articuno'],
	[0x4b, 'Zapdos'],
	[0x4c, 'Ditto'],
	[0x4d, 'Meowth'],
	[0x4e, 'Krabby'],
	[0x52, 'Vulpix'],
	[0x53, 'Ninetales'],
	[0x54, 'Pikachu'],
	[0x55, 'Raichu'],
	[0x58, 'Dratini'],
	[0x59, 'Dragonair'],
	[0x5a, 'Kabuto'],
	[0x5b, 'Kabutops'],
	[0x5c, 'Horsea'],
	[0x5d, 'Seadra'],
	[0x60, 'Sandshrew'],
	[0x61, 'Sandslash'],
	[0x62, 'Omanyte'],
	[0x63, 'Omastar'],
	[0x64, 'Jigglypuff'],
	[0x65, 'Wigglytuff'],
	[0x66, 'Eevee'],
	[0x67, 'Flareon'],
	[0x68, 'Jolteon'],
	[0x69, 'Vaporeon'],
	[0x6a, 'Machop'],
	[0x6b, 'Zubat'],
	[0x6c, 'Ekans'],
	[0x6d, 'Paras'],
	[0x6e, 'Poliwhirl'],
	[0x6f, 'Poliwrath'],
	[0x70, 'Weedle'],
	[0x71, 'Kakuna'],
	[0x72, 'Beedrill'],
	[0x74, 'Dodrio'],
	[0x75, 'Primeape'],
	[0x76, 'Dugtrio'],
	[0x77, 'Venomoth'],
	[0x78, 'Dewgong'],
	[0x7b, 'Caterpie'],
	[0x7c, 'Metapod'],
	[0x7d, 'Butterfree'],
	[0x7e, 'Machamp'],
	[0x80, 'Golduck'],
	[0x81, 'Hypno'],
	[0x82, 'Golbat'],
	[0x83, 'Mewtwo'],
	[0x84, 'Snorlax'],
	[0x85, 'Magikarp'],
	[0x88, 'Muk'],
	[0x8a, 'Kingler'],
	[0x8b, 'Cloyster'],
	[0x8d, 'Electrode'],
	[0x8e, 'Clefable'],
	[0x8f, 'Weezing'],
	[0x90, 'Persian'],
	[0x91, 'Marowak'],
	[0x93, 'Haunter'],
	[0x94, 'Abra'],
	[0x95, 'Alakazam'],
	[0x96, 'Pidgeotto'],
	[0x97, 'Pidgeot'],
	[0x98, 'Starmie'],
	[0x99, 'Bulbasaur'],
	[0x9a, 'Venusaur'],
	[0x9b, 'Tentacruel'],
	[0x9d, 'Goldeen'],
	[0x9e, 'Seaking'],
	[0xa3, 'Ponyta'],
	[0xa4, 'Rapidash'],
	[0xa5, 'Rattata'],
	[0xa6, 'Raticate'],
	[0xa7, 'Nidorino'],
	[0xa8, 'Nidorina'],
	[0xa9, 'Geodude'],
	[0xaa, 'Porygon'],
	[0xab, 'Aerodactyl'],
	[0xad, 'Magnemite'],
	[0xb0, 'Charmander'],
	[0xb1, 'Squirtle'],
	[0xb2, 'Charmeleon'],
	[0xb3, 'Wartortle'],
	[0xb4, 'Charizard'],
	[0xb9, 'Oddish'],
	[0xba, 'Gloom'],
	[0xbb, 'Vileplume'],
	[0xbc, 'Bellsprout'],
	[0xbd, 'Weepinbell'],
	[0xbe, 'Victreebel'],
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

// ─── Stat Modifiers ──────────────────────────────────────────────────────────

export type StatModifiers = {
	attack: number; // 1-13, 7 = neutral
	defense: number;
	speed: number;
	special: number;
	accuracy: number;
	evasion: number;
};

/**
 * Read 6 consecutive stat modifier bytes starting at baseAddr.
 * Values: 1 = -6 stages, 7 = neutral, 13 = +6 stages.
 */
export function readStatModifiers(ram: ReadonlyArray<number>, baseAddr: number): StatModifiers {
	return {
		attack: ram[baseAddr] ?? 7,
		defense: ram[baseAddr + 1] ?? 7,
		speed: ram[baseAddr + 2] ?? 7,
		special: ram[baseAddr + 3] ?? 7,
		accuracy: ram[baseAddr + 4] ?? 7,
		evasion: ram[baseAddr + 5] ?? 7,
	};
}

// ─── Battle Status Flags ─────────────────────────────────────────────────────

// Battle status bitfield definitions: [bitmask, flag_name] pairs per byte
const BATTLE_STATUS1_FLAGS: ReadonlyArray<readonly [number, string]> = [
	[0x01, 'bide'], // Bit 0: Bide storing energy
	[0x02, 'thrash'], // Bit 1: Thrashing about
	[0x04, 'charging'], // Bit 2: Charging up (SolarBeam, etc.)
	[0x08, 'multi_turn'], // Bit 3: Multi-turn move (Wrap, Bind, etc.)
	[0x10, 'flinch'], // Bit 4: Flinched
	[0x20, 'locked'], // Bit 5: Locked on (multi-turn attack)
	[0x40, 'invulnerable'], // Bit 6: Invulnerable (Fly, Dig)
];

const BATTLE_STATUS2_FLAGS: ReadonlyArray<readonly [number, string]> = [
	[0x01, 'x_accuracy'], // Bit 0: X Accuracy effect active
	[0x02, 'mist'], // Bit 1: Protected by Mist
	[0x04, 'focus_energy'], // Bit 2: Focus Energy active
	[0x08, 'substitute'], // Bit 3: Substitute active
];

const BATTLE_STATUS3_FLAGS: ReadonlyArray<readonly [number, string]> = [
	[0x01, 'confused'], // Bit 0: Confused
	[0x10, 'light_screen'], // Bit 4: Light Screen active
	[0x20, 'reflect'], // Bit 5: Reflect active
	[0x80, 'transformed'], // Bit 7: Transformed (used Transform)
];

function decodeBitfield(byte: number, definitions: ReadonlyArray<readonly [number, string]>): Array<string> {
	const flags: Array<string> = [];
	for (const [mask, name] of definitions) {
		if (byte & mask) flags.push(name);
	}
	return flags;
}

/**
 * Decode 3 battle status bitfield bytes into human-readable flag names.
 * Returns an array like ["confused", "substitute"] or [] if no flags set.
 */
export function readBattleStatusFlags(
	ram: ReadonlyArray<number>,
	addr1: number,
	addr2: number,
	addr3: number,
): Array<string> {
	return [
		...decodeBitfield(ram[addr1] ?? 0, BATTLE_STATUS1_FLAGS),
		...decodeBitfield(ram[addr2] ?? 0, BATTLE_STATUS2_FLAGS),
		...decodeBitfield(ram[addr3] ?? 0, BATTLE_STATUS3_FLAGS),
	];
}

// ─── Battle Stats from RAM ───────────────────────────────────────────────────

export type BattleStats = {
	attack: number;
	defense: number;
	speed: number;
	special: number;
};

/**
 * Read player's active battle stats directly from RAM.
 * 4 big-endian 16-bit values at 0xD025-0xD02C.
 */
export function extractPlayerBattleStats(ram: ReadonlyArray<number>): BattleStats {
	return {
		attack: readWord(ram, ADDR_PLAYER_ATTACK),
		defense: readWord(ram, ADDR_PLAYER_DEFENSE),
		speed: readWord(ram, ADDR_PLAYER_SPEED),
		special: readWord(ram, ADDR_PLAYER_SPECIAL),
	};
}

/**
 * Read enemy's active battle stats directly from RAM.
 * 4 big-endian 16-bit values at 0xCFF6-0xCFFD.
 */
export function extractEnemyBattleStats(ram: ReadonlyArray<number>): BattleStats {
	return {
		attack: readWord(ram, ADDR_ENEMY_ATTACK),
		defense: readWord(ram, ADDR_ENEMY_DEFENSE),
		speed: readWord(ram, ADDR_ENEMY_SPEED),
		special: readWord(ram, ADDR_ENEMY_SPECIAL),
	};
}

/**
 * Read enemy's 4 move slots from RAM with move name/type/power lookup.
 * Move IDs at 0xCFED-0xCFF0, PP at 0xCFFE-0xD001.
 * Skips slots where move ID = 0 (empty).
 */
export function extractEnemyMoves(ram: ReadonlyArray<number>): Array<MoveData> {
	return decodeMoves(ram, ADDR_ENEMY_MOVES, ADDR_ENEMY_PP);
}

/**
 * Detect whether the current opponent is a trainer or wild Pokemon.
 * wCurOpponent >= 200 = trainer battle, < 200 = wild encounter.
 */
export function isTrainerBattle(ram: ReadonlyArray<number>): boolean {
	return (ram[ADDR_CUR_OPPONENT] ?? 0) >= 200;
}

/**
 * Read the trainer class ID (0 if wild encounter).
 */
export function readTrainerClass(ram: ReadonlyArray<number>): number {
	return ram[ADDR_TRAINER_CLASS] ?? 0;
}

/**
 * Read the number of Pokemon in the enemy trainer's party.
 */
export function readEnemyPartyCount(ram: ReadonlyArray<number>): number {
	return ram[ADDR_ENEMY_PARTY_COUNT] ?? 0;
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
		const moveInfo = MOVE_TABLE.get(moveId);
		if (moveInfo) {
			moves.push({
				name: moveInfo.name,
				pokemonType: moveInfo.pokemonType,
				power: moveInfo.power,
				accuracy: moveInfo.accuracy,
				pp,
				maxPp: moveInfo.basePp,
				category: moveInfo.category,
			});
		} else {
			moves.push({
				name: `Move#${moveId}`,
				pokemonType: PokemonType.Normal,
				power: 0,
				accuracy: 100,
				pp,
				maxPp: pp,
				category: 'physical',
			});
		}
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
	const level = ram[ADDR_PLAYER_LEVEL] || 1; // || instead of ?? to treat 0 as "unknown, default to 1"

	// Real battle stats from RAM (Gen 1 Special maps to both specialAttack and specialDefense)
	const stats = extractPlayerBattleStats(ram);

	return {
		species: decodeSpecies(ram[ADDR_PLAYER_SPECIES] ?? 0),
		level,
		hp,
		maxHp: maxHp > 0 ? maxHp : 1,
		attack: stats.attack || 1,
		defense: stats.defense || 1,
		specialAttack: stats.special || 1,
		specialDefense: stats.special || 1,
		speed: stats.speed || 1,
		status: condition,
		types: decodeTypes(ram[ADDR_PLAYER_TYPE1] ?? 0, ram[ADDR_PLAYER_TYPE2] ?? 0),
		moves: decodeMoves(ram, ADDR_PLAYER_MOVES, ADDR_PLAYER_PP),
	};
}

export function readParty(ram: ReadonlyArray<number>): Array<PokemonState> {
	const count = Math.min(ram[ADDR_PARTY_COUNT] ?? 0, 6);
	if (count === 0) return [];

	const party: Array<PokemonState> = [];
	for (let i = 0; i < count; i++) {
		const base = ADDR_PARTY_MONS + i * PARTY_MON_SIZE;
		const speciesCode = ram[base] ?? 0;
		if (speciesCode === 0 || speciesCode === 0xff) continue;

		const hp = readWord(ram, base + 0x01);
		const maxHp = readWord(ram, base + 0x22);
		const level = ram[base + 0x21] ?? 1;
		const { condition } = decodeStatus(ram[base + 0x04] ?? 0);
		const estimatedStat = Math.max(1, Math.floor(level * 1.5 + 20));

		party.push({
			species: decodeSpecies(speciesCode),
			level,
			hp,
			maxHp: maxHp > 0 ? maxHp : 1,
			attack: estimatedStat,
			defense: estimatedStat,
			specialAttack: estimatedStat,
			specialDefense: estimatedStat,
			speed: estimatedStat,
			status: condition,
			types: decodeTypes(ram[base + 0x05] ?? 0, ram[base + 0x06] ?? 0),
			moves: decodeMoves(ram, base + 0x08, base + 0x1d),
		});
	}
	return party;
}

export function extractOpponentPokemon(ram: ReadonlyArray<number>): OpponentState {
	const enemyHp = readWord(ram, ADDR_ENEMY_HP_HIGH);
	const enemyMaxHp = readWord(ram, ADDR_ENEMY_MAX_HP_HIGH);
	const rawPercent = enemyMaxHp > 0 ? (enemyHp / enemyMaxHp) * 100 : 0;
	const hpPercent = Math.min(Math.max(rawPercent, 0), 100);
	const { condition } = decodeStatus(ram[ADDR_ENEMY_STATUS] ?? 0);
	const stats = extractEnemyBattleStats(ram);

	return {
		species: decodeSpecies(ram[ADDR_ENEMY_SPECIES] ?? 0),
		hp: Math.min(enemyHp, enemyMaxHp > 0 ? enemyMaxHp : enemyHp),
		maxHp: enemyMaxHp > 0 ? enemyMaxHp : 1,
		hpPercent: Math.round(hpPercent * 10) / 10,
		status: condition,
		types: decodeTypes(ram[ADDR_ENEMY_TYPE1] ?? 0, ram[ADDR_ENEMY_TYPE2] ?? 0),
		level: ram[ADDR_ENEMY_LEVEL] || 1, // || instead of ?? to treat 0 as "unknown, default to 1"
		attack: stats.attack || 1,
		defense: stats.defense || 1,
		specialAttack: stats.special || 1,
		specialDefense: stats.special || 1,
		speed: stats.speed || 1,
		moves: extractEnemyMoves(ram),
	};
}

export function buildAvailableActions(player: PokemonState): Array<GameAction> {
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
	return actions as unknown as Array<GameAction>;
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
		playerParty: readParty(ram),
		opponent,
		availableActions: buildAvailableActions(playerActive),
		weather: '',
		turnHistory: [],
		lastAction: null,
		createdAt: now,
		updatedAt: now,
	};
}

// ─── HM Detection (Section 22) ───────────────────────────────────────────────
export const ADDR_H_TILESET_TYPE = 0xffd7; // hTilesetType: 2 = outside (needed for Fly)
export const ADDR_MAP_PAL_OFFSET = 0xd35d; // wMapPalOffset: 6 = dark cave (needed for Flash)

// HM move IDs (from pret/pokered)
const HM_MOVE_CUT = 15;
const HM_MOVE_FLY = 19;
const HM_MOVE_SURF = 57;
const HM_MOVE_STRENGTH = 70;
const HM_MOVE_FLASH = 148;

// Badge bit positions in wObtainedBadges (0xD356)
const BADGE_BIT_BOULDER = 0; // required for Flash
const BADGE_BIT_CASCADE = 1; // required for Cut
const BADGE_BIT_THUNDER = 2; // required for Fly
const BADGE_BIT_RAINBOW = 3; // required for Strength
const BADGE_BIT_SOUL = 4; // required for Surf

// Environment constants for HM context checks
const TILESET_OUTSIDE = 2;
const MAP_PAL_DARK_CAVE = 6;
const TILE_WATER = 0x14;

// ─── Game Progress (Section 20) ──────────────────────────────────────────────
export const ADDR_PLAY_TIME_HOURS_HIGH = 0xda41; // wPlayTimeHours (high byte)
export const ADDR_PLAY_TIME_HOURS_LOW = 0xda42; // wPlayTimeHoursLow (combine with high for >255h)
export const ADDR_PLAY_TIME_MINUTES = 0xda43; // wPlayTimeMinutes (0-59)
export const ADDR_PLAY_TIME_SECONDS = 0xda44; // wPlayTimeSeconds (0-59)
export const ADDR_PLAY_TIME_FRAMES = 0xda45; // wPlayTimeFrames (0-59)

// ─── Pokedex Data (Section 20) ───────────────────────────────────────────────
export const ADDR_POKEDEX_OWNED_START = 0xd2f7; // wPokedexOwned: 19 bytes bitfield (151 Pokemon)
export const ADDR_POKEDEX_SEEN_START = 0xd30a; // wPokedexSeen: 19 bytes bitfield (151 Pokemon)
export const POKEDEX_BYTES = 19; // 19 bytes per bitfield (152 bits, only 151 used)

// ─── Wild Encounters (Section 16) ────────────────────────────────────────────
export const ADDR_GRASS_RATE = 0xd887; // wGrassRate: wild encounter rate (0-255, 0 = none)
export const ADDR_GRASS_MONS_START = 0xd888; // wGrassMons: 10 [level, species] pairs (20 bytes)
export const GRASS_MON_SLOTS = 10;

// ─── Joypad State (Section 8) ────────────────────────────────────────────────
export const ADDR_JOY_PRESSED = 0xffb3; // hJoyPressed: new button presses this frame
export const ADDR_JOY_HELD = 0xffb4; // hJoyHeld: currently held buttons

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

// Warp data
export const OVERWORLD_NUM_WARPS = 0xd3ae; // wNumberOfWarps
export const OVERWORLD_WARP_ENTRIES = 0xd3af; // wWarpEntries: 4 bytes each (y, x, warpToIndex, destMapId)
export const OVERWORLD_WARP_ENTRY_SIZE = 4;
export const OVERWORLD_MAX_WARPS = 12; // max warps to read per map

// Game state detection
export const OVERWORLD_JOY_IGNORE = 0xcd6b; // wJoyIgnore: nonzero = input ignored (dialogue/cutscene)
export const OVERWORLD_CURRENT_MENU = 0xcc26; // wCurrentMenuItem
export const OVERWORLD_TEXT_DELAY_FLAGS = 0xd358; // wLetterPrintingDelayFlags

// Menu detection
export const OVERWORLD_TEXT_BOX_ID = 0xd125; // wTextBoxID: identifies active text box / menu type
export const OVERWORLD_TOP_MENU_ITEM_Y = 0xcc24; // wTopMenuItemY
export const OVERWORLD_TOP_MENU_ITEM_X = 0xcc25; // wTopMenuItemX
export const OVERWORLD_MAX_MENU_ITEM = 0xcc2b; // wMaxMenuItem

// Screen tilemap for reading on-screen text
export const SCREEN_TILEMAP_START = 0xc3a0; // wTileMap: 20x18 grid of tile indices
export const SCREEN_TILEMAP_WIDTH = 20;
export const SCREEN_TILEMAP_HEIGHT = 18;
// Dialogue text box: rows 13-16 (four text lines inside the box border at rows 12/17)
export const SCREEN_TEXT_ROW_START = 13;
export const SCREEN_TEXT_ROW_COUNT = 4;

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
	[0xe1, 'PK'],
	[0xe2, 'MN'],
	[0xe3, '-'],
	[0xe4, '?'],
	[0xe5, '!'],
	[0xe6, '.'],
	[0xba, 'e'], // é used in POKéMON (renders as plain 'e')
	[0xf0, ':'],
	[0xf1, ';'],
	[0xf2, '['],
	[0xf3, ']'],
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

// ─── BCD / Status / Player Info / Full Party ─────────────────────────────────

/**
 * Decode BCD (Binary Coded Decimal) bytes to a number.
 * Each byte encodes two decimal digits. Used for money (3 bytes = 6 digits).
 * Example: [0x01, 0x23, 0x45] -> 12345
 */
export function decodeBCD(bytes: ReadonlyArray<number>): number {
	let result = 0;
	for (const byte of bytes) {
		result = result * 100 + (((byte >> 4) & 0x0f) * 10 + (byte & 0x0f));
	}
	return result;
}

/**
 * Decode a status condition byte to a human-readable string.
 * 0x00 = healthy, bits 0-2 = sleep turns, bit3 = frozen, bit4 = burned,
 * bit5 = paralyzed, bit6 = poisoned.
 */
export function decodeStatusCondition(statusByte: number): string {
	const { condition } = decodeStatus(statusByte);
	switch (condition) {
		case StatusCondition.Burn:
			return 'burned';
		case StatusCondition.Freeze:
			return 'frozen';
		case StatusCondition.Paralysis:
			return 'paralyzed';
		case StatusCondition.Poison:
			return 'poisoned';
		case StatusCondition.Sleep:
			return 'asleep';
		default:
			return 'healthy';
	}
}

/**
 * Read enriched player info: name, money, badges with names, location, direction.
 * Uses wPlayerDirection (0xD52A) for facing direction.
 */
export function readPlayerInfo(ram: ReadonlyArray<number>): FullPlayerInfo {
	const mapId = ram[OVERWORLD_CUR_MAP] ?? 0;
	const badgeByte = ram[OVERWORLD_BADGES] ?? 0;
	const dirByte = ram[ADDR_PLAYER_DIRECTION] ?? 0;

	return {
		name: readPlayerName(ram),
		money: readMoney(ram),
		badges: readBadges(ram),
		badgeList: decodeBadgeNames(badgeByte),
		location: {
			mapId,
			mapName: decodeMapName(mapId),
			x: ram[OVERWORLD_X_COORD] ?? 0,
			y: ram[OVERWORLD_Y_COORD] ?? 0,
		},
		direction: decodeDirection(dirByte),
	};
}

/**
 * Read party move data for a single move slot.
 */
function readPartyMove(ram: ReadonlyArray<number>, base: number, index: number): PartyPokemonMove | null {
	const moveId = ram[base + 0x08 + index] ?? 0;
	if (moveId === 0) return null;
	const pp = ram[base + 0x1d + index] ?? 0;
	const moveInfo = MOVE_TABLE.get(moveId);
	return {
		name: moveInfo?.name ?? `Move#${moveId}`,
		moveId,
		pp,
		maxPp: moveInfo?.basePp ?? pp,
		type: moveInfo?.pokemonType ?? PokemonType.Normal,
		power: moveInfo?.power ?? 0,
	};
}

/**
 * Read all 4 move slots for a party Pokemon, with Struggle fallback.
 */
function readPartyMoves(ram: ReadonlyArray<number>, base: number): Array<PartyPokemonMove> {
	const moves: Array<PartyPokemonMove> = [];
	for (let j = 0; j < 4; j++) {
		const move = readPartyMove(ram, base, j);
		if (!move) break;
		moves.push(move);
	}
	if (moves.length === 0) {
		moves.push({ name: 'Struggle', moveId: 0, pp: 1, maxPp: 1, type: PokemonType.Normal, power: 50 });
	}
	return moves;
}

/**
 * Read a single party Pokemon's data from a struct base address and slot index.
 */
function readSinglePartyPokemon(ram: ReadonlyArray<number>, base: number, slotIndex: number): PartyPokemon | null {
	const speciesCode = ram[base] ?? 0;
	if (speciesCode === 0 || speciesCode === 0xff) return null;

	const special = readWord(ram, base + 0x2a);
	const nicknameAddr = ADDR_PARTY_NICKNAMES + slotIndex * PARTY_NICKNAME_SIZE;
	const nickname = decodePokemonText(ram, nicknameAddr, PARTY_NICKNAME_SIZE);
	const maxHp = readWord(ram, base + 0x22);

	return {
		species: decodeSpecies(speciesCode),
		speciesId: speciesCode,
		nickname: nickname.length > 0 ? nickname : decodeSpecies(speciesCode),
		level: ram[base + 0x21] || 1,
		hp: readWord(ram, base + 0x01),
		maxHp: maxHp > 0 ? maxHp : 1,
		status: decodeStatusCondition(ram[base + 0x04] ?? 0),
		moves: readPartyMoves(ram, base),
		stats: {
			attack: readWord(ram, base + 0x24) || 1,
			defense: readWord(ram, base + 0x26) || 1,
			speed: readWord(ram, base + 0x28) || 1,
			specialAttack: special || 1,
			specialDefense: special || 1,
		},
	};
}

/**
 * Read full party Pokemon data from RAM including actual stats, nicknames,
 * and move details. Unlike readParty(), uses real stat values from RAM
 * instead of estimated stats.
 */
export function readFullParty(ram: ReadonlyArray<number>): Array<PartyPokemon> {
	const count = Math.min(ram[ADDR_PARTY_COUNT] ?? 0, 6);
	if (count === 0) return [];

	const party: Array<PartyPokemon> = [];
	for (let i = 0; i < count; i++) {
		const base = ADDR_PARTY_MONS + i * PARTY_MON_SIZE;
		const pokemon = readSinglePartyPokemon(ram, base, i);
		if (pokemon) party.push(pokemon);
	}
	return party;
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

export function readWarps(ram: ReadonlyArray<number>): Array<WarpInfo> {
	const numWarps = Math.min(ram[OVERWORLD_NUM_WARPS] ?? 0, OVERWORLD_MAX_WARPS);
	const warps: Array<WarpInfo> = [];
	for (let i = 0; i < numWarps; i++) {
		const offset = OVERWORLD_WARP_ENTRIES + i * OVERWORLD_WARP_ENTRY_SIZE;
		const y = ram[offset] ?? 0;
		const x = ram[offset + 1] ?? 0;
		const destMapId = ram[offset + 3] ?? 0;
		warps.push({
			x,
			y,
			destinationMapId: destMapId,
			destinationMap: decodeMapName(destMapId),
		});
	}
	return warps;
}

// ─── Movement & Collision Helper Functions ───────────────────────────────────

export type MovementMode = 'walking' | 'biking' | 'surfing';

export function readMovementMode(ram: ReadonlyArray<number>): MovementMode {
	const value = ram[ADDR_WALK_BIKE_SURF_STATE] ?? 0;
	switch (value) {
		case 1:
			return 'biking';
		case 2:
			return 'surfing';
		default:
			return 'walking';
	}
}

export function describeTileInFront(ram: ReadonlyArray<number>): { tileId: number; description: string } {
	const tileId = ram[ADDR_TILE_IN_FRONT_OF_PLAYER] ?? 0;
	const grassTile = ram[ADDR_GRASS_TILE] ?? 0;

	let description: string;
	if (tileId === grassTile && grassTile !== 0) {
		description = 'grass';
	} else if (tileId === 0x00) {
		description = 'floor';
	} else if (tileId >= 0x01 && tileId <= 0x07) {
		description = 'wall';
	} else if (tileId === 0x14) {
		description = 'water';
	} else if (tileId === 0x15) {
		description = 'ledge';
	} else if (tileId === 0x3d) {
		description = 'door';
	} else if (tileId === 0x61) {
		description = 'tree';
	} else {
		description = `tile 0x${tileId.toString(16).padStart(2, '0')}`;
	}

	return { tileId, description };
}

// Pokemon Red tilemap: cursor arrow tile
const TILE_CURSOR_ARROW = 0xed; // ▶ selector arrow
// Box border tiles (indicate a menu/text box is drawn on screen)
const TILE_BOX_TOP_LEFT = 0x79;
const TILE_BOX_TOP_RIGHT = 0x7b;
const TILE_BOX_BOTTOM_LEFT = 0x7e;
const TILE_BOX_VERT_LEFT = 0x7c;

/**
 * Read a row of text from the tilemap, decoding Pokemon text encoding.
 * Unmapped tiles become spaces to preserve the visual layout from the screen.
 */
function readTilemapRow(ram: ReadonlyArray<number>, row: number, colStart: number, colEnd: number): string {
	let line = '';
	for (let col = colStart; col < colEnd; col++) {
		const addr = SCREEN_TILEMAP_START + row * SCREEN_TILEMAP_WIDTH + col;
		const tileId = ram[addr] ?? 0;
		if (tileId === TILE_CURSOR_ARROW) {
			line += '>';
		} else {
			const char = POKEMON_TEXT_MAP.get(tileId);
			line += char ?? ' ';
		}
	}
	return line.trim();
}

/**
 * Read on-screen dialogue text from the bottom of the screen.
 * Dialogue boxes use rows 12-17 (border on 12/17, text on 13-16).
 */
export function readScreenText(ram: ReadonlyArray<number>): string | null {
	// Check if there's a text box border at the bottom of the screen
	const bottomLeftCorner = ram[SCREEN_TILEMAP_START + 12 * SCREEN_TILEMAP_WIDTH] ?? 0;
	if (bottomLeftCorner !== TILE_BOX_TOP_LEFT && bottomLeftCorner !== TILE_BOX_VERT_LEFT) {
		return null; // No dialogue box on screen
	}

	const lines: Array<string> = [];
	// Read all 4 text rows inside the dialogue box (rows 13-16, border on rows 12/17)
	for (let row = 13; row <= 16; row++) {
		const text = readTilemapRow(ram, row, 1, SCREEN_TILEMAP_WIDTH - 1);
		if (text.length > 0) {
			lines.push(text);
		}
	}

	return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Detect menus by scanning the tilemap for box borders with a cursor arrow (>).
 * Returns the raw screen text inside the menu box, same format as dialogue.
 * The cursor arrow appears as ">" so the agent sees exactly what's on screen.
 * Skips dialogue boxes (no cursor) to avoid duplicating dialogueText.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: full-screen tilemap scan for menu box detection
export function readMenuState(ram: ReadonlyArray<number>): string | null {
	for (let row = 0; row < SCREEN_TILEMAP_HEIGHT - 2; row++) {
		for (let col = 0; col < SCREEN_TILEMAP_WIDTH; col++) {
			const addr = SCREEN_TILEMAP_START + row * SCREEN_TILEMAP_WIDTH + col;
			if ((ram[addr] ?? 0) !== TILE_BOX_TOP_LEFT) continue;

			// Find right edge of this box
			let rightCol = SCREEN_TILEMAP_WIDTH;
			for (let c = col + 1; c < SCREEN_TILEMAP_WIDTH; c++) {
				if ((ram[SCREEN_TILEMAP_START + row * SCREEN_TILEMAP_WIDTH + c] ?? 0) === TILE_BOX_TOP_RIGHT) {
					rightCol = c;
					break;
				}
			}

			// Read all text rows inside the box until bottom border
			const lines: Array<string> = [];
			let hasCursor = false;
			for (let r = row + 1; r < SCREEN_TILEMAP_HEIGHT; r++) {
				const leftTile = ram[SCREEN_TILEMAP_START + r * SCREEN_TILEMAP_WIDTH + col] ?? 0;
				if (leftTile === TILE_BOX_BOTTOM_LEFT) break;
				const line = readTilemapRow(ram, r, col + 1, rightCol);
				if (line.includes('>')) hasCursor = true;
				if (line.length > 0) lines.push(line);
			}

			// Only return boxes that have a cursor (interactive menus, not info boxes)
			if (hasCursor && lines.length > 0) {
				return lines.join('\n');
			}
		}
	}

	return null;
}

export function detectGamePhase(ram: ReadonlyArray<number>): GamePhase {
	// Check battle first (most specific)
	const battleType = ram[ADDR_BATTLE_TYPE] ?? 0;
	if (battleType !== 0) {
		return GamePhase.Battle;
	}

	// Check for interactive menu (tilemap cursor arrow scan)
	if (readMenuState(ram) !== null) {
		return GamePhase.Menu;
	}

	// wJoyIgnore (0xcd6b): non-zero when input is blocked (dialogue, cutscene, text printing)
	// wTextBoxID (0xd125): non-zero when a text box or info box is active
	const joyIgnore = ram[OVERWORLD_JOY_IGNORE] ?? 0;
	const textBoxId = ram[OVERWORLD_TEXT_BOX_ID] ?? 0;

	if (joyIgnore !== 0 || textBoxId !== 0) {
		return GamePhase.Dialogue;
	}

	return GamePhase.Overworld;
}

export function extractOverworldState(ram: ReadonlyArray<number>): OverworldState {
	const mapId = ram[OVERWORLD_CUR_MAP] ?? 0;
	const playerX = ram[OVERWORLD_X_COORD] ?? 0;
	const playerY = ram[OVERWORLD_Y_COORD] ?? 0;
	const mapHeight = ram[OVERWORLD_MAP_HEIGHT] ?? 0;
	const mapWidth = ram[OVERWORLD_MAP_WIDTH] ?? 0;

	const location: MapLocation = {
		mapId,
		mapName: decodeMapName(mapId),
		x: playerX,
		y: playerY,
		width: mapWidth,
		height: mapHeight,
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
		warps: readWarps(ram),
		player: {
			name: readPlayerName(ram),
			money: readMoney(ram),
			badges: readBadges(ram),
			inventory: readInventory(ram),
			party: readParty(ram),
		},
		menuOpen: readMenuState(ram),
		dialogueText: readScreenText(ram),
		secondsRemaining: 0,
	};
}

// ─── HM Availability ─────────────────────────────────────────────────────────

export type HmAvailability = {
	cut: boolean;
	fly: boolean;
	surf: boolean;
	strength: boolean;
	flash: boolean;
};

/**
 * Check if any party Pokemon knows a specific move by raw move ID.
 */
function partyKnowsMove(ram: ReadonlyArray<number>, moveId: number): boolean {
	const count = Math.min(ram[ADDR_PARTY_COUNT] ?? 0, 6);
	for (let i = 0; i < count; i++) {
		const base = ADDR_PARTY_MONS + i * PARTY_MON_SIZE;
		for (let m = 0; m < 4; m++) {
			if ((ram[base + 0x08 + m] ?? 0) === moveId) return true;
		}
	}
	return false;
}

/**
 * Check HM usability: each HM requires the right badge, a party Pokemon
 * knowing the move, and (for some HMs) the right environment context.
 *
 * - Cut: CascadeBadge (bit 1) + party knows Cut (move 15)
 * - Fly: ThunderBadge (bit 2) + party knows Fly (move 19) + outside tileset
 * - Surf: SoulBadge (bit 4) + party knows Surf (move 57) + facing water tile
 * - Strength: RainbowBadge (bit 3) + party knows Strength (move 70)
 * - Flash: BoulderBadge (bit 0) + party knows Flash (move 148) + dark cave
 */
export function readHmAvailability(ram: ReadonlyArray<number>): HmAvailability {
	const badges = ram[OVERWORLD_BADGES] ?? 0;
	const tilesetType = ram[ADDR_H_TILESET_TYPE] ?? 0;
	const mapPalOffset = ram[ADDR_MAP_PAL_OFFSET] ?? 0;
	const tileInFront = ram[ADDR_TILE_IN_FRONT_OF_PLAYER] ?? 0;

	return {
		cut: Boolean(badges & (1 << BADGE_BIT_CASCADE)) && partyKnowsMove(ram, HM_MOVE_CUT),
		fly:
			Boolean(badges & (1 << BADGE_BIT_THUNDER)) && partyKnowsMove(ram, HM_MOVE_FLY) && tilesetType === TILESET_OUTSIDE,
		surf: Boolean(badges & (1 << BADGE_BIT_SOUL)) && partyKnowsMove(ram, HM_MOVE_SURF) && tileInFront === TILE_WATER,
		strength: Boolean(badges & (1 << BADGE_BIT_RAINBOW)) && partyKnowsMove(ram, HM_MOVE_STRENGTH),
		flash:
			Boolean(badges & (1 << BADGE_BIT_BOULDER)) &&
			partyKnowsMove(ram, HM_MOVE_FLASH) &&
			mapPalOffset === MAP_PAL_DARK_CAVE,
	};
}

// ─── Game Progress & Pokedex ─────────────────────────────────────────────────

export type GameProgress = {
	playTimeHours: number;
	playTimeMinutes: number;
	playTimeSeconds: number;
	pokedexOwned: number;
	pokedexSeen: number;
};

/**
 * Count set bits across a contiguous byte range (used for Pokedex bitfields).
 */
function countSetBits(ram: ReadonlyArray<number>, startAddr: number, byteCount: number): number {
	let count = 0;
	for (let i = 0; i < byteCount; i++) {
		let byte = ram[startAddr + i] ?? 0;
		while (byte) {
			count += byte & 1;
			byte >>= 1;
		}
	}
	return count;
}

/**
 * Count Pokemon owned and seen from the Pokedex bitfields.
 * Each bitfield is 19 bytes (151 Pokemon, 8 bits per byte). Maximum 151 each.
 */
export function readPokedexCounts(ram: ReadonlyArray<number>): { owned: number; seen: number } {
	return {
		owned: countSetBits(ram, ADDR_POKEDEX_OWNED_START, POKEDEX_BYTES),
		seen: countSetBits(ram, ADDR_POKEDEX_SEEN_START, POKEDEX_BYTES),
	};
}

/**
 * Read game progress: play time and Pokedex counts.
 * Hours combine high byte (0xDA41) and low byte (0xDA42) for values >255.
 */
export function readGameProgress(ram: ReadonlyArray<number>): GameProgress {
	const hoursHigh = ram[ADDR_PLAY_TIME_HOURS_HIGH] ?? 0;
	const hoursLow = ram[ADDR_PLAY_TIME_HOURS_LOW] ?? 0;
	const { owned, seen } = readPokedexCounts(ram);

	return {
		playTimeHours: (hoursHigh << 8) | hoursLow,
		playTimeMinutes: ram[ADDR_PLAY_TIME_MINUTES] ?? 0,
		playTimeSeconds: ram[ADDR_PLAY_TIME_SECONDS] ?? 0,
		pokedexOwned: owned,
		pokedexSeen: seen,
	};
}

// ─── Wild Encounters ─────────────────────────────────────────────────────────

/**
 * Read the wild encounter rate for the current map.
 * Returns 0 if no wild encounters on this map, 1-255 otherwise.
 */
export function readWildEncounterRate(ram: ReadonlyArray<number>): number {
	return ram[ADDR_GRASS_RATE] ?? 0;
}
