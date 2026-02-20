import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { checkRateLimit } from '../auth/rate-limiter.js';
import { PLAN_BURST } from '../types/api.js';
import type { ApiKeyMetadata } from '../types/api.js';
import type {
	GameStateService,
	GetBattleStateOutput,
	GetHistoryOutput,
	GetRateLimitOutput,
	SubmitActionOutput,
} from '../types/mcp.js';
import type { StateManager } from './state.js';
import { getCombinedEffectiveness } from './type-chart.js';
import { BattlePhase } from './types.js';
import type { BattleState } from './types.js';
import type { VoteAggregator } from './vote-aggregator.js';

export type GameStateServiceOptions = {
	redis: Redis;
	stateManager: StateManager;
	voteAggregator: VoteAggregator;
	logger: Logger;
	gameId: string;
	tickIntervalMs: number;
};

export class LiveGameStateService implements GameStateService {
	private readonly redis: Redis;
	private readonly stateManager: StateManager;
	private readonly voteAggregator: VoteAggregator;
	private readonly logger: Logger;
	private readonly gameId: string;
	private readonly tickIntervalMs: number;

	private tickStartedAt: number = Date.now();

	constructor(options: GameStateServiceOptions) {
		this.redis = options.redis;
		this.stateManager = options.stateManager;
		this.voteAggregator = options.voteAggregator;
		this.logger = options.logger;
		this.gameId = options.gameId;
		this.tickIntervalMs = options.tickIntervalMs;
	}

	resetTickTimer(): void {
		this.tickStartedAt = Date.now();
	}

	async getBattleState(agentId: string): Promise<GetBattleStateOutput> {
		const state = await this.stateManager.loadState(this.gameId);
		if (!state) {
			throw new Error('No active game state');
		}

		return this.transformBattleState(state, agentId);
	}

	async submitAction(agentId: string, action: string): Promise<SubmitActionOutput> {
		const state = await this.stateManager.loadState(this.gameId);
		if (!state) {
			throw new Error('No active game state');
		}

		const tickId = state.turn;

		await this.voteAggregator.recordVote(this.gameId, tickId, action as import('./types.js').BattleAction);

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

	async getHistory(_agentId: string, limit: number, _includeLeaderboard: boolean): Promise<GetHistoryOutput> {
		const state = await this.stateManager.loadState(this.gameId);

		const rounds = (state?.turnHistory ?? []).slice(-limit).map((entry) => ({
			turn: entry.turn,
			winningAction: entry.action,
			actionCounts: {} as Record<string, number>,
			outcome: entry.description,
			yourAction: undefined,
			yourPoints: 1,
			timestamp: new Date(state?.updatedAt ?? Date.now()).toISOString(),
		}));

		return {
			rounds,
			leaderboard: [],
			yourStats: {
				totalTurns: state?.turn ?? 0,
				wins: 0,
				winRate: 0,
				bestStreak: 0,
				totalScore: 0,
				rank: 1,
			},
		};
	}

	private transformBattleState(state: BattleState, _agentId: string): GetBattleStateOutput {
		const elapsed = Date.now() - this.tickStartedAt;
		const secondsRemaining = Math.max(0, Math.floor((this.tickIntervalMs - elapsed) / 1000));

		const phaseMap = new Map<BattlePhase, 'voting' | 'executing' | 'idle'>([
			[BattlePhase.ChooseAction, 'voting'],
			[BattlePhase.Executing, 'executing'],
			[BattlePhase.Switching, 'executing'],
			[BattlePhase.FaintedSwitch, 'voting'],
			[BattlePhase.BattleOver, 'idle'],
		]);

		const typeMatchups: Record<string, number> = {};
		for (let i = 0; i < state.playerActive.moves.length; i++) {
			const move = state.playerActive.moves[i];
			if (move && move.pp > 0) {
				const effectiveness = getCombinedEffectiveness(move.pokemonType, state.opponent.types);
				typeMatchups[`move:${i}`] = effectiveness;
			}
		}

		return {
			turn: state.turn,
			phase: phaseMap.get(state.phase) ?? 'idle',
			secondsRemaining,
			isPlayerTurn: state.phase === 'choose_action' || state.phase === 'fainted_switch',
			weather: state.weather || null,
			playerPokemon: {
				name: state.playerActive.species,
				species: state.playerActive.species,
				level: state.playerActive.level,
				currentHp: state.playerActive.hp,
				maxHp: state.playerActive.maxHp,
				hpPercent: Math.round((state.playerActive.hp / state.playerActive.maxHp) * 100),
				status: state.playerActive.status === 'none' ? null : state.playerActive.status,
				types: state.playerActive.types,
				moves: state.playerActive.moves.map((m, i) => ({
					index: i,
					name: m.name,
					type: m.pokemonType,
					pp: m.pp,
					maxPp: m.maxPp,
					power: m.power > 0 ? m.power : null,
					accuracy: m.accuracy > 0 ? m.accuracy : null,
					category: m.category,
					disabled: m.pp <= 0,
				})),
			},
			opponentPokemon: {
				name: state.opponent.species,
				species: state.opponent.species,
				level: state.opponent.level,
				currentHp: Math.round((state.opponent.hpPercent / 100) * (state.opponent.level * 3 + 10)),
				maxHp: state.opponent.level * 3 + 10,
				hpPercent: Math.round(state.opponent.hpPercent),
				status: state.opponent.status === 'none' ? null : state.opponent.status,
				types: state.opponent.types,
			},
			playerParty: state.playerParty.map((p, i) => ({
				partyIndex: i,
				name: p.species,
				species: p.species,
				currentHp: p.hp,
				maxHp: p.maxHp,
				hpPercent: Math.round((p.hp / p.maxHp) * 100),
				status: p.status === 'none' ? null : p.status,
				types: p.types,
				fainted: p.hp <= 0,
				isActive: p.species === state.playerActive.species,
			})),
			availableActions: state.availableActions,
			typeMatchups,
			yourScore: 0,
			yourRank: 1,
			totalAgents: 1,
			streak: 0,
			achievementsPending: [],
			leaderboard: [],
			nextBonusRoundIn: 10,
			tip: this.generateTip(state, typeMatchups),
		};
	}

	private generateTip(state: BattleState, typeMatchups: Record<string, number>): string {
		const bestMove = Object.entries(typeMatchups)
			.filter(([, eff]) => eff > 1)
			.sort(([, a], [, b]) => b - a)[0];

		if (bestMove) {
			const moveIndex = Number.parseInt(bestMove[0].split(':')[1] ?? '0', 10);
			const move = state.playerActive.moves[moveIndex];
			if (move) {
				return `${move.name} is super effective (${bestMove[1]}x) against ${state.opponent.species}!`;
			}
		}

		const hpPercent = (state.playerActive.hp / state.playerActive.maxHp) * 100;
		if (hpPercent < 25) {
			return `Your ${state.playerActive.species} is low on HP. Consider switching.`;
		}

		return `Pick the move with the highest power against ${state.opponent.species}.`;
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
