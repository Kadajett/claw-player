import { describe, expect, it } from 'vitest';
import {
	AchievementProgress,
	ActivePokemon,
	AgentStats,
	BattleActivePokemonSchema,
	BattleOpponentSchema,
	BattleRoundEntry,
	GameActionSchema,
	GetBattleStateOutput,
	GetGameStateOutput,
	GetHistoryInput,
	GetHistoryOutput,
	GetRateLimitOutput,
	InventoryItemSchema,
	LeaderboardEntry,
	Move,
	MoveEffectivenessSchema,
	OpponentPokemon,
	PartyMember,
	PartyPokemonMoveSchema,
	PartyPokemonSchema,
	StatModSchema,
	SubmitActionInput,
	SubmitActionOutput,
	UnlockedAchievement,
} from './mcp.js';

describe('GameActionSchema', () => {
	it('accepts valid button actions', () => {
		expect(GameActionSchema.parse('a')).toBe('a');
		expect(GameActionSchema.parse('b')).toBe('b');
		expect(GameActionSchema.parse('up')).toBe('up');
		expect(GameActionSchema.parse('down')).toBe('down');
		expect(GameActionSchema.parse('left')).toBe('left');
		expect(GameActionSchema.parse('right')).toBe('right');
		expect(GameActionSchema.parse('start')).toBe('start');
		expect(GameActionSchema.parse('select')).toBe('select');
	});

	it('rejects old semantic action format', () => {
		expect(() => GameActionSchema.parse('move:0')).toThrow();
		expect(() => GameActionSchema.parse('switch:3')).toThrow();
		expect(() => GameActionSchema.parse('run')).toThrow();
	});

	it('rejects invalid actions', () => {
		expect(() => GameActionSchema.parse('jump')).toThrow();
		expect(() => GameActionSchema.parse('')).toThrow();
		expect(() => GameActionSchema.parse('A')).toThrow();
	});
});

describe('Move', () => {
	it('validates a complete move', () => {
		const move = {
			index: 0,
			name: 'Thunderbolt',
			type: 'Electric',
			pp: 15,
			maxPp: 24,
			power: 95,
			accuracy: 100,
			category: 'special' as const,
			disabled: false,
		};
		expect(Move.parse(move)).toEqual(move);
	});

	it('accepts null power and accuracy for status moves', () => {
		const move = {
			index: 1,
			name: 'Thunder Wave',
			type: 'Electric',
			pp: 20,
			maxPp: 20,
			power: null,
			accuracy: null,
			category: 'status' as const,
			disabled: false,
		};
		expect(Move.parse(move)).toEqual(move);
	});
});

describe('ActivePokemon', () => {
	const pikachu = {
		name: 'Pikachu',
		species: 'Pikachu',
		level: 25,
		currentHp: 52,
		maxHp: 52,
		hpPercent: 100,
		status: null,
		types: ['Electric'],
		moves: [
			{
				index: 0,
				name: 'Thunderbolt',
				type: 'Electric',
				pp: 15,
				maxPp: 24,
				power: 95,
				accuracy: 100,
				category: 'special' as const,
				disabled: false,
			},
		],
	};

	it('validates active Pokemon', () => {
		expect(ActivePokemon.parse(pikachu)).toEqual(pikachu);
	});

	it('accepts status conditions', () => {
		expect(ActivePokemon.parse({ ...pikachu, status: 'PAR' })).toMatchObject({ status: 'PAR' });
	});

	it('accepts dual-type Pokemon', () => {
		const dual = { ...pikachu, types: ['Fire', 'Flying'] };
		expect(ActivePokemon.parse(dual)).toMatchObject({ types: ['Fire', 'Flying'] });
	});
});

describe('OpponentPokemon', () => {
	it('validates opponent state without moveset', () => {
		const opp = {
			name: 'Blastoise',
			species: 'Blastoise',
			level: 36,
			currentHp: 101,
			maxHp: 134,
			hpPercent: 75.4,
			status: null,
			types: ['Water'],
		};
		expect(OpponentPokemon.parse(opp)).toEqual(opp);
	});
});

describe('PartyMember', () => {
	it('validates party member', () => {
		const member = {
			partyIndex: 1,
			name: 'Charizard',
			species: 'Charizard',
			currentHp: 120,
			maxHp: 150,
			hpPercent: 80,
			status: null,
			types: ['Fire', 'Flying'],
			fainted: false,
			isActive: false,
		};
		expect(PartyMember.parse(member)).toEqual(member);
	});

	it('validates fainted party member', () => {
		const fainted = {
			partyIndex: 2,
			name: 'Snorlax',
			species: 'Snorlax',
			currentHp: 0,
			maxHp: 200,
			hpPercent: 0,
			status: null,
			types: ['Normal'],
			fainted: true,
			isActive: false,
		};
		expect(PartyMember.parse(fainted)).toMatchObject({ fainted: true });
	});
});

describe('LeaderboardEntry', () => {
	it('validates leaderboard entry', () => {
		const entry = { rank: 1, agentId: 'agent-1', score: 1000 };
		expect(LeaderboardEntry.parse(entry)).toEqual(entry);
	});

	it('accepts optional isCurrentAgent', () => {
		const entry = { rank: 1, agentId: 'agent-1', score: 1000, isCurrentAgent: true };
		expect(LeaderboardEntry.parse(entry)).toEqual(entry);
	});

	it('rejects rank of 0', () => {
		expect(() => LeaderboardEntry.parse({ rank: 0, agentId: 'a', score: 0 })).toThrow();
	});
});

describe('AchievementProgress', () => {
	it('validates achievement progress', () => {
		const progress = {
			id: 'super-effective',
			name: 'Super Effective Specialist',
			description: 'Use 10 super effective moves',
			current: 7,
			required: 10,
			percentComplete: 70,
		};
		expect(AchievementProgress.parse(progress)).toEqual(progress);
	});
});

describe('GetBattleStateOutput', () => {
	const baseMove = {
		index: 0,
		name: 'Thunderbolt',
		type: 'Electric',
		pp: 15,
		maxPp: 24,
		power: 95,
		accuracy: 100,
		category: 'special' as const,
		disabled: false,
	};

	it('validates complete battle state', () => {
		const state = {
			turn: 12,
			phase: 'voting' as const,
			secondsRemaining: 8,
			isPlayerTurn: true,
			weather: null,
			playerPokemon: {
				name: 'Pikachu',
				species: 'Pikachu',
				level: 25,
				currentHp: 42,
				maxHp: 52,
				hpPercent: 80.8,
				status: null,
				types: ['Electric'],
				moves: [baseMove],
			},
			opponentPokemon: {
				name: 'Blastoise',
				species: 'Blastoise',
				level: 36,
				currentHp: 50,
				maxHp: 134,
				hpPercent: 37.3,
				status: 'PAR',
				types: ['Water'],
			},
			playerParty: [],
			availableActions: ['a', 'b', 'up', 'down', 'left', 'right', 'start', 'select'],
			typeMatchups: { a: 2.0, b: 1.0 },
			yourScore: 250,
			yourRank: 3,
			totalAgents: 12,
			streak: 4,
			achievementsPending: [],
			leaderboard: [{ rank: 1, agentId: 'agent-1', score: 500 }],
			nextBonusRoundIn: 3,
			tip: 'Press A to confirm your attack selection. Use directional buttons to navigate moves.',
		};
		expect(GetBattleStateOutput.parse(state)).toEqual(state);
	});
});

describe('SubmitActionInput', () => {
	it('validates button actions', () => {
		expect(SubmitActionInput.parse({ action: 'a' })).toEqual({ action: 'a' });
		expect(SubmitActionInput.parse({ action: 'up' })).toEqual({ action: 'up' });
		expect(SubmitActionInput.parse({ action: 'start' })).toEqual({ action: 'start' });
	});

	it('rejects old semantic action format', () => {
		expect(() => SubmitActionInput.parse({ action: 'move:0' })).toThrow();
		expect(() => SubmitActionInput.parse({ action: 'switch:3' })).toThrow();
		expect(() => SubmitActionInput.parse({ action: 'run' })).toThrow();
	});

	it('rejects invalid action', () => {
		expect(() => SubmitActionInput.parse({ action: 'fly' })).toThrow();
		expect(() => SubmitActionInput.parse({ action: 'move:5' })).toThrow();
	});
});

describe('SubmitActionOutput', () => {
	it('validates submit result', () => {
		const result = {
			success: true,
			outcome: 'You voted "a" (confirm). Tally: a: 5 votes, down: 2 votes. You are with the majority.',
			pointsEarned: 15,
			newScore: 265,
			newRank: 2,
			rankChange: '+1',
			achievementsUnlocked: [],
			rateLimitRemaining: 18,
		};
		expect(SubmitActionOutput.parse(result)).toEqual(result);
	});

	it('validates unlocked achievement', () => {
		const achievement = {
			id: 'super-effective',
			name: 'Super Effective Specialist',
			description: 'Used 10 super effective moves',
			pointsAwarded: 50,
		};
		expect(UnlockedAchievement.parse(achievement)).toEqual(achievement);
	});
});

describe('GetRateLimitOutput', () => {
	it('validates rate limit status', () => {
		const status = {
			requestsRemaining: 15,
			requestsPerSecond: 20,
			burstCapacity: 30,
			resetAt: '2026-02-19T12:00:00.000Z',
			windowSeconds: 60,
		};
		expect(GetRateLimitOutput.parse(status)).toEqual(status);
	});

	it('rejects invalid datetime', () => {
		expect(() =>
			GetRateLimitOutput.parse({
				requestsRemaining: 15,
				requestsPerSecond: 20,
				burstCapacity: 30,
				resetAt: 'not-a-date',
				windowSeconds: 60,
			}),
		).toThrow();
	});
});

describe('GetHistoryInput', () => {
	it('applies defaults', () => {
		const result = GetHistoryInput.parse({});
		expect(result.limit).toBe(10);
		expect(result.includeLeaderboard).toBe(true);
	});

	it('rejects limit out of range', () => {
		expect(() => GetHistoryInput.parse({ limit: 0 })).toThrow();
		expect(() => GetHistoryInput.parse({ limit: 101 })).toThrow();
	});
});

describe('BattleRoundEntry', () => {
	it('validates battle round history', () => {
		const entry = {
			turn: 10,
			winningAction: 'a',
			actionCounts: { a: 5, down: 2, b: 1 },
			outcome: 'Pressed A to confirm Thunderbolt. Hit Blastoise for 94 damage!',
			yourAction: 'a',
			yourPoints: 15,
			timestamp: '2026-02-19T12:00:00.000Z',
		};
		expect(BattleRoundEntry.parse(entry)).toEqual(entry);
	});

	it('accepts missing yourAction when agent did not vote', () => {
		const entry = {
			turn: 11,
			winningAction: 'down',
			actionCounts: { down: 6 },
			outcome: 'Pressed Down to navigate menu',
			yourPoints: 0,
			timestamp: '2026-02-19T12:00:15.000Z',
		};
		expect(BattleRoundEntry.parse(entry)).toMatchObject({ turn: 11 });
	});
});

describe('GetHistoryOutput', () => {
	it('validates full history output', () => {
		const output = {
			rounds: [],
			leaderboard: [{ rank: 1, agentId: 'agent-1', score: 500 }],
			yourStats: {
				totalTurns: 50,
				wins: 35,
				winRate: 0.7,
				bestStreak: 8,
				totalScore: 1200,
				rank: 2,
			},
		};
		expect(GetHistoryOutput.parse(output)).toEqual(output);
	});
});

describe('AgentStats', () => {
	it('rejects winRate out of range', () => {
		expect(() =>
			AgentStats.parse({ totalTurns: 10, wins: 5, winRate: 1.5, bestStreak: 3, totalScore: 100, rank: 1 }),
		).toThrow();
	});
});

// ─── Unified Game State Schema Tests (Issue #13) ────────────────────────────

const sampleMove: PartyPokemonMoveSchema = {
	name: 'Thunderbolt',
	moveId: 85,
	pp: 15,
	maxPp: 15,
	type: 'electric',
	power: 95,
};

const samplePartyPokemon: PartyPokemonSchema = {
	species: 'Pikachu',
	speciesId: 0x54,
	nickname: 'PIKA',
	level: 25,
	hp: 52,
	maxHp: 52,
	status: 'healthy',
	moves: [sampleMove],
	stats: { attack: 55, defense: 30, speed: 90, specialAttack: 50, specialDefense: 50 },
};

const sampleInventoryItem: InventoryItemSchema = { itemId: 4, name: 'Poke Ball', quantity: 5 };

const basePlayer = {
	name: 'RED',
	money: 3000,
	badges: 3,
	badgeList: ['Boulder Badge', 'Cascade Badge', 'Thunder Badge'],
	location: { mapId: 1, mapName: 'Viridian City', x: 10, y: 5 },
	direction: 'down' as const,
	walkBikeSurf: 'walking' as const,
};

const baseProgress = { playTimeHours: 12, playTimeMinutes: 30, pokedexOwned: 45, pokedexSeen: 80 };

const neutralStatMod: StatModSchema = { attack: 0, defense: 0, speed: 0, special: 0, accuracy: 0, evasion: 0 };

describe('PartyPokemonMoveSchema', () => {
	it('validates a move', () => {
		expect(PartyPokemonMoveSchema.parse(sampleMove)).toEqual(sampleMove);
	});

	it('rejects missing fields', () => {
		expect(() => PartyPokemonMoveSchema.parse({ name: 'Tackle' })).toThrow();
	});
});

describe('PartyPokemonSchema', () => {
	it('validates a party pokemon', () => {
		expect(PartyPokemonSchema.parse(samplePartyPokemon)).toEqual(samplePartyPokemon);
	});

	it('accepts empty moves array', () => {
		const noMoves = { ...samplePartyPokemon, moves: [] };
		expect(PartyPokemonSchema.parse(noMoves)).toMatchObject({ moves: [] });
	});

	it('rejects missing stats', () => {
		const { stats: _stats, ...noStats } = samplePartyPokemon;
		expect(() => PartyPokemonSchema.parse(noStats)).toThrow();
	});
});

describe('BattleActivePokemonSchema', () => {
	it('validates active pokemon with types', () => {
		const active = { ...samplePartyPokemon, types: ['electric'] };
		expect(BattleActivePokemonSchema.parse(active)).toEqual(active);
	});

	it('rejects missing types field', () => {
		expect(() => BattleActivePokemonSchema.parse(samplePartyPokemon)).toThrow();
	});
});

describe('BattleOpponentSchema', () => {
	const opponent = {
		species: 'Geodude',
		level: 12,
		hp: 30,
		maxHp: 35,
		status: 'healthy',
		types: ['rock', 'ground'],
		knownMoves: [{ name: 'Tackle', moveId: 33, pp: 35, maxPp: 35, type: 'normal', power: 40 }],
		stats: { attack: 40, defense: 80, speed: 20, specialAttack: 30, specialDefense: 30 },
		trainerClass: 0,
		partyCount: 1,
	};

	it('validates opponent', () => {
		expect(BattleOpponentSchema.parse(opponent)).toEqual(opponent);
	});

	it('accepts empty knownMoves', () => {
		const noMoves = { ...opponent, knownMoves: [] };
		expect(BattleOpponentSchema.parse(noMoves)).toMatchObject({ knownMoves: [] });
	});

	it('rejects missing types', () => {
		const { types: _types, ...noTypes } = opponent;
		expect(() => BattleOpponentSchema.parse(noTypes)).toThrow();
	});
});

describe('StatModSchema', () => {
	it('validates neutral modifiers', () => {
		expect(StatModSchema.parse(neutralStatMod)).toEqual(neutralStatMod);
	});

	it('validates extreme modifiers', () => {
		const extreme = { attack: 6, defense: -6, speed: 3, special: -2, accuracy: 1, evasion: -1 };
		expect(StatModSchema.parse(extreme)).toEqual(extreme);
	});

	it('rejects out-of-range modifier', () => {
		expect(() => StatModSchema.parse({ ...neutralStatMod, attack: 7 })).toThrow();
		expect(() => StatModSchema.parse({ ...neutralStatMod, defense: -7 })).toThrow();
	});
});

describe('InventoryItemSchema', () => {
	it('validates an item', () => {
		expect(InventoryItemSchema.parse(sampleInventoryItem)).toEqual(sampleInventoryItem);
	});

	it('rejects missing name', () => {
		expect(() => InventoryItemSchema.parse({ itemId: 1, quantity: 5 })).toThrow();
	});
});

describe('MoveEffectivenessSchema', () => {
	it('validates effectiveness entry', () => {
		const entry = { slot: 0, moveName: 'Thunderbolt', effectiveness: 2.0 };
		expect(MoveEffectivenessSchema.parse(entry)).toEqual(entry);
	});

	it('accepts zero effectiveness', () => {
		const entry = { slot: 0, moveName: 'Thunder', effectiveness: 0 };
		expect(MoveEffectivenessSchema.parse(entry)).toEqual(entry);
	});
});

describe('GetGameStateOutput', () => {
	const overworldState = {
		turn: 42,
		phase: 'overworld' as const,
		secondsRemaining: 12,
		availableActions: ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'] as const,
		player: basePlayer,
		party: [samplePartyPokemon],
		inventory: [sampleInventoryItem],
		battle: null,
		overworld: {
			tileInFront: { tileId: 0x00, description: 'floor' },
			hmAvailable: { cut: true, fly: false, surf: false, strength: false, flash: false },
			wildEncounterRate: 25,
		},
		screenText: null,
		menuState: null,
		progress: baseProgress,
		yourScore: 500,
		yourRank: 5,
		totalAgents: 20,
		streak: 3,
		tip: 'Head north to Route 2.',
	};

	const battleState = {
		turn: 15,
		phase: 'battle' as const,
		secondsRemaining: 8,
		availableActions: ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'] as const,
		player: basePlayer,
		party: [samplePartyPokemon],
		inventory: [sampleInventoryItem],
		battle: {
			type: 'wild' as const,
			playerActive: {
				...samplePartyPokemon,
				types: ['electric'],
			},
			opponent: {
				species: 'Geodude',
				level: 12,
				hp: 30,
				maxHp: 35,
				status: 'healthy',
				types: ['rock', 'ground'],
				knownMoves: [{ name: 'Tackle', moveId: 33, pp: 35, maxPp: 35, type: 'normal', power: 40 }],
				stats: { attack: 40, defense: 80, speed: 20, specialAttack: 30, specialDefense: 30 },
				trainerClass: 0,
				partyCount: 1,
			},
			moveEffectiveness: [{ slot: 0, moveName: 'Thunderbolt', effectiveness: 0 }],
			statModifiers: { player: neutralStatMod, enemy: neutralStatMod },
			battleStatus: { playerFlags: [], enemyFlags: [] },
			turnCount: 3,
		},
		overworld: null,
		screenText: null,
		menuState: null,
		progress: baseProgress,
		yourScore: 520,
		yourRank: 4,
		totalAgents: 20,
		streak: 5,
		tip: 'Electric moves have no effect on Ground types!',
	};

	it('validates a complete overworld state (battle: null, overworld: populated)', () => {
		expect(GetGameStateOutput.parse(overworldState)).toEqual(overworldState);
	});

	it('validates a complete battle state (battle: populated, overworld: null)', () => {
		expect(GetGameStateOutput.parse(battleState)).toEqual(battleState);
	});

	it('validates with all nullable fields as null', () => {
		const minimal = {
			...overworldState,
			battle: null,
			overworld: null,
			screenText: null,
			menuState: null,
		};
		expect(GetGameStateOutput.parse(minimal)).toEqual(minimal);
	});

	it('validates dialogue phase with screenText populated', () => {
		const dialogue = {
			...overworldState,
			phase: 'dialogue' as const,
			screenText: 'PROF. OAK: Hello there!',
		};
		expect(GetGameStateOutput.parse(dialogue)).toMatchObject({
			phase: 'dialogue',
			screenText: 'PROF. OAK: Hello there!',
		});
	});

	it('validates menu phase with menuState populated', () => {
		const menu = {
			...overworldState,
			phase: 'menu' as const,
			menuState: { text: '>POKEMON\n ITEM\n SAVE', currentItem: 0, maxItems: 3 },
		};
		expect(GetGameStateOutput.parse(menu)).toMatchObject({
			phase: 'menu',
			menuState: { currentItem: 0 },
		});
	});

	it('validates trainer battle type', () => {
		const trainerBattle = {
			...battleState,
			battle: { ...battleState.battle, type: 'trainer' as const },
		};
		expect(GetGameStateOutput.parse(trainerBattle)).toMatchObject({
			battle: { type: 'trainer' },
		});
	});

	it('validates battle with status flags', () => {
		const flagged = {
			...battleState,
			battle: {
				...battleState.battle,
				battleStatus: {
					playerFlags: ['confused', 'substitute'],
					enemyFlags: ['reflect'],
				},
			},
		};
		expect(GetGameStateOutput.parse(flagged)).toMatchObject({
			battle: {
				battleStatus: {
					playerFlags: ['confused', 'substitute'],
					enemyFlags: ['reflect'],
				},
			},
		});
	});

	it('validates all walkBikeSurf modes', () => {
		for (const mode of ['walking', 'biking', 'surfing'] as const) {
			const state = {
				...overworldState,
				player: { ...basePlayer, walkBikeSurf: mode },
			};
			expect(GetGameStateOutput.parse(state)).toMatchObject({
				player: { walkBikeSurf: mode },
			});
		}
	});

	it('rejects missing required fields', () => {
		expect(() => GetGameStateOutput.parse({})).toThrow();
		expect(() => GetGameStateOutput.parse({ turn: 1 })).toThrow();
	});

	it('rejects invalid phase', () => {
		expect(() => GetGameStateOutput.parse({ ...overworldState, phase: 'cutscene' })).toThrow();
		expect(() => GetGameStateOutput.parse({ ...overworldState, phase: 'idle' })).toThrow();
	});

	it('rejects invalid direction', () => {
		expect(() =>
			GetGameStateOutput.parse({
				...overworldState,
				player: { ...basePlayer, direction: 'north' },
			}),
		).toThrow();
	});

	it('rejects invalid walkBikeSurf mode', () => {
		expect(() =>
			GetGameStateOutput.parse({
				...overworldState,
				player: { ...basePlayer, walkBikeSurf: 'running' },
			}),
		).toThrow();
	});

	it('rejects wrong types for fields', () => {
		expect(() => GetGameStateOutput.parse({ ...overworldState, turn: 'abc' })).toThrow();
		expect(() => GetGameStateOutput.parse({ ...overworldState, secondsRemaining: 'soon' })).toThrow();
	});

	it('rejects invalid availableActions', () => {
		expect(() =>
			GetGameStateOutput.parse({
				...overworldState,
				availableActions: ['fly', 'swim'],
			}),
		).toThrow();
	});
});
