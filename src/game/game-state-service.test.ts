import { describe, expect, it } from 'vitest';
import { GetGameStateOutput } from '../types/mcp.js';
import {
	type AgentScore,
	type TickInfo,
	generateTip,
	transformGameState,
	transformStatMods,
} from './game-state-service.js';
import type { StatModifiers, UnifiedBattleState, UnifiedGameState } from './memory-map.js';
import { GamePhase, PokemonType, StatusCondition } from './types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const defaultAgentScore: AgentScore = {
	score: 42,
	rank: 3,
	totalAgents: 10,
	streak: 5,
};

const defaultTickInfo: TickInfo = {
	secondsRemaining: 12,
};

function makeOverworldState(overrides?: Partial<UnifiedGameState>): UnifiedGameState {
	return {
		gameId: 'test-game',
		turn: 7,
		phase: GamePhase.Overworld,
		player: {
			name: 'ASH',
			money: 5000,
			badges: 3,
			badgeList: ['Boulder', 'Cascade', 'Thunder'],
			location: { mapId: 1, mapName: 'Pallet Town', x: 5, y: 10 },
			direction: 'down',
			walkBikeSurf: 'walking',
		},
		party: [
			{
				species: 'Pikachu',
				speciesId: 25,
				nickname: 'PIKACHU',
				level: 30,
				hp: 80,
				maxHp: 100,
				status: 'none',
				moves: [
					{ name: 'Thunderbolt', moveId: 85, pp: 15, maxPp: 15, type: 'Electric', power: 95 },
					{ name: 'Quick Attack', moveId: 98, pp: 30, maxPp: 30, type: 'Normal', power: 40 },
				],
				stats: { attack: 55, defense: 40, speed: 90, specialAttack: 50, specialDefense: 50 },
			},
		],
		inventory: [
			{ itemId: 1, name: 'Potion', quantity: 5 },
			{ itemId: 4, name: 'Poke Ball', quantity: 10 },
		],
		battle: null,
		overworld: {
			tileInFront: { tileId: 0x0c, description: 'Grass' },
			hmAvailable: { cut: true, fly: false, surf: false, strength: false, flash: false },
			wildEncounterRate: 25,
		},
		screen: {
			textBoxActive: false,
			menuState: null,
			menuText: null,
			screenText: null,
		},
		progress: {
			playTimeHours: 10,
			playTimeMinutes: 30,
			playTimeSeconds: 45,
			pokedexOwned: 35,
			pokedexSeen: 60,
		},
		...overrides,
	};
}

function makeBattleState(overrides?: Partial<UnifiedGameState>): UnifiedGameState {
	const battle: UnifiedBattleState = {
		type: 'wild',
		turnCount: 3,
		playerActive: {
			species: 'Charizard',
			level: 50,
			hp: 120,
			maxHp: 200,
			attack: 84,
			defense: 78,
			specialAttack: 109,
			specialDefense: 109,
			speed: 100,
			status: StatusCondition.None,
			types: [PokemonType.Fire, PokemonType.Flying],
			moves: [
				{
					name: 'Flamethrower',
					pokemonType: PokemonType.Fire,
					power: 95,
					accuracy: 100,
					pp: 15,
					maxPp: 15,
					category: 'special',
				},
				{
					name: 'Fly',
					pokemonType: PokemonType.Flying,
					power: 90,
					accuracy: 95,
					pp: 15,
					maxPp: 15,
					category: 'physical',
				},
				{
					name: 'Slash',
					pokemonType: PokemonType.Normal,
					power: 70,
					accuracy: 100,
					pp: 20,
					maxPp: 20,
					category: 'physical',
				},
				{
					name: 'Earthquake',
					pokemonType: PokemonType.Ground,
					power: 100,
					accuracy: 100,
					pp: 10,
					maxPp: 10,
					category: 'physical',
				},
			],
			battleStats: { attack: 130, defense: 120, speed: 150, special: 160 },
		},
		opponent: {
			species: 'Venusaur',
			hp: 80,
			maxHp: 180,
			hpPercent: 44.4,
			status: StatusCondition.Poison,
			types: [PokemonType.Grass, PokemonType.Poison],
			level: 48,
			attack: 82,
			defense: 83,
			specialAttack: 100,
			specialDefense: 100,
			speed: 80,
			moves: [
				{
					name: 'Razor Leaf',
					pokemonType: PokemonType.Grass,
					power: 55,
					accuracy: 95,
					pp: 25,
					maxPp: 25,
					category: 'physical',
				},
			],
			battleStats: { attack: 120, defense: 125, speed: 110, special: 140 },
			knownMoves: [
				{
					name: 'Razor Leaf',
					pokemonType: PokemonType.Grass,
					power: 55,
					accuracy: 95,
					pp: 25,
					maxPp: 25,
					category: 'physical',
				},
			],
			trainerClass: 0,
			partyCount: 1,
		},
		moveEffectiveness: [
			{ moveName: 'Flamethrower', moveType: PokemonType.Fire, effectiveness: 2 },
			{ moveName: 'Fly', moveType: PokemonType.Flying, effectiveness: 2 },
			{ moveName: 'Slash', moveType: PokemonType.Normal, effectiveness: 1 },
			{ moveName: 'Earthquake', moveType: PokemonType.Ground, effectiveness: 0.5 },
		],
		statModifiers: {
			player: { attack: 7, defense: 7, speed: 7, special: 7, accuracy: 7, evasion: 7 },
			enemy: { attack: 8, defense: 6, speed: 7, special: 9, accuracy: 7, evasion: 5 },
		},
		battleStatus: {
			playerFlags: [],
			enemyFlags: ['poisoned'],
		},
		substituteHP: { player: 0, enemy: 0 },
	};

	return {
		gameId: 'test-game',
		turn: 15,
		phase: GamePhase.Battle,
		player: {
			name: 'RED',
			money: 12000,
			badges: 6,
			badgeList: ['Boulder', 'Cascade', 'Thunder', 'Rainbow', 'Soul', 'Marsh'],
			location: { mapId: 42, mapName: 'Route 21', x: 10, y: 20 },
			direction: 'up',
			walkBikeSurf: 'walking',
		},
		party: [
			{
				species: 'Charizard',
				speciesId: 6,
				nickname: 'CHARIZAR',
				level: 50,
				hp: 120,
				maxHp: 200,
				status: 'none',
				moves: [
					{ name: 'Flamethrower', moveId: 53, pp: 15, maxPp: 15, type: 'Fire', power: 95 },
					{ name: 'Fly', moveId: 19, pp: 15, maxPp: 15, type: 'Flying', power: 90 },
					{ name: 'Slash', moveId: 163, pp: 20, maxPp: 20, type: 'Normal', power: 70 },
					{ name: 'Earthquake', moveId: 89, pp: 10, maxPp: 10, type: 'Ground', power: 100 },
				],
				stats: { attack: 84, defense: 78, speed: 100, specialAttack: 109, specialDefense: 109 },
			},
		],
		inventory: [{ itemId: 1, name: 'Potion', quantity: 3 }],
		battle,
		overworld: null,
		screen: {
			textBoxActive: false,
			menuState: null,
			menuText: null,
			screenText: null,
		},
		progress: {
			playTimeHours: 25,
			playTimeMinutes: 15,
			playTimeSeconds: 30,
			pokedexOwned: 80,
			pokedexSeen: 120,
		},
		...overrides,
	};
}

// ─── transformStatMods ───────────────────────────────────────────────────────

describe('transformStatMods', () => {
	it('converts neutral value 7 to 0', () => {
		const raw: StatModifiers = { attack: 7, defense: 7, speed: 7, special: 7, accuracy: 7, evasion: 7 };
		const result = transformStatMods(raw);
		expect(result.attack).toBe(0);
		expect(result.defense).toBe(0);
		expect(result.speed).toBe(0);
		expect(result.special).toBe(0);
		expect(result.accuracy).toBe(0);
		expect(result.evasion).toBe(0);
	});

	it('converts minimum value 1 to -6', () => {
		const raw: StatModifiers = { attack: 1, defense: 1, speed: 1, special: 1, accuracy: 1, evasion: 1 };
		const result = transformStatMods(raw);
		expect(result.attack).toBe(-6);
		expect(result.defense).toBe(-6);
		expect(result.speed).toBe(-6);
		expect(result.special).toBe(-6);
		expect(result.accuracy).toBe(-6);
		expect(result.evasion).toBe(-6);
	});

	it('converts maximum value 13 to +6', () => {
		const raw: StatModifiers = { attack: 13, defense: 13, speed: 13, special: 13, accuracy: 13, evasion: 13 };
		const result = transformStatMods(raw);
		expect(result.attack).toBe(6);
		expect(result.defense).toBe(6);
		expect(result.speed).toBe(6);
		expect(result.special).toBe(6);
		expect(result.accuracy).toBe(6);
		expect(result.evasion).toBe(6);
	});

	it('converts mixed values correctly', () => {
		const raw: StatModifiers = { attack: 8, defense: 6, speed: 7, special: 9, accuracy: 7, evasion: 5 };
		const result = transformStatMods(raw);
		expect(result.attack).toBe(1);
		expect(result.defense).toBe(-1);
		expect(result.speed).toBe(0);
		expect(result.special).toBe(2);
		expect(result.accuracy).toBe(0);
		expect(result.evasion).toBe(-2);
	});
});

// ─── transformGameState - Overworld ──────────────────────────────────────────

describe('transformGameState (overworld)', () => {
	it('produces valid GetGameStateOutput for overworld phase', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(result);
		expect(parsed.success).toBe(true);
	});

	it('has battle: null and overworld: populated', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.battle).toBeNull();
		expect(result.overworld).not.toBeNull();
	});

	it('maps core fields correctly', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.turn).toBe(7);
		expect(result.phase).toBe('overworld');
		expect(result.secondsRemaining).toBe(12);
		expect(result.availableActions).toEqual(['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']);
	});

	it('maps player context correctly', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.player.name).toBe('ASH');
		expect(result.player.money).toBe(5000);
		expect(result.player.badges).toBe(3);
		expect(result.player.badgeList).toEqual(['Boulder', 'Cascade', 'Thunder']);
		expect(result.player.location.mapName).toBe('Pallet Town');
		expect(result.player.direction).toBe('down');
		expect(result.player.walkBikeSurf).toBe('walking');
	});

	it('maps party correctly', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.party).toHaveLength(1);
		expect(result.party[0]?.species).toBe('Pikachu');
		expect(result.party[0]?.level).toBe(30);
		expect(result.party[0]?.moves).toHaveLength(2);
	});

	it('maps inventory correctly', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.inventory).toHaveLength(2);
		expect(result.inventory[0]?.name).toBe('Potion');
		expect(result.inventory[0]?.quantity).toBe(5);
	});

	it('maps overworld data correctly', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.overworld?.tileInFront.description).toBe('Grass');
		expect(result.overworld?.hmAvailable.cut).toBe(true);
		expect(result.overworld?.hmAvailable.fly).toBe(false);
		expect(result.overworld?.wildEncounterRate).toBe(25);
	});

	it('maps progress correctly (no seconds in output)', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.progress.playTimeHours).toBe(10);
		expect(result.progress.playTimeMinutes).toBe(30);
		expect(result.progress.pokedexOwned).toBe(35);
		expect(result.progress.pokedexSeen).toBe(60);
	});

	it('maps gamification fields from agent score', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.yourScore).toBe(42);
		expect(result.yourRank).toBe(3);
		expect(result.totalAgents).toBe(10);
		expect(result.streak).toBe(5);
	});
});

// ─── transformGameState - Battle ─────────────────────────────────────────────

describe('transformGameState (battle)', () => {
	it('produces valid GetGameStateOutput for battle phase', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(result);
		expect(parsed.success).toBe(true);
	});

	it('has battle: populated and overworld: null', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.battle).not.toBeNull();
		expect(result.overworld).toBeNull();
	});

	it('maps battle type correctly', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.battle?.type).toBe('wild');
	});

	it('maps player active Pokemon', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const active = result.battle?.playerActive;
		expect(active?.species).toBe('Charizard');
		expect(active?.level).toBe(50);
		expect(active?.hp).toBe(120);
		expect(active?.maxHp).toBe(200);
		expect(active?.types).toEqual(['fire', 'flying']);
		expect(active?.moves).toHaveLength(4);
		expect(active?.stats.attack).toBe(130);
		expect(active?.stats.speed).toBe(150);
		expect(active?.stats.specialAttack).toBe(160);
		expect(active?.stats.specialDefense).toBe(160);
	});

	it('maps opponent Pokemon', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const opp = result.battle?.opponent;
		expect(opp?.species).toBe('Venusaur');
		expect(opp?.level).toBe(48);
		expect(opp?.types).toEqual(['grass', 'poison']);
		expect(opp?.knownMoves).toHaveLength(1);
		expect(opp?.trainerClass).toBe(0);
		expect(opp?.partyCount).toBe(1);
	});

	it('maps move effectiveness by slot index', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const eff = result.battle?.moveEffectiveness;
		expect(eff).toHaveLength(4);
		expect(eff?.[0]?.slot).toBe(0);
		expect(eff?.[0]?.moveName).toBe('Flamethrower');
		expect(eff?.[0]?.effectiveness).toBe(2);
		expect(eff?.[1]?.slot).toBe(1);
		expect(eff?.[1]?.moveName).toBe('Fly');
		expect(eff?.[1]?.effectiveness).toBe(2);
		expect(eff?.[2]?.slot).toBe(2);
		expect(eff?.[2]?.effectiveness).toBe(1);
		expect(eff?.[3]?.slot).toBe(3);
		expect(eff?.[3]?.effectiveness).toBe(0.5);
	});

	it('converts stat modifiers from 1-13 to -6 to +6', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const mods = result.battle?.statModifiers;
		// Player: all neutral (7 -> 0)
		expect(mods?.player.attack).toBe(0);
		expect(mods?.player.defense).toBe(0);
		expect(mods?.player.speed).toBe(0);
		expect(mods?.player.special).toBe(0);
		// Enemy: mixed
		expect(mods?.enemy.attack).toBe(1); // 8 - 7
		expect(mods?.enemy.defense).toBe(-1); // 6 - 7
		expect(mods?.enemy.speed).toBe(0); // 7 - 7
		expect(mods?.enemy.special).toBe(2); // 9 - 7
		expect(mods?.enemy.evasion).toBe(-2); // 5 - 7
	});

	it('maps battle status flags', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.battle?.battleStatus.playerFlags).toEqual([]);
		expect(result.battle?.battleStatus.enemyFlags).toEqual(['poisoned']);
	});

	it('maps turn count', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.battle?.turnCount).toBe(3);
	});
});

// ─── Phase Mapping ───────────────────────────────────────────────────────────

describe('phase mapping', () => {
	it('maps overworld phase', () => {
		const raw = makeOverworldState({ phase: GamePhase.Overworld });
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.phase).toBe('overworld');
	});

	it('maps battle phase', () => {
		const raw = makeBattleState({ phase: GamePhase.Battle });
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.phase).toBe('battle');
	});

	it('maps menu phase', () => {
		const raw = makeOverworldState({ phase: GamePhase.Menu });
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.phase).toBe('menu');
	});

	it('maps dialogue phase', () => {
		const raw = makeOverworldState({ phase: GamePhase.Dialogue });
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.phase).toBe('dialogue');
	});

	it('maps cutscene to dialogue', () => {
		const raw = makeOverworldState({ phase: GamePhase.Cutscene });
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.phase).toBe('dialogue');
	});
});

// ─── Screen State ────────────────────────────────────────────────────────────

describe('screen state', () => {
	it('maps screenText from screen state', () => {
		const raw = makeOverworldState({
			screen: {
				textBoxActive: true,
				menuState: null,
				menuText: null,
				screenText: 'Hello there!',
			},
		});
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.screenText).toBe('Hello there!');
	});

	it('maps null screenText when no text', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.screenText).toBeNull();
	});

	it('maps menu state when menu is active', () => {
		const raw = makeOverworldState({
			screen: {
				textBoxActive: true,
				menuState: { currentItem: 2, maxItems: 5, scrollOffset: 0, isActive: true },
				menuText: 'ITEMS',
				screenText: null,
			},
		});
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.menuState).not.toBeNull();
		expect(result.menuState?.text).toBe('ITEMS');
		expect(result.menuState?.currentItem).toBe(2);
		expect(result.menuState?.maxItems).toBe(5);
	});

	it('maps null menuState when no menu', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.menuState).toBeNull();
	});
});

// ─── generateTip ─────────────────────────────────────────────────────────────

describe('generateTip', () => {
	it('returns super effective tip in battle with super effective move', () => {
		const raw = makeBattleState();
		const tip = generateTip(raw);
		expect(tip).toContain('super effective');
		expect(tip).toContain('Flamethrower');
	});

	it('returns low HP tip when player HP is below 25%', () => {
		const raw = makeBattleState();
		if (raw.battle) {
			raw.battle.playerActive.hp = 10;
			raw.battle.playerActive.maxHp = 200;
			raw.battle.moveEffectiveness = [{ moveName: 'Slash', moveType: PokemonType.Normal, effectiveness: 1 }];
		}
		const tip = generateTip(raw);
		expect(tip).toContain('low on HP');
	});

	it('returns generic battle tip when no super effective and HP is fine', () => {
		const raw = makeBattleState();
		if (raw.battle) {
			raw.battle.moveEffectiveness = [{ moveName: 'Slash', moveType: PokemonType.Normal, effectiveness: 1 }];
		}
		const tip = generateTip(raw);
		expect(tip).toContain('highest power');
	});

	it('returns cut tip in overworld when cut is available', () => {
		const raw = makeOverworldState();
		if (raw.overworld) {
			raw.overworld.hmAvailable = { cut: true, fly: false, surf: false, strength: false, flash: false };
		}
		const tip = generateTip(raw);
		expect(tip).toContain('Cut');
	});

	it('returns high encounter rate tip', () => {
		const raw = makeOverworldState();
		if (raw.overworld) {
			raw.overworld.hmAvailable = { cut: false, fly: false, surf: false, strength: false, flash: false };
			raw.overworld.wildEncounterRate = 150;
		}
		const tip = generateTip(raw);
		expect(tip).toContain('wild encounter rate');
	});

	it('returns menu tip for menu phase', () => {
		const raw = makeOverworldState({ phase: GamePhase.Menu });
		const tip = generateTip(raw);
		expect(tip).toContain('menu');
	});

	it('returns dialogue tip for dialogue phase', () => {
		const raw = makeOverworldState({ phase: GamePhase.Dialogue, battle: null, overworld: null });
		const tip = generateTip(raw);
		expect(tip).toContain('dialogue');
	});

	it('returns dialogue tip for cutscene phase', () => {
		const raw = makeOverworldState({ phase: GamePhase.Cutscene, battle: null, overworld: null });
		const tip = generateTip(raw);
		expect(tip).toContain('dialogue');
	});
});

// ─── Schema Validation ───────────────────────────────────────────────────────

describe('GetGameStateOutput schema validation', () => {
	it('overworld output passes schema parse', () => {
		const raw = makeOverworldState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(result);
		if (!parsed.success) {
			throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
		}
		expect(parsed.success).toBe(true);
	});

	it('battle output passes schema parse', () => {
		const raw = makeBattleState();
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(result);
		if (!parsed.success) {
			throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
		}
		expect(parsed.success).toBe(true);
	});

	it('menu phase output passes schema parse', () => {
		const raw = makeOverworldState({
			phase: GamePhase.Menu,
			screen: {
				textBoxActive: true,
				menuState: { currentItem: 0, maxItems: 4, scrollOffset: 0, isActive: true },
				menuText: 'POKeMON',
				screenText: null,
			},
		});
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(result);
		if (!parsed.success) {
			throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
		}
		expect(parsed.success).toBe(true);
	});

	it('dialogue phase output passes schema parse', () => {
		const raw = makeOverworldState({
			phase: GamePhase.Dialogue,
			screen: {
				textBoxActive: true,
				menuState: null,
				menuText: null,
				screenText: 'Professor Oak: Hello there!',
			},
		});
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		const parsed = GetGameStateOutput.safeParse(result);
		if (!parsed.success) {
			throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
		}
		expect(parsed.success).toBe(true);
	});
});

// ─── Trainer Battle ──────────────────────────────────────────────────────────

describe('trainer battle', () => {
	it('maps trainer battle type', () => {
		const raw = makeBattleState();
		if (raw.battle) {
			raw.battle.type = 'trainer';
			raw.battle.opponent.trainerClass = 42;
			raw.battle.opponent.partyCount = 3;
		}
		const result = transformGameState(raw, defaultAgentScore, defaultTickInfo);
		expect(result.battle?.type).toBe('trainer');
		expect(result.battle?.opponent.trainerClass).toBe(42);
		expect(result.battle?.opponent.partyCount).toBe(3);
	});
});
