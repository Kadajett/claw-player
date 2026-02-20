import type { Operation } from 'fast-json-patch';
import { z } from 'zod';

export type { Operation };

// ─── Pokemon Types ───────────────────────────────────────────────────────────

export enum PokemonType {
	Normal = 'normal',
	Fire = 'fire',
	Water = 'water',
	Electric = 'electric',
	Grass = 'grass',
	Ice = 'ice',
	Fighting = 'fighting',
	Poison = 'poison',
	Ground = 'ground',
	Flying = 'flying',
	Psychic = 'psychic',
	Bug = 'bug',
	Rock = 'rock',
	Ghost = 'ghost',
	Dragon = 'dragon',
}

export const pokemonTypeSchema = z.nativeEnum(PokemonType);

// ─── Status Conditions ────────────────────────────────────────────────────────

export enum StatusCondition {
	None = 'none',
	Burn = 'burn',
	Freeze = 'freeze',
	Paralysis = 'paralysis',
	Poison = 'poison',
	Sleep = 'sleep',
}

export const statusConditionSchema = z.nativeEnum(StatusCondition);

// ─── Move Category ────────────────────────────────────────────────────────────

export type MoveCategory = 'physical' | 'special' | 'status';

export const moveCategorySchema = z.enum(['physical', 'special', 'status']);

// ─── Move Data ────────────────────────────────────────────────────────────────

export type MoveData = {
	name: string;
	pokemonType: PokemonType;
	power: number;
	accuracy: number;
	pp: number;
	maxPp: number;
	category: MoveCategory;
};

export const moveDataSchema = z.object({
	name: z.string(),
	pokemonType: pokemonTypeSchema,
	power: z.number().int().min(0),
	accuracy: z.number().int().min(0).max(100),
	pp: z.number().int().min(0),
	maxPp: z.number().int().min(1),
	category: moveCategorySchema,
});

// ─── Pokemon State ────────────────────────────────────────────────────────────

export type PokemonState = {
	species: string;
	level: number;
	hp: number;
	maxHp: number;
	attack: number;
	defense: number;
	specialAttack: number;
	specialDefense: number;
	speed: number;
	status: StatusCondition;
	types: Array<PokemonType>;
	moves: Array<MoveData>;
};

export const pokemonStateSchema = z.object({
	species: z.string(),
	level: z.number().int().min(1).max(100),
	hp: z.number().int().min(0),
	maxHp: z.number().int().min(1),
	attack: z.number().int().min(1),
	defense: z.number().int().min(1),
	specialAttack: z.number().int().min(1),
	specialDefense: z.number().int().min(1),
	speed: z.number().int().min(1),
	status: statusConditionSchema,
	types: z.array(pokemonTypeSchema).min(1).max(2),
	moves: z.array(moveDataSchema).min(0).max(4),
});

// ─── Opponent State (minimal data for display) ────────────────────────────────

export type OpponentState = {
	species: string;
	hpPercent: number;
	status: StatusCondition;
	types: Array<PokemonType>;
	level: number;
};

export const opponentStateSchema = z.object({
	species: z.string(),
	hpPercent: z.number().min(0).max(100),
	status: statusConditionSchema,
	types: z.array(pokemonTypeSchema).min(1).max(2),
	level: z.number().int().min(1).max(100),
});

// ─── Battle Phase ─────────────────────────────────────────────────────────────

export enum BattlePhase {
	ChooseAction = 'choose_action',
	Executing = 'executing',
	Switching = 'switching',
	FaintedSwitch = 'fainted_switch',
	BattleOver = 'battle_over',
}

export const battlePhaseSchema = z.nativeEnum(BattlePhase);

// ─── Battle Action ────────────────────────────────────────────────────────────

export const VALID_MOVE_INDICES = [0, 1, 2, 3] as const;
export const VALID_SWITCH_INDICES = [0, 1, 2, 3, 4, 5] as const;

export type BattleAction = `move:${0 | 1 | 2 | 3}` | `switch:${0 | 1 | 2 | 3 | 4 | 5}` | 'run';

export const battleActionSchema = z.string().refine((val): val is BattleAction => {
	if (val === 'run') return true;
	const moveMatch = /^move:[0-3]$/.exec(val);
	if (moveMatch) return true;
	const switchMatch = /^switch:[0-5]$/.exec(val);
	return switchMatch !== null;
}, 'Invalid battle action');

// ─── Turn History Entry ───────────────────────────────────────────────────────

export type TurnHistoryEntry = {
	turn: number;
	action: BattleAction;
	description: string;
	totalVotes: number;
};

export const turnHistoryEntrySchema = z.object({
	turn: z.number().int().min(0),
	action: battleActionSchema,
	description: z.string(),
	totalVotes: z.number().int().min(0),
});

// ─── Battle State ─────────────────────────────────────────────────────────────

export type BattleState = {
	gameId: string;
	turn: number;
	phase: BattlePhase;
	playerActive: PokemonState;
	playerParty: Array<PokemonState>;
	opponent: OpponentState;
	availableActions: Array<BattleAction>;
	weather: string;
	turnHistory: Array<TurnHistoryEntry>;
	lastAction: BattleAction | null;
	createdAt: number;
	updatedAt: number;
};

export const battleStateSchema = z.object({
	gameId: z.string(),
	turn: z.number().int().min(0),
	phase: battlePhaseSchema,
	playerActive: pokemonStateSchema,
	playerParty: z.array(pokemonStateSchema).max(6),
	opponent: opponentStateSchema,
	availableActions: z.array(battleActionSchema),
	weather: z.string(),
	turnHistory: z.array(turnHistoryEntrySchema),
	lastAction: battleActionSchema.nullable(),
	createdAt: z.number().int().positive(),
	updatedAt: z.number().int().positive(),
});

// ─── Vote / VoteResult / TickResult ──────────────────────────────────────────

export type Vote = {
	agentId: string;
	action: BattleAction;
	tickId: number;
	gameId: string;
	timestamp: number;
};

export const voteSchema = z.object({
	agentId: z.string(),
	action: battleActionSchema,
	tickId: z.number().int().min(0),
	gameId: z.string(),
	timestamp: z.number().int().positive(),
});

export type VoteResult = {
	tickId: number;
	gameId: string;
	winningAction: BattleAction;
	voteCounts: Record<string, number>;
	totalVotes: number;
};

export const voteResultSchema = z.object({
	tickId: z.number().int().min(0),
	gameId: z.string(),
	winningAction: battleActionSchema,
	voteCounts: z.record(z.string(), z.number().int().min(0)),
	totalVotes: z.number().int().min(0),
});

export type TickResult = {
	tickId: number;
	gameId: string;
	voteResult: VoteResult;
	previousState: BattleState;
	newState: BattleState;
	description: string;
};

// ─── State Delta ──────────────────────────────────────────────────────────────

export type StateDelta = {
	turn: number;
	gameId: string;
	patches: Array<Operation>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const SNAPSHOT_INTERVAL = 10 as const;
export const VOTE_KEY_EXPIRY_SECONDS = 3600 as const;
export const DEFAULT_TICK_INTERVAL_MS = 15_000 as const;
export const DEFAULT_FALLBACK_ACTION: BattleAction = 'move:0';
