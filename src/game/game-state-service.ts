import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { checkRateLimit } from '../auth/rate-limiter.js';
import { PLAN_BURST } from '../types/api.js';
import type { ApiKeyMetadata } from '../types/api.js';
import type {
	GameStateService,
	GetBattleStateOutput,
	GetGameStateOutput,
	GetHistoryOutput,
	GetRateLimitOutput,
	SubmitActionOutput,
} from '../types/mcp.js';
import type { GameBoyEmulator } from './emulator-interface.js';
import type {
	ActiveBattlePokemon,
	OpponentBattlePokemon,
	StatModifiers,
	UnifiedBattleState,
	UnifiedGameState,
} from './memory-map.js';
import { extractUnifiedGameState } from './memory-map.js';
import { GamePhase } from './types.js';
import type { GameAction } from './types.js';
import type { VoteAggregator } from './vote-aggregator.js';

/** All 8 GBC buttons, always available. */
const ALL_GAME_ACTIONS: Array<GameAction> = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];

export type AgentScore = {
	score: number;
	rank: number;
	totalAgents: number;
	streak: number;
};

export type TickInfo = {
	secondsRemaining: number;
};

export type GameStateServiceOptions = {
	redis: Redis;
	voteAggregator: VoteAggregator;
	logger: Logger;
	gameId: string;
	tickIntervalMs: number;
	emulator: GameBoyEmulator;
	getCurrentTick?: () => number;
};

/**
 * Convert RAM stat modifier values (1-13, 7=neutral) to API values (-6 to +6, 0=neutral).
 */
export function transformStatMods(raw: StatModifiers): {
	attack: number;
	defense: number;
	speed: number;
	special: number;
	accuracy: number;
	evasion: number;
} {
	return {
		attack: raw.attack - 7,
		defense: raw.defense - 7,
		speed: raw.speed - 7,
		special: raw.special - 7,
		accuracy: raw.accuracy - 7,
		evasion: raw.evasion - 7,
	};
}

/**
 * Transform a UnifiedBattleState.playerActive into the BattleActivePokemonSchema shape.
 */
function transformBattleActive(
	active: ActiveBattlePokemon,
): GetGameStateOutput['battle'] extends infer B ? (B extends { playerActive: infer P } ? P : never) : never {
	return {
		species: active.species,
		speciesId: 0,
		nickname: active.species,
		level: active.level,
		hp: active.hp,
		maxHp: active.maxHp,
		status: String(active.status),
		moves: active.moves.map((m) => ({
			name: m.name,
			moveId: 0,
			pp: m.pp,
			maxPp: m.maxPp,
			type: String(m.pokemonType),
			power: m.power,
		})),
		stats: {
			attack: active.battleStats.attack,
			defense: active.battleStats.defense,
			speed: active.battleStats.speed,
			specialAttack: active.battleStats.special,
			specialDefense: active.battleStats.special,
		},
		types: active.types.map(String),
	};
}

/**
 * Transform a UnifiedBattleState.opponent into the BattleOpponentSchema shape.
 */
function transformOpponent(
	opp: OpponentBattlePokemon,
): GetGameStateOutput['battle'] extends infer B ? (B extends { opponent: infer O } ? O : never) : never {
	return {
		species: opp.species,
		level: opp.level,
		hp: opp.hp,
		maxHp: opp.maxHp,
		status: String(opp.status),
		types: opp.types.map(String),
		knownMoves: opp.knownMoves.map((m) => ({
			name: m.name,
			moveId: 0,
			pp: m.pp,
			maxPp: m.maxPp,
			type: String(m.pokemonType),
			power: m.power,
		})),
		stats: {
			attack: opp.battleStats.attack,
			defense: opp.battleStats.defense,
			speed: opp.battleStats.speed,
			specialAttack: opp.battleStats.special,
			specialDefense: opp.battleStats.special,
		},
		trainerClass: opp.trainerClass,
		partyCount: opp.partyCount,
	};
}

/**
 * Map GamePhase to the API phase enum.
 * Cutscene maps to 'dialogue' since it's the closest equivalent.
 */
function mapPhase(phase: GamePhase): 'overworld' | 'battle' | 'menu' | 'dialogue' {
	switch (phase) {
		case GamePhase.Overworld:
			return 'overworld';
		case GamePhase.Battle:
			return 'battle';
		case GamePhase.Menu:
			return 'menu';
		case GamePhase.Dialogue:
			return 'dialogue';
		case GamePhase.Cutscene:
			return 'dialogue';
		default:
			return 'overworld';
	}
}

/**
 * Generate a phase-aware tip based on the current unified game state.
 */
export function generateTip(raw: UnifiedGameState): string {
	if (raw.battle) {
		return generateBattleTip(raw.battle);
	}

	if (raw.phase === GamePhase.Overworld && raw.overworld) {
		return generateOverworldTip(raw);
	}

	if (raw.phase === GamePhase.Menu) {
		return 'Navigate the menu with up/down, select with A, go back with B.';
	}

	if (raw.phase === GamePhase.Dialogue || raw.phase === GamePhase.Cutscene) {
		return 'Press A to advance the dialogue, or B to try to skip.';
	}

	return 'Look around and explore. Press A to interact, START for the menu.';
}

function generateBattleTip(battle: UnifiedBattleState): string {
	const bestMove = battle.moveEffectiveness
		.filter((e) => e.effectiveness > 1)
		.sort((a, b) => b.effectiveness - a.effectiveness)[0];

	if (bestMove) {
		return `${bestMove.moveName} is super effective (${bestMove.effectiveness}x) against ${battle.opponent.species}!`;
	}

	const hpPercent = battle.playerActive.maxHp > 0 ? (battle.playerActive.hp / battle.playerActive.maxHp) * 100 : 0;
	if (hpPercent < 25) {
		return `Your ${battle.playerActive.species} is low on HP. Consider switching or using a potion.`;
	}

	return `Pick the move with the highest power against ${battle.opponent.species}.`;
}

function generateOverworldTip(raw: UnifiedGameState): string {
	if (!raw.overworld) {
		return 'Explore the area. Press A to interact with objects and NPCs.';
	}

	const hm = raw.overworld.hmAvailable;
	if (hm.cut) return 'You can use Cut here! Walk up to a tree and press A.';
	if (hm.surf) return 'You can Surf here! Face the water and press A.';
	if (hm.flash) return "It's dark. You can use Flash to light up the cave.";

	if (raw.overworld.wildEncounterRate > 100) {
		return 'High wild encounter rate here. Be ready for battles!';
	}

	return 'Explore the area. Press A to interact with objects and NPCs.';
}

/**
 * Transform a UnifiedGameState into the API-facing GetGameStateOutput.
 */
export function transformGameState(
	raw: UnifiedGameState,
	agentScore: AgentScore,
	tickInfo: TickInfo,
): GetGameStateOutput {
	return {
		turn: raw.turn,
		phase: mapPhase(raw.phase),
		secondsRemaining: tickInfo.secondsRemaining,
		availableActions: ALL_GAME_ACTIONS,

		player: {
			name: raw.player.name,
			money: raw.player.money,
			badges: raw.player.badges,
			badgeList: raw.player.badgeList,
			location: raw.player.location,
			direction: raw.player.direction,
			walkBikeSurf: raw.player.walkBikeSurf,
		},

		party: raw.party.map((p) => ({
			species: p.species,
			speciesId: p.speciesId,
			nickname: p.nickname,
			level: p.level,
			hp: p.hp,
			maxHp: p.maxHp,
			status: p.status,
			moves: p.moves.map((m) => ({
				name: m.name,
				moveId: m.moveId,
				pp: m.pp,
				maxPp: m.maxPp,
				type: m.type,
				power: m.power,
			})),
			stats: p.stats,
		})),

		inventory: raw.inventory.map((item) => ({
			itemId: item.itemId,
			name: item.name,
			quantity: item.quantity,
		})),

		battle: raw.battle
			? {
					type: raw.battle.type,
					playerActive: transformBattleActive(raw.battle.playerActive),
					opponent: transformOpponent(raw.battle.opponent),
					moveEffectiveness: raw.battle.moveEffectiveness.map((e, slot) => ({
						slot,
						moveName: e.moveName,
						effectiveness: e.effectiveness,
					})),
					statModifiers: {
						player: transformStatMods(raw.battle.statModifiers.player),
						enemy: transformStatMods(raw.battle.statModifiers.enemy),
					},
					battleStatus: raw.battle.battleStatus,
					turnCount: raw.battle.turnCount,
				}
			: null,

		overworld: raw.overworld
			? {
					tileInFront: raw.overworld.tileInFront,
					hmAvailable: raw.overworld.hmAvailable,
					wildEncounterRate: raw.overworld.wildEncounterRate,
				}
			: null,

		screenText: raw.screen.screenText,
		menuState: raw.screen.menuState
			? {
					text: raw.screen.menuText ?? '',
					currentItem: raw.screen.menuState.currentItem,
					maxItems: raw.screen.menuState.maxItems,
				}
			: null,

		progress: {
			playTimeHours: raw.progress.playTimeHours,
			playTimeMinutes: raw.progress.playTimeMinutes,
			pokedexOwned: raw.progress.pokedexOwned,
			pokedexSeen: raw.progress.pokedexSeen,
		},

		yourScore: agentScore.score,
		yourRank: agentScore.rank,
		totalAgents: agentScore.totalAgents,
		streak: agentScore.streak,
		tip: generateTip(raw),
	};
}

export class LiveGameStateService implements GameStateService {
	private readonly redis: Redis;
	private readonly voteAggregator: VoteAggregator;
	private readonly logger: Logger;
	private readonly gameId: string;
	private readonly tickIntervalMs: number;
	private readonly emulator: GameBoyEmulator;
	private readonly getCurrentTickFn: (() => number) | null;

	private tickStartedAt: number = Date.now();

	constructor(options: GameStateServiceOptions) {
		this.redis = options.redis;
		this.voteAggregator = options.voteAggregator;
		this.logger = options.logger;
		this.gameId = options.gameId;
		this.tickIntervalMs = options.tickIntervalMs;
		this.emulator = options.emulator;
		this.getCurrentTickFn = options.getCurrentTick ?? null;
	}

	resetTickTimer(): void {
		this.tickStartedAt = Date.now();
	}

	async getGameState(agentId: string): Promise<GetGameStateOutput> {
		if (!this.emulator.isInitialized) {
			throw new Error('Game not initialized');
		}

		const ram = await this.emulator.getRAM();

		// Get the current turn from unified state in Redis, or 0
		const turn = await this.getCurrentTurn();

		const raw = extractUnifiedGameState(Array.from(ram), this.gameId, turn);

		const elapsed = Date.now() - this.tickStartedAt;
		const secondsRemaining = Math.max(0, Math.floor((this.tickIntervalMs - elapsed) / 1000));

		const agentScore = await this.getAgentScore(agentId);

		return transformGameState(raw, agentScore, { secondsRemaining });
	}

	/** @deprecated Use getGameState() instead. */
	async getBattleState(_agentId: string): Promise<GetBattleStateOutput> {
		throw new Error('getBattleState is deprecated. Use getGameState() instead.');
	}

	async submitAction(agentId: string, action: string): Promise<SubmitActionOutput> {
		const tickId = await this.getCurrentTurn();

		await this.voteAggregator.recordVote(this.gameId, tickId, agentId, action as import('./types.js').GameAction);

		this.logger.info({ agentId, action, tickId }, 'Vote submitted via MCP');

		const agentMeta = await this.getAgentMetadata(agentId);
		const remaining = agentMeta
			? (
					await checkRateLimit(
						this.redis,
						agentId,
						agentMeta.rpsLimit,
						PLAN_BURST[agentMeta.plan] ?? agentMeta.rpsLimit * 2,
					)
				).remaining
			: 0;

		return {
			success: true,
			outcome: `Vote recorded: ${action} for tick ${tickId}. Democracy decides at tick end.`,
			pointsEarned: 1,
			newScore: 0,
			newRank: 1,
			rankChange: '0',
			achievementsUnlocked: [],
			rateLimitRemaining: remaining,
		};
	}

	async getRateLimit(agentId: string): Promise<GetRateLimitOutput> {
		const agentMeta = await this.getAgentMetadata(agentId);
		const rps = agentMeta?.rpsLimit ?? 5;
		const burst = agentMeta ? (PLAN_BURST[agentMeta.plan] ?? rps * 2) : 8;

		const result = await checkRateLimit(this.redis, agentId, rps, burst);

		return {
			requestsRemaining: result.remaining,
			requestsPerSecond: rps,
			burstCapacity: burst,
			resetAt: new Date(Date.now() + 1000).toISOString(),
			windowSeconds: 1,
		};
	}

	async getHistory(_agentId: string, _limit: number, _includeLeaderboard: boolean): Promise<GetHistoryOutput> {
		const turn = await this.getCurrentTurn();

		return {
			rounds: [],
			leaderboard: [],
			yourStats: {
				totalTurns: turn,
				wins: 0,
				winRate: 0,
				bestStreak: 0,
				totalScore: 0,
				rank: 1,
			},
		};
	}

	private async getCurrentTurn(): Promise<number> {
		// Prefer the live tick counter from the tick processor (the pending tick).
		// Falling back to Redis reads the LAST COMPLETED tick, which is always
		// one behind and causes votes to be recorded for an already-processed tick.
		if (this.getCurrentTickFn) {
			return this.getCurrentTickFn();
		}
		const raw = await this.redis.get(`game:state:${this.gameId}`);
		if (!raw) return 0;
		try {
			const parsed = JSON.parse(raw) as { turn?: number };
			return parsed.turn ?? 0;
		} catch {
			return 0;
		}
	}

	private async getAgentScore(_agentId: string): Promise<AgentScore> {
		// TODO: Fetch real scores from Redis leaderboard
		return {
			score: 0,
			rank: 1,
			totalAgents: 1,
			streak: 0,
		};
	}

	private async getAgentMetadata(agentId: string): Promise<ApiKeyMetadata | null> {
		const keys = await this.redis.keys('api-key:*');
		for (const key of keys) {
			const data = await this.redis.hgetall(key);
			// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
			if (data['agentId'] === agentId) {
				return {
					agentId,
					// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
					plan: (data['plan'] as 'free' | 'standard' | 'premium') ?? 'free',
					// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
					rpsLimit: Number(data['rpsLimit']) || 5,
					// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
					createdAt: Number(data['createdAt']) || Date.now(),
				};
			}
		}
		return null;
	}
}

export function createGameStateService(options: GameStateServiceOptions): LiveGameStateService {
	return new LiveGameStateService(options);
}
