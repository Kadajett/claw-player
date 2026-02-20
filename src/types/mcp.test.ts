import { describe, expect, it } from 'vitest';
import {
	AchievementProgress,
	ActivePokemon,
	AgentStats,
	BattleRoundEntry,
	GameActionSchema,
	GetBattleStateOutput,
	GetHistoryInput,
	GetHistoryOutput,
	GetRateLimitOutput,
	LeaderboardEntry,
	Move,
	OpponentPokemon,
	PartyMember,
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
