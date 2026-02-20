import { z } from 'zod';

// Game actions map directly to Game Boy buttons
export const GameActionSchema = z.enum(['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']);
export type GameActionSchema = z.infer<typeof GameActionSchema>;

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

// Tool: get_game_state (battle-only, deprecated)
/** @deprecated Use GetGameStateOutput instead. This schema only covers battle state. */
export const GetBattleStateOutput = z.object({
	turn: z.number().nonnegative(),
	phase: z.enum(['voting', 'executing', 'idle']),
	secondsRemaining: z.number().nonnegative(),
	isPlayerTurn: z.boolean(),
	weather: z.string().nullable(),
	playerPokemon: ActivePokemon,
	opponentPokemon: OpponentPokemon,
	playerParty: z.array(PartyMember),
	// Available actions: always all 8 GBC buttons
	availableActions: z.array(z.string()),
	// Context-specific hints keyed by button name
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

// ─── Unified Game State Sub-Schemas (Issue #13) ─────────────────────────────

export const PartyPokemonMoveSchema = z.object({
	name: z.string(),
	moveId: z.number(),
	pp: z.number(),
	maxPp: z.number(),
	type: z.string(),
	power: z.number(),
});
export type PartyPokemonMoveSchema = z.infer<typeof PartyPokemonMoveSchema>;

export const PartyPokemonSchema = z.object({
	species: z.string(),
	speciesId: z.number(),
	nickname: z.string(),
	level: z.number(),
	hp: z.number(),
	maxHp: z.number(),
	status: z.string(),
	moves: z.array(PartyPokemonMoveSchema),
	stats: z.object({
		attack: z.number(),
		defense: z.number(),
		speed: z.number(),
		specialAttack: z.number(),
		specialDefense: z.number(),
	}),
});
export type PartyPokemonSchema = z.infer<typeof PartyPokemonSchema>;

export const BattleActivePokemonSchema = PartyPokemonSchema.extend({
	types: z.array(z.string()),
});
export type BattleActivePokemonSchema = z.infer<typeof BattleActivePokemonSchema>;

export const BattleOpponentSchema = z.object({
	species: z.string(),
	level: z.number(),
	hp: z.number(),
	maxHp: z.number(),
	status: z.string(),
	types: z.array(z.string()),
	knownMoves: z.array(PartyPokemonMoveSchema),
	stats: z.object({
		attack: z.number(),
		defense: z.number(),
		speed: z.number(),
		specialAttack: z.number(),
		specialDefense: z.number(),
	}),
	trainerClass: z.number(),
	partyCount: z.number(),
});
export type BattleOpponentSchema = z.infer<typeof BattleOpponentSchema>;

export const StatModSchema = z.object({
	attack: z.number().min(-6).max(6),
	defense: z.number().min(-6).max(6),
	speed: z.number().min(-6).max(6),
	special: z.number().min(-6).max(6),
	accuracy: z.number().min(-6).max(6),
	evasion: z.number().min(-6).max(6),
});
export type StatModSchema = z.infer<typeof StatModSchema>;

export const InventoryItemSchema = z.object({
	itemId: z.number(),
	name: z.string(),
	quantity: z.number(),
});
export type InventoryItemSchema = z.infer<typeof InventoryItemSchema>;

export const MoveEffectivenessSchema = z.object({
	slot: z.number(),
	moveName: z.string(),
	effectiveness: z.number(),
});
export type MoveEffectivenessSchema = z.infer<typeof MoveEffectivenessSchema>;

// Tool: get_game_state (unified, all game phases)
export const GetGameStateOutput = z.object({
	// Core (always present)
	turn: z.number(),
	phase: z.enum(['overworld', 'battle', 'menu', 'dialogue']),
	secondsRemaining: z.number(),
	availableActions: z.array(GameActionSchema),

	// Player context (always present)
	player: z.object({
		name: z.string(),
		money: z.number(),
		badges: z.number(),
		badgeList: z.array(z.string()),
		location: z.object({
			mapId: z.number(),
			mapName: z.string(),
			x: z.number(),
			y: z.number(),
		}),
		direction: z.enum(['up', 'down', 'left', 'right']),
		walkBikeSurf: z.enum(['walking', 'biking', 'surfing']),
	}),

	// Party (always present)
	party: z.array(PartyPokemonSchema),

	// Inventory (always present)
	inventory: z.array(InventoryItemSchema),

	// Battle state (null when not in battle)
	battle: z
		.object({
			type: z.enum(['wild', 'trainer']),
			playerActive: BattleActivePokemonSchema,
			opponent: BattleOpponentSchema,
			moveEffectiveness: z.array(MoveEffectivenessSchema),
			statModifiers: z.object({
				player: StatModSchema,
				enemy: StatModSchema,
			}),
			battleStatus: z.object({
				playerFlags: z.array(z.string()),
				enemyFlags: z.array(z.string()),
			}),
			turnCount: z.number(),
		})
		.nullable(),

	// Overworld context (null in battle)
	overworld: z
		.object({
			tileInFront: z.object({ tileId: z.number(), description: z.string() }),
			hmAvailable: z.object({
				cut: z.boolean(),
				fly: z.boolean(),
				surf: z.boolean(),
				strength: z.boolean(),
				flash: z.boolean(),
			}),
			wildEncounterRate: z.number(),
		})
		.nullable(),

	// Screen state (always check these)
	screenText: z.string().nullable(),
	menuState: z
		.object({
			text: z.string(),
			currentItem: z.number(),
			maxItems: z.number(),
		})
		.nullable(),

	// Game progress
	progress: z.object({
		playTimeHours: z.number(),
		playTimeMinutes: z.number(),
		pokedexOwned: z.number(),
		pokedexSeen: z.number(),
	}),

	// Gamification (kept from existing)
	yourScore: z.number(),
	yourRank: z.number(),
	totalAgents: z.number(),
	streak: z.number(),
	tip: z.string(),
});
export type GetGameStateOutput = z.infer<typeof GetGameStateOutput>;

// Tool: submit_action
export const SubmitActionInput = z.object({
	action: GameActionSchema,
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
