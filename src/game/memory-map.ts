import {
	type BattleAction,
	BattlePhase,
	type BattleState,
	type MoveData,
	type OpponentState,
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
