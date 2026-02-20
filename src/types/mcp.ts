import { z } from 'zod';

// Pokemon battle actions
// move:0-3 = use the attack at that index in the active Pokemon's move list
// switch:0-5 = swap active Pokemon for the party member at that index
// run = attempt to flee the battle
export const PokemonAction = z.union([
	z.string().regex(/^move:[0-3]$/, 'Use move by index: move:0 through move:3'),
	z.string().regex(/^switch:[0-5]$/, 'Switch Pokemon by party index: switch:0 through switch:5'),
	z.literal('run'),
]);
export type PokemonAction = z.infer<typeof PokemonAction>;

// Individual move slot (up to 4 per Pokemon)
export const Move = z.object({
	index: z.number().min(0).max(3),
	name: z.string(),
	type: z.string(),
	pp: z.number().nonnegative(),
	maxPp: z.number().positive(),
	power: z.number().nullable(),
	accuracy: z.number().nullable(),
	category: z.enum(['physical', 'special', 'status']),
	disabled: z.boolean(),
});
export type Move = z.infer<typeof Move>;

// The active player Pokemon in battle
export const ActivePokemon = z.object({
	name: z.string(),
	species: z.string(),
	level: z.number().positive(),
	currentHp: z.number().nonnegative(),
	maxHp: z.number().positive(),
	hpPercent: z.number().min(0).max(100),
	status: z.string().nullable(),
	types: z.array(z.string()).min(1).max(2),
	moves: z.array(Move).max(4),
});
export type ActivePokemon = z.infer<typeof ActivePokemon>;

// The opponent Pokemon (less info since we can't see their full moveset in Gen 1)
export const OpponentPokemon = z.object({
	name: z.string(),
	species: z.string(),
	level: z.number().positive(),
	currentHp: z.number().nonnegative(),
	maxHp: z.number().positive(),
	hpPercent: z.number().min(0).max(100),
	status: z.string().nullable(),
	types: z.array(z.string()).min(1).max(2),
});
export type OpponentPokemon = z.infer<typeof OpponentPokemon>;

// Party member shown in get_game_state (non-active Pokemon)
export const PartyMember = z.object({
	partyIndex: z.number().min(0).max(5),
	name: z.string(),
	species: z.string(),
	currentHp: z.number().nonnegative(),
	maxHp: z.number().positive(),
	hpPercent: z.number().min(0).max(100),
	status: z.string().nullable(),
	types: z.array(z.string()).min(1).max(2),
	fainted: z.boolean(),
	isActive: z.boolean(),
});
export type PartyMember = z.infer<typeof PartyMember>;

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

// Tool: get_game_state
// Returns the full Pokemon battle state with gamification hooks
export const GetBattleStateOutput = z.object({
	turn: z.number().nonnegative(),
	phase: z.enum(['voting', 'executing', 'idle']),
	secondsRemaining: z.number().nonnegative(),
	isPlayerTurn: z.boolean(),
	weather: z.string().nullable(),
	playerPokemon: ActivePokemon,
	opponentPokemon: OpponentPokemon,
	playerParty: z.array(PartyMember),
	// Available actions this turn (respects disabled moves, fainted party members, etc.)
	availableActions: z.array(z.string()),
	// Type effectiveness multiplier for each available move action (key = "move:0", etc.)
	typeMatchups: z.record(z.string(), z.number()),
	// Gamification
	yourScore: z.number().nonnegative(),
	yourRank: z.number().positive(),
	totalAgents: z.number().nonnegative(),
	streak: z.number().nonnegative(),
	achievementsPending: z.array(AchievementProgress),
	leaderboard: z.array(LeaderboardEntry),
	nextBonusRoundIn: z.number().nonnegative(),
	tip: z.string(),
});
export type GetBattleStateOutput = z.infer<typeof GetBattleStateOutput>;

// Kept for backward compatibility alias
export const GetGameStateOutput = GetBattleStateOutput;
export type GetGameStateOutput = GetBattleStateOutput;

// Tool: submit_action
export const SubmitActionInput = z.object({
	action: PokemonAction,
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

export const BattleRoundEntry = z.object({
	turn: z.number().nonnegative(),
	winningAction: z.string(),
	actionCounts: z.record(z.string(), z.number().nonnegative()),
	outcome: z.string(),
	yourAction: z.string().optional(),
	yourPoints: z.number(),
	timestamp: z.string().datetime(),
});
export type BattleRoundEntry = z.infer<typeof BattleRoundEntry>;

export const AgentStats = z.object({
	totalTurns: z.number().nonnegative(),
	wins: z.number().nonnegative(),
	winRate: z.number().min(0).max(1),
	bestStreak: z.number().nonnegative(),
	totalScore: z.number().nonnegative(),
	rank: z.number().positive(),
});
export type AgentStats = z.infer<typeof AgentStats>;

export const GetHistoryOutput = z.object({
	rounds: z.array(BattleRoundEntry),
	leaderboard: z.array(LeaderboardEntry).optional(),
	yourStats: AgentStats,
});
export type GetHistoryOutput = z.infer<typeof GetHistoryOutput>;

// Service interface implemented by the game engine module
export interface GameStateService {
	getBattleState(agentId: string): Promise<GetBattleStateOutput>;
	submitAction(agentId: string, action: string): Promise<SubmitActionOutput>;
	getRateLimit(agentId: string): Promise<GetRateLimitOutput>;
	getHistory(agentId: string, limit: number, includeLeaderboard: boolean): Promise<GetHistoryOutput>;
}

// Auth result
export type ApiKeyValidationResult = { valid: true; agentId: string } | { valid: false; reason: string };
