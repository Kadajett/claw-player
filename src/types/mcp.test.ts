import { describe, expect, it } from 'vitest';
import {
	AchievementProgress,
	ActionCounts,
	AgentStats,
	ClawPosition,
	GameAction,
	GamePhase,
	GetGameStateOutput,
	GetHistoryInput,
	GetHistoryOutput,
	GetRateLimitOutput,
	LeaderboardEntry,
	Prize,
	RoundHistoryEntry,
	SubmitActionInput,
	SubmitActionOutput,
	UnlockedAchievement,
} from './mcp.js';

describe('GameAction', () => {
	it('accepts valid actions', () => {
		expect(GameAction.parse('up')).toBe('up');
		expect(GameAction.parse('down')).toBe('down');
		expect(GameAction.parse('left')).toBe('left');
		expect(GameAction.parse('right')).toBe('right');
		expect(GameAction.parse('grab')).toBe('grab');
	});

	it('rejects invalid actions', () => {
		expect(() => GameAction.parse('jump')).toThrow();
		expect(() => GameAction.parse('')).toThrow();
	});
});

describe('ClawPosition', () => {
	it('accepts valid coordinates', () => {
		expect(ClawPosition.parse({ x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
		expect(ClawPosition.parse({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
		expect(ClawPosition.parse({ x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
	});

	it('rejects out-of-bounds coordinates', () => {
		expect(() => ClawPosition.parse({ x: -1, y: 50 })).toThrow();
		expect(() => ClawPosition.parse({ x: 50, y: 101 })).toThrow();
	});
});

describe('GamePhase', () => {
	it('accepts all valid phases', () => {
		expect(GamePhase.parse('voting')).toBe('voting');
		expect(GamePhase.parse('executing')).toBe('executing');
		expect(GamePhase.parse('idle')).toBe('idle');
		expect(GamePhase.parse('bonus_round')).toBe('bonus_round');
	});

	it('rejects invalid phases', () => {
		expect(() => GamePhase.parse('unknown')).toThrow();
	});
});

describe('Prize', () => {
	it('validates prize structure', () => {
		const prize = { id: 'p1', name: 'Teddy Bear', value: 100, position: { x: 25, y: 75 } };
		expect(Prize.parse(prize)).toEqual(prize);
	});

	it('rejects negative value', () => {
		expect(() => Prize.parse({ id: 'p1', name: 'Bad', value: -10, position: { x: 0, y: 0 } })).toThrow();
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
	it('validates progress structure', () => {
		const progress = {
			id: 'hot-streak',
			name: 'Hot Streak',
			description: 'Win 5 rounds in a row',
			current: 3,
			required: 5,
			percentComplete: 60,
		};
		expect(AchievementProgress.parse(progress)).toEqual(progress);
	});
});

describe('GetGameStateOutput', () => {
	it('validates complete game state output', () => {
		const state = {
			round: 42,
			phase: 'voting' as const,
			secondsRemaining: 8,
			clawPosition: { x: 30, y: 70 },
			prizes: [{ id: 'p1', name: 'Bear', value: 50, position: { x: 30, y: 70 } }],
			yourScore: 250,
			yourRank: 3,
			totalAgents: 12,
			streak: 2,
			achievementsPending: [],
			leaderboard: [{ rank: 1, agentId: 'agent-1', score: 500 }],
			nextBonusRoundIn: 5,
			tip: 'Move towards the high-value prize at (30, 70)',
		};
		expect(GetGameStateOutput.parse(state)).toEqual(state);
	});
});

describe('SubmitActionInput', () => {
	it('validates action input', () => {
		expect(SubmitActionInput.parse({ action: 'grab' })).toEqual({ action: 'grab' });
	});

	it('rejects invalid action', () => {
		expect(() => SubmitActionInput.parse({ action: 'fly' })).toThrow();
	});
});

describe('SubmitActionOutput', () => {
	it('validates submit result', () => {
		const result = {
			success: true,
			outcome: 'Claw moved up, prize narrowly missed',
			pointsEarned: 10,
			newScore: 260,
			newRank: 2,
			rankChange: '+1',
			achievementsUnlocked: [],
			rateLimitRemaining: 18,
		};
		expect(SubmitActionOutput.parse(result)).toEqual(result);
	});

	it('validates unlocked achievement', () => {
		const achievement = {
			id: 'first-grab',
			name: 'First Grab',
			description: 'Attempt your first grab',
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

describe('RoundHistoryEntry', () => {
	it('validates round history', () => {
		const entry = {
			round: 10,
			winningAction: 'left' as const,
			actionCounts: { up: 2, down: 1, left: 5, right: 3, grab: 1 },
			outcome: 'Claw moved left toward prize',
			yourAction: 'left' as const,
			yourPoints: 15,
			timestamp: '2026-02-19T12:00:00.000Z',
		};
		expect(RoundHistoryEntry.parse(entry)).toEqual(entry);
	});

	it('accepts missing yourAction', () => {
		const entry = {
			round: 10,
			winningAction: 'left' as const,
			actionCounts: { up: 0, down: 0, left: 1, right: 0, grab: 0 },
			outcome: 'Claw moved left',
			yourPoints: 0,
			timestamp: '2026-02-19T12:00:00.000Z',
		};
		expect(RoundHistoryEntry.parse(entry)).toMatchObject({ round: 10 });
	});
});

describe('GetHistoryOutput', () => {
	it('validates history output', () => {
		const output = {
			rounds: [],
			leaderboard: [{ rank: 1, agentId: 'agent-1', score: 500 }],
			yourStats: {
				totalRounds: 50,
				wins: 30,
				winRate: 0.6,
				bestStreak: 8,
				totalScore: 1200,
				rank: 2,
			},
		};
		expect(GetHistoryOutput.parse(output)).toEqual(output);
	});
});

describe('ActionCounts', () => {
	it('validates all action counts', () => {
		const counts = { up: 3, down: 2, left: 5, right: 1, grab: 0 };
		expect(ActionCounts.parse(counts)).toEqual(counts);
	});
});

describe('AgentStats', () => {
	it('validates win rate bounds', () => {
		expect(() =>
			AgentStats.parse({ totalRounds: 10, wins: 5, winRate: 1.5, bestStreak: 3, totalScore: 100, rank: 1 }),
		).toThrow();
	});
});
