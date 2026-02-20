import { z } from 'zod';

export const GameAction = z.enum(['up', 'down', 'left', 'right', 'grab']);
export type GameAction = z.infer<typeof GameAction>;

export const ClawPosition = z.object({
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
});
export type ClawPosition = z.infer<typeof ClawPosition>;

export const Prize = z.object({
	id: z.string(),
	name: z.string(),
	value: z.number().positive(),
	position: z.object({
		x: z.number(),
		y: z.number(),
	}),
});
export type Prize = z.infer<typeof Prize>;

export const AchievementProgress = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	current: z.number().nonnegative(),
	required: z.number().positive(),
	percentComplete: z.number().min(0).max(100),
});
export type AchievementProgress = z.infer<typeof AchievementProgress>;

export const LeaderboardEntry = z.object({
	rank: z.number().positive(),
	agentId: z.string(),
	score: z.number().nonnegative(),
	isCurrentAgent: z.boolean().optional(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const GamePhase = z.enum(['voting', 'executing', 'idle', 'bonus_round']);
export type GamePhase = z.infer<typeof GamePhase>;

// Tool: get_game_state
export const GetGameStateOutput = z.object({
	round: z.number().nonnegative(),
	phase: GamePhase,
	secondsRemaining: z.number().nonnegative(),
	clawPosition: ClawPosition,
	prizes: z.array(Prize),
	yourScore: z.number().nonnegative(),
	yourRank: z.number().positive(),
	totalAgents: z.number().nonnegative(),
	streak: z.number().nonnegative(),
	achievementsPending: z.array(AchievementProgress),
	leaderboard: z.array(LeaderboardEntry),
	nextBonusRoundIn: z.number().nonnegative(),
	tip: z.string(),
});
export type GetGameStateOutput = z.infer<typeof GetGameStateOutput>;

// Tool: submit_action
export const SubmitActionInput = z.object({
	action: GameAction,
});
export type SubmitActionInput = z.infer<typeof SubmitActionInput>;

export const UnlockedAchievement = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	pointsAwarded: z.number().nonnegative(),
});
export type UnlockedAchievement = z.infer<typeof UnlockedAchievement>;

export const SubmitActionOutput = z.object({
	success: z.boolean(),
	outcome: z.string(),
	pointsEarned: z.number(),
	newScore: z.number().nonnegative(),
	newRank: z.number().positive(),
	rankChange: z.string(),
	achievementsUnlocked: z.array(UnlockedAchievement),
	rateLimitRemaining: z.number().nonnegative(),
});
export type SubmitActionOutput = z.infer<typeof SubmitActionOutput>;

// Tool: get_rate_limit
export const GetRateLimitOutput = z.object({
	requestsRemaining: z.number().nonnegative(),
	requestsPerSecond: z.number().positive(),
	burstCapacity: z.number().positive(),
	resetAt: z.string().datetime(),
	windowSeconds: z.number().positive(),
});
export type GetRateLimitOutput = z.infer<typeof GetRateLimitOutput>;

// Tool: get_history
export const GetHistoryInput = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	includeLeaderboard: z.boolean().default(true),
});
export type GetHistoryInput = z.infer<typeof GetHistoryInput>;

export const ActionCounts = z.object({
	up: z.number().nonnegative(),
	down: z.number().nonnegative(),
	left: z.number().nonnegative(),
	right: z.number().nonnegative(),
	grab: z.number().nonnegative(),
});
export type ActionCounts = z.infer<typeof ActionCounts>;

export const RoundHistoryEntry = z.object({
	round: z.number().nonnegative(),
	winningAction: GameAction,
	actionCounts: ActionCounts,
	outcome: z.string(),
	yourAction: GameAction.optional(),
	yourPoints: z.number(),
	timestamp: z.string().datetime(),
});
export type RoundHistoryEntry = z.infer<typeof RoundHistoryEntry>;

export const AgentStats = z.object({
	totalRounds: z.number().nonnegative(),
	wins: z.number().nonnegative(),
	winRate: z.number().min(0).max(1),
	bestStreak: z.number().nonnegative(),
	totalScore: z.number().nonnegative(),
	rank: z.number().positive(),
});
export type AgentStats = z.infer<typeof AgentStats>;

export const GetHistoryOutput = z.object({
	rounds: z.array(RoundHistoryEntry),
	leaderboard: z.array(LeaderboardEntry).optional(),
	yourStats: AgentStats,
});
export type GetHistoryOutput = z.infer<typeof GetHistoryOutput>;

// Service interfaces used by MCP tools
export interface GameStateService {
	getGameState(agentId: string): Promise<GetGameStateOutput>;
	submitAction(agentId: string, action: GameAction): Promise<SubmitActionOutput>;
	getRateLimit(agentId: string): Promise<GetRateLimitOutput>;
	getHistory(agentId: string, limit: number, includeLeaderboard: boolean): Promise<GetHistoryOutput>;
}

// Auth result
export type ApiKeyValidationResult = { valid: true; agentId: string } | { valid: false; reason: string };
