import { describe, expect, it } from 'vitest';

import { VoteRequestSchema } from '../types/api.js';
import { GetGameStateOutput, SubmitActionInput } from '../types/mcp.js';
import { type AgentScore, type TickInfo, transformGameState } from './game-state-service.js';
import {
	ADDR_BATTLE_TURN_COUNT,
	ADDR_BATTLE_TYPE,
	ADDR_ENEMY_ATTACK,
	ADDR_ENEMY_ATTACK_MOD,
	ADDR_ENEMY_DEFENSE,
	ADDR_ENEMY_HP_HIGH,
	ADDR_ENEMY_LEVEL,
	ADDR_ENEMY_MAX_HP_HIGH,
	ADDR_ENEMY_PARTY_COUNT,
	ADDR_ENEMY_SPECIAL,
	ADDR_ENEMY_SPECIES,
	ADDR_ENEMY_SPEED,
	ADDR_ENEMY_STATUS,
	ADDR_ENEMY_TYPE1,
	ADDR_ENEMY_TYPE2,
	ADDR_GRASS_RATE,
	ADDR_PARTY_COUNT,
	ADDR_PARTY_MONS,
	ADDR_PARTY_NICKNAMES,
	ADDR_PARTY_SPECIES_LIST,
	ADDR_PLAYER_ATTACK,
	ADDR_PLAYER_ATTACK_MOD,
	ADDR_PLAYER_DEFENSE,
	ADDR_PLAYER_HP_HIGH,
	ADDR_PLAYER_LEVEL,
	ADDR_PLAYER_MAX_HP_HIGH,
	ADDR_PLAYER_MOVES,
	ADDR_PLAYER_PP,
	ADDR_PLAYER_SPECIAL,
	ADDR_PLAYER_SPECIES,
	ADDR_PLAYER_SPEED,
	ADDR_PLAYER_STATUS,
	ADDR_PLAYER_TYPE1,
	ADDR_PLAYER_TYPE2,
	ADDR_PLAY_TIME_HOURS_HIGH,
	ADDR_PLAY_TIME_HOURS_LOW,
	ADDR_PLAY_TIME_MINUTES,
	ADDR_PLAY_TIME_SECONDS,
	ADDR_POKEDEX_OWNED_START,
	ADDR_POKEDEX_SEEN_START,
	ADDR_TILE_IN_FRONT_OF_PLAYER,
	ADDR_TRAINER_CLASS,
	ADDR_WALK_BIKE_SURF_STATE,
	OVERWORLD_BADGES,
	OVERWORLD_BAG_ITEMS,
	OVERWORLD_CUR_MAP,
	OVERWORLD_MAP_HEIGHT,
	OVERWORLD_MAP_WIDTH,
	OVERWORLD_NUM_BAG_ITEMS,
	OVERWORLD_PLAYER_MONEY,
	OVERWORLD_PLAYER_NAME_ADDR,
	OVERWORLD_X_COORD,
	OVERWORLD_Y_COORD,
	extractUnifiedGameState,
} from './memory-map.js';
import { gameActionSchema } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const RAM_SIZE = 0x10000; // 64KB Game Boy address space

/**
 * Create a zeroed RAM array and set specific addresses.
 * Zeros are safe defaults for most addresses (no battle, no text, etc.)
 */
function makeRam(writes: Array<[number, number]>): Array<number> {
	const ram = new Array<number>(RAM_SIZE).fill(0);
	for (const [addr, value] of writes) {
		ram[addr] = value;
	}
	return ram;
}

/**
 * Write a big-endian 16-bit word to RAM.
 */
function writeWord(ram: Array<number>, addr: number, value: number): void {
	ram[addr] = (value >> 8) & 0xff;
	ram[addr + 1] = value & 0xff;
}

/**
 * Encode a string as Pokemon text encoding and write it to RAM.
 * A=0x80, B=0x81, ..., Z=0x99, terminated by 0x50.
 */
function writePokemonText(ram: Array<number>, addr: number, text: string): void {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code >= 65 && code <= 90) {
			// A-Z
			ram[addr + i] = 0x80 + (code - 65);
		} else if (code === 32) {
			// space
			ram[addr + i] = 0x7f;
		}
	}
	ram[addr + text.length] = 0x50; // terminator
}

const defaultAgentScore: AgentScore = {
	score: 100,
	rank: 1,
	totalAgents: 5,
	streak: 3,
};

const defaultTickInfo: TickInfo = {
	secondsRemaining: 12,
};

// ─── Overworld Pipeline: RAM -> extractUnifiedGameState -> transformGameState -> schema ──

describe('E2E Pipeline: Overworld', () => {
	function makeOverworldRam(): Array<number> {
		const ram = makeRam([
			// No battle
			[ADDR_BATTLE_TYPE, 0],
			// Player name "RED"
			// Map: Pallet Town (map ID 0)
			[OVERWORLD_CUR_MAP, 0],
			[OVERWORLD_X_COORD, 5],
			[OVERWORLD_Y_COORD, 10],
			[OVERWORLD_MAP_HEIGHT, 18],
			[OVERWORLD_MAP_WIDTH, 20],
			// Walking
			[ADDR_WALK_BIKE_SURF_STATE, 0],
			// 2 badges (Boulder + Cascade = bits 0,1)
			[OVERWORLD_BADGES, 0x03],
			// Money: 5000 = BCD 05 00 00
			[OVERWORLD_PLAYER_MONEY, 0x05],
			[OVERWORLD_PLAYER_MONEY + 1, 0x00],
			[OVERWORLD_PLAYER_MONEY + 2, 0x00],
			// 1 bag item: Potion (item 0x14 = Potion), qty 3
			[OVERWORLD_NUM_BAG_ITEMS, 1],
			[OVERWORLD_BAG_ITEMS, 0x14],
			[OVERWORLD_BAG_ITEMS + 1, 3],
			[OVERWORLD_BAG_ITEMS + 2, 0xff], // terminator
			// 1 party member (Pikachu = species code 0x54)
			[ADDR_PARTY_COUNT, 1],
			[ADDR_PARTY_SPECIES_LIST, 0x54],
			// Tile in front
			[ADDR_TILE_IN_FRONT_OF_PLAYER, 0x0c],
			// Grass encounter rate
			[ADDR_GRASS_RATE, 25],
			// Play time: 10h 30m 45s
			[ADDR_PLAY_TIME_HOURS_HIGH, 0],
			[ADDR_PLAY_TIME_HOURS_LOW, 10],
			[ADDR_PLAY_TIME_MINUTES, 30],
			[ADDR_PLAY_TIME_SECONDS, 45],
		]);

		// Player name "RED"
		writePokemonText(ram, OVERWORLD_PLAYER_NAME_ADDR, 'RED');

		// Set up party Pokemon struct for Pikachu (at ADDR_PARTY_MONS)
		const base = ADDR_PARTY_MONS;
		ram[base] = 0x54; // species code for Pikachu
		writeWord(ram, base + 0x01, 80); // current HP = 80
		ram[base + 0x04] = 0; // status: healthy
		ram[base + 0x08] = 85; // move 1: Thunderbolt (move ID 85)
		ram[base + 0x09] = 98; // move 2: Quick Attack (move ID 98)
		ram[base + 0x1d] = 15; // move 1 PP
		ram[base + 0x1e] = 30; // move 2 PP
		ram[base + 0x21] = 30; // level
		writeWord(ram, base + 0x22, 100); // max HP = 100
		writeWord(ram, base + 0x24, 55); // attack
		writeWord(ram, base + 0x26, 40); // defense
		writeWord(ram, base + 0x28, 90); // speed
		writeWord(ram, base + 0x2a, 50); // special (used for both sp.atk and sp.def in Gen 1)

		// Nickname: "SPARKY"
		writePokemonText(ram, ADDR_PARTY_NICKNAMES, 'SPARKY');

		// Pokedex: set a few owned/seen bits
		ram[ADDR_POKEDEX_OWNED_START] = 0x07; // 3 Pokemon owned (bits 0,1,2)
		ram[ADDR_POKEDEX_SEEN_START] = 0x1f; // 5 Pokemon seen (bits 0-4)

		return ram;
	}

	it('extracts valid UnifiedGameState from overworld RAM', () => {
		const ram = makeOverworldRam();
		const state = extractUnifiedGameState(ram, 'test-game', 7);

		expect(state.phase).toBe('overworld');
		expect(state.battle).toBeNull();
		expect(state.overworld).not.toBeNull();
		expect(state.player.name).toBe('RED');
		expect(state.player.money).toBe(50000);
		expect(state.player.badges).toBe(2);
		expect(state.player.badgeList).toContain('Boulder Badge');
		expect(state.player.badgeList).toContain('Cascade Badge');
		expect(state.party.length).toBeGreaterThan(0);
		expect(state.party[0]?.species).toBe('Pikachu');
		expect(state.party[0]?.level).toBe(30);
		expect(state.progress.playTimeHours).toBe(10);
		expect(state.progress.playTimeMinutes).toBe(30);
	});

	it('transforms overworld state into valid GetGameStateOutput', () => {
		const ram = makeOverworldRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 7);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		expect(output.phase).toBe('overworld');
		expect(output.battle).toBeNull();
		expect(output.overworld).not.toBeNull();
		expect(output.availableActions).toHaveLength(8);
		expect(output.availableActions).toContain('a');
		expect(output.availableActions).toContain('up');
		expect(output.player.name).toBe('RED');
		expect(output.party.length).toBeGreaterThan(0);
	});

	it('passes GetGameStateOutput schema validation for overworld', () => {
		const ram = makeOverworldRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 7);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(output);

		if (!parsed.success) {
			throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
		}
		expect(parsed.success).toBe(true);
	});

	it('includes overworld-specific data (tile, encounter rate)', () => {
		const ram = makeOverworldRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 7);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		expect(output.overworld?.tileInFront.tileId).toBe(0x0c);
		expect(output.overworld?.wildEncounterRate).toBe(25);
	});

	it('includes progress and gamification data', () => {
		const ram = makeOverworldRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 7);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		expect(output.progress.playTimeHours).toBe(10);
		expect(output.progress.playTimeMinutes).toBe(30);
		expect(output.progress.pokedexOwned).toBe(3);
		expect(output.progress.pokedexSeen).toBe(5);
		expect(output.yourScore).toBe(100);
		expect(output.yourRank).toBe(1);
		expect(output.streak).toBe(3);
	});
});

// ─── Battle Pipeline: RAM -> extractUnifiedGameState -> transformGameState -> schema ──

describe('E2E Pipeline: Battle', () => {
	function makeBattleRam(): Array<number> {
		const ram = makeRam([
			// Wild battle
			[ADDR_BATTLE_TYPE, 1],
			// Map context
			[OVERWORLD_CUR_MAP, 0x0d], // Route 1
			[OVERWORLD_X_COORD, 8],
			[OVERWORLD_Y_COORD, 15],
			[OVERWORLD_MAP_HEIGHT, 36],
			[OVERWORLD_MAP_WIDTH, 10],
			[ADDR_WALK_BIKE_SURF_STATE, 0],
			[OVERWORLD_BADGES, 0x07], // 3 badges
			[OVERWORLD_PLAYER_MONEY, 0x12],
			[OVERWORLD_PLAYER_MONEY + 1, 0x00],
			[OVERWORLD_PLAYER_MONEY + 2, 0x00],
			// No bag items
			[OVERWORLD_NUM_BAG_ITEMS, 0],
			[OVERWORLD_BAG_ITEMS, 0xff],
			// 1 party member
			[ADDR_PARTY_COUNT, 1],
			[ADDR_PARTY_SPECIES_LIST, 0x99], // Bulbasaur internal code
			// Battle turn count
			[ADDR_BATTLE_TURN_COUNT, 5],
			// Player battle Pokemon: Bulbasaur (0x99)
			[ADDR_PLAYER_SPECIES, 0x99],
			[ADDR_PLAYER_STATUS, 0],
			[ADDR_PLAYER_TYPE1, 0x16], // Grass
			[ADDR_PLAYER_TYPE2, 0x03], // Poison
			[ADDR_PLAYER_LEVEL, 25],
			// Player moves: Vine Whip (22), Tackle (33), Leech Seed (73)
			[ADDR_PLAYER_MOVES, 22],
			[ADDR_PLAYER_MOVES + 1, 33],
			[ADDR_PLAYER_MOVES + 2, 73],
			[ADDR_PLAYER_MOVES + 3, 0],
			[ADDR_PLAYER_PP, 25],
			[ADDR_PLAYER_PP + 1, 35],
			[ADDR_PLAYER_PP + 2, 10],
			// Enemy: Rattata (0xA5)
			[ADDR_ENEMY_SPECIES, 0xa5],
			[ADDR_ENEMY_STATUS, 0],
			[ADDR_ENEMY_TYPE1, 0x00], // Normal
			[ADDR_ENEMY_TYPE2, 0x00], // Normal
			[ADDR_ENEMY_LEVEL, 10],
			[ADDR_ENEMY_PARTY_COUNT, 1],
			[ADDR_TRAINER_CLASS, 0],
			// Stat modifiers: all neutral (7)
			[ADDR_PLAYER_ATTACK_MOD, 7],
			[ADDR_PLAYER_ATTACK_MOD + 1, 7], // defense
			[ADDR_PLAYER_ATTACK_MOD + 2, 7], // speed
			[ADDR_PLAYER_ATTACK_MOD + 3, 7], // special
			[ADDR_PLAYER_ATTACK_MOD + 4, 7], // accuracy
			[ADDR_PLAYER_ATTACK_MOD + 5, 7], // evasion
			[ADDR_ENEMY_ATTACK_MOD, 7],
			[ADDR_ENEMY_ATTACK_MOD + 1, 7],
			[ADDR_ENEMY_ATTACK_MOD + 2, 7],
			[ADDR_ENEMY_ATTACK_MOD + 3, 7],
			[ADDR_ENEMY_ATTACK_MOD + 4, 7],
			[ADDR_ENEMY_ATTACK_MOD + 5, 7],
			// Play time
			[ADDR_PLAY_TIME_HOURS_HIGH, 0],
			[ADDR_PLAY_TIME_HOURS_LOW, 5],
			[ADDR_PLAY_TIME_MINUTES, 15],
			[ADDR_PLAY_TIME_SECONDS, 0],
		]);

		// Player name
		writePokemonText(ram, OVERWORLD_PLAYER_NAME_ADDR, 'ASH');

		// Party struct for Bulbasaur
		const base = ADDR_PARTY_MONS;
		ram[base] = 0x99;
		writeWord(ram, base + 0x01, 60); // current HP
		ram[base + 0x04] = 0; // status
		ram[base + 0x08] = 22; // Vine Whip
		ram[base + 0x09] = 33; // Tackle
		ram[base + 0x0a] = 73; // Leech Seed
		ram[base + 0x1d] = 25; // PP
		ram[base + 0x1e] = 35;
		ram[base + 0x1f] = 10;
		ram[base + 0x21] = 25; // level
		writeWord(ram, base + 0x22, 80); // max HP
		writeWord(ram, base + 0x24, 49); // attack
		writeWord(ram, base + 0x26, 49); // defense
		writeWord(ram, base + 0x28, 45); // speed
		writeWord(ram, base + 0x2a, 65); // special

		// Nickname
		writePokemonText(ram, ADDR_PARTY_NICKNAMES, 'BULBA');

		// Player battle stats (big-endian 16-bit)
		writeWord(ram, ADDR_PLAYER_HP_HIGH, 60); // ADDR_PLAYER_HP_HIGH is a 2-byte addr
		writeWord(ram, ADDR_PLAYER_MAX_HP_HIGH, 80);
		writeWord(ram, ADDR_PLAYER_ATTACK, 70);
		writeWord(ram, ADDR_PLAYER_DEFENSE, 65);
		writeWord(ram, ADDR_PLAYER_SPEED, 55);
		writeWord(ram, ADDR_PLAYER_SPECIAL, 80);

		// Enemy battle stats
		writeWord(ram, ADDR_ENEMY_HP_HIGH, 25);
		writeWord(ram, ADDR_ENEMY_MAX_HP_HIGH, 30);
		writeWord(ram, ADDR_ENEMY_ATTACK, 56);
		writeWord(ram, ADDR_ENEMY_DEFENSE, 35);
		writeWord(ram, ADDR_ENEMY_SPEED, 72);
		writeWord(ram, ADDR_ENEMY_SPECIAL, 25);

		// Pokedex
		ram[ADDR_POKEDEX_OWNED_START] = 0x03;
		ram[ADDR_POKEDEX_SEEN_START] = 0x0f;

		return ram;
	}

	it('extracts valid UnifiedGameState from battle RAM', () => {
		const ram = makeBattleRam();
		const state = extractUnifiedGameState(ram, 'test-game', 15);

		expect(state.phase).toBe('battle');
		expect(state.battle).not.toBeNull();
		expect(state.overworld).toBeNull();
		expect(state.battle?.type).toBe('wild');
		expect(state.battle?.turnCount).toBe(5);
		expect(state.battle?.playerActive.species).toBe('Bulbasaur');
		expect(state.battle?.opponent.species).toBe('Rattata');
	});

	it('transforms battle state into valid GetGameStateOutput', () => {
		const ram = makeBattleRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 15);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		expect(output.phase).toBe('battle');
		expect(output.battle).not.toBeNull();
		expect(output.overworld).toBeNull();
		expect(output.battle?.type).toBe('wild');
		expect(output.battle?.turnCount).toBe(5);
		expect(output.availableActions).toHaveLength(8);
	});

	it('passes GetGameStateOutput schema validation for battle', () => {
		const ram = makeBattleRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 15);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(output);

		if (!parsed.success) {
			throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
		}
		expect(parsed.success).toBe(true);
	});

	it('has correct battle-specific fields', () => {
		const ram = makeBattleRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 15);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		// Player active Pokemon
		expect(output.battle?.playerActive.species).toBe('Bulbasaur');
		expect(output.battle?.playerActive.level).toBe(25);
		expect(output.battle?.playerActive.types).toContain('grass');

		// Opponent
		expect(output.battle?.opponent.species).toBe('Rattata');
		expect(output.battle?.opponent.level).toBe(10);

		// Stat modifiers should all be 0 (neutral)
		expect(output.battle?.statModifiers.player.attack).toBe(0);
		expect(output.battle?.statModifiers.enemy.attack).toBe(0);

		// Move effectiveness present
		expect(output.battle?.moveEffectiveness.length).toBeGreaterThan(0);
	});

	it('battle state has real stats from RAM (not estimated)', () => {
		const ram = makeBattleRam();
		const unified = extractUnifiedGameState(ram, 'test-game', 15);

		// Check that battle stats are read from the RAM addresses we set
		expect(unified.battle?.playerActive.battleStats.attack).toBe(70);
		expect(unified.battle?.playerActive.battleStats.defense).toBe(65);
		expect(unified.battle?.playerActive.battleStats.speed).toBe(55);
		expect(unified.battle?.playerActive.battleStats.special).toBe(80);
	});
});

// ─── Action Validation ──────────────────────────────────────────────────────

describe('E2E Pipeline: Action Validation', () => {
	it('gameActionSchema only accepts 8 GBC buttons', () => {
		const valid = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
		const invalid = ['move:0', 'switch:3', 'run', 'a_button', 'jump', 'move_right', ''];

		for (const action of valid) {
			expect(gameActionSchema.safeParse(action).success).toBe(true);
		}
		for (const action of invalid) {
			expect(gameActionSchema.safeParse(action).success).toBe(false);
		}
	});

	it('VoteRequestSchema accepts valid button actions', () => {
		expect(VoteRequestSchema.safeParse({ action: 'a' }).success).toBe(true);
		expect(VoteRequestSchema.safeParse({ action: 'up' }).success).toBe(true);
		expect(VoteRequestSchema.safeParse({ action: 'start', tick: 42 }).success).toBe(true);
	});

	it('VoteRequestSchema rejects old semantic actions', () => {
		expect(VoteRequestSchema.safeParse({ action: 'move:0' }).success).toBe(false);
		expect(VoteRequestSchema.safeParse({ action: 'switch:3' }).success).toBe(false);
		expect(VoteRequestSchema.safeParse({ action: 'run' }).success).toBe(false);
		expect(VoteRequestSchema.safeParse({ action: 'a_button' }).success).toBe(false);
	});

	it('SubmitActionInput schema matches gameActionSchema', () => {
		expect(SubmitActionInput.safeParse({ action: 'a' }).success).toBe(true);
		expect(SubmitActionInput.safeParse({ action: 'up' }).success).toBe(true);
		expect(SubmitActionInput.safeParse({ action: 'move:0' }).success).toBe(false);
	});
});

// ─── Unified State Response Shape ───────────────────────────────────────────

describe('E2E Pipeline: Unified State Response Shape', () => {
	it('overworld response has battle: null and overworld: populated', () => {
		const ram = makeRam([[ADDR_BATTLE_TYPE, 0]]);
		writePokemonText(ram, OVERWORLD_PLAYER_NAME_ADDR, 'RED');
		ram[ADDR_PARTY_COUNT] = 1;
		ram[ADDR_PARTY_SPECIES_LIST] = 0x54;
		const base = ADDR_PARTY_MONS;
		ram[base] = 0x54;
		writeWord(ram, base + 0x01, 50);
		ram[base + 0x21] = 10;
		writeWord(ram, base + 0x22, 50);
		writeWord(ram, base + 0x24, 30);
		writeWord(ram, base + 0x26, 20);
		writeWord(ram, base + 0x28, 40);
		writeWord(ram, base + 0x2a, 35);
		writePokemonText(ram, ADDR_PARTY_NICKNAMES, 'PIKA');

		const unified = extractUnifiedGameState(ram, 'game-1', 1);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		expect(output.phase).toBe('overworld');
		expect(output.battle).toBeNull();
		expect(output.overworld).not.toBeNull();
		expect(output.player).toBeDefined();
		expect(output.party.length).toBeGreaterThan(0);
		expect(output.inventory).toBeDefined();
		expect(output.progress).toBeDefined();
	});

	it('GetGameStateOutput always includes all 8 available actions', () => {
		const ram = makeRam([[ADDR_BATTLE_TYPE, 0]]);
		writePokemonText(ram, OVERWORLD_PLAYER_NAME_ADDR, 'RED');
		ram[ADDR_PARTY_COUNT] = 1;
		ram[ADDR_PARTY_SPECIES_LIST] = 0x54;
		const base = ADDR_PARTY_MONS;
		ram[base] = 0x54;
		writeWord(ram, base + 0x01, 50);
		ram[base + 0x21] = 10;
		writeWord(ram, base + 0x22, 50);
		writeWord(ram, base + 0x24, 30);
		writeWord(ram, base + 0x26, 20);
		writeWord(ram, base + 0x28, 40);
		writeWord(ram, base + 0x2a, 35);
		writePokemonText(ram, ADDR_PARTY_NICKNAMES, 'PIKA');

		const unified = extractUnifiedGameState(ram, 'game-1', 1);
		const output = transformGameState(unified, defaultAgentScore, defaultTickInfo);

		expect(output.availableActions).toEqual(['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']);
	});
});
