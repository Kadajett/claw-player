import { getCombinedEffectiveness } from './type-chart.js';
import {
	type BattleAction,
	BattlePhase,
	type BattleState,
	battleActionSchema,
	type GameAction,
	type PokemonState,
	StatusCondition,
	type TurnHistoryEntry,
} from './types.js';

// Gen 1 damage formula constants
const GEN1_RANDOM_MIN = 217;
const GEN1_RANDOM_MAX = 255;
const BASE_CRIT_CHANCE = 0.0625; // ~6.25%
const STAB_MULTIPLIER = 1.5;
const STATUS_DAMAGE_FRACTION = 16; // 1/16 HP per turn

export type DamageResult = {
	damage: number;
	effectiveness: number;
	isCritical: boolean;
	isStab: boolean;
};

export type ActionResult = {
	newState: BattleState;
	description: string;
};

export function calculateDamage(
	attackerLevel: number,
	movePower: number,
	attackStat: number,
	defenseStat: number,
	moveType: import('./types.js').PokemonType,
	attackerTypes: Array<import('./types.js').PokemonType>,
	defenderTypes: Array<import('./types.js').PokemonType>,
	isCritical: boolean,
): DamageResult {
	// Gen 1 formula: floor(floor((2*L/5+2) * Power * A/D) / 50) + 2
	const levelFactor = Math.floor((2 * attackerLevel) / 5 + 2);
	let baseDamage = Math.floor((levelFactor * movePower * attackStat) / defenseStat);
	baseDamage = Math.floor(baseDamage / 50) + 2;

	const isStab = attackerTypes.includes(moveType);
	const stabMultiplier = isStab ? STAB_MULTIPLIER : 1;
	const effectiveness = getCombinedEffectiveness(moveType, defenderTypes);

	const critMultiplier = isCritical ? 2 : 1;
	const randomFactor =
		(GEN1_RANDOM_MIN + Math.floor(Math.random() * (GEN1_RANDOM_MAX - GEN1_RANDOM_MIN + 1))) / GEN1_RANDOM_MAX;

	const finalDamage = Math.max(
		1,
		Math.floor(baseDamage * stabMultiplier * effectiveness * critMultiplier * randomFactor),
	);

	return { damage: finalDamage, effectiveness, isCritical, isStab };
}

export function rollCritical(): boolean {
	return Math.random() < BASE_CRIT_CHANCE;
}

export function parseAction(
	action: string,
): { type: 'move'; index: number } | { type: 'switch'; index: number } | { type: 'run' } | null {
	const parsed = battleActionSchema.safeParse(action);
	if (!parsed.success) return null;

	if (parsed.data === 'run') return { type: 'run' };

	const moveMatch = /^move:([0-3])$/.exec(parsed.data);
	if (moveMatch?.[1] !== undefined) {
		return { type: 'move', index: Number.parseInt(moveMatch[1], 10) };
	}

	const switchMatch = /^switch:([0-5])$/.exec(parsed.data);
	if (switchMatch?.[1] !== undefined) {
		return { type: 'switch', index: Number.parseInt(switchMatch[1], 10) };
	}

	return null;
}

export function applyStatusDamage(pokemon: PokemonState): PokemonState {
	if (pokemon.status !== StatusCondition.Burn && pokemon.status !== StatusCondition.Poison) {
		return pokemon;
	}
	const statusDamage = Math.max(1, Math.floor(pokemon.maxHp / STATUS_DAMAGE_FRACTION));
	const newHp = Math.max(0, pokemon.hp - statusDamage);
	return { ...pokemon, hp: newHp };
}

export function computeAvailableActions(state: BattleState): Array<GameAction> {
	const actions: Array<BattleAction> = [];

	state.playerActive.moves.forEach((move, i) => {
		if (move.pp > 0) {
			const idx = i as 0 | 1 | 2 | 3;
			actions.push(`move:${idx}`);
		}
	});

	state.playerParty.forEach((pokemon, i) => {
		if (pokemon.hp > 0 && pokemon.species !== state.playerActive.species && i <= 5) {
			const idx = i as 0 | 1 | 2 | 3 | 4 | 5;
			actions.push(`switch:${idx}`);
		}
	});

	actions.push('run');
	return (actions.length > 0 ? actions : ['move:0']) as unknown as Array<GameAction>;
}

function applyRunAction(state: BattleState, action: BattleAction): ActionResult {
	return {
		newState: {
			...state,
			phase: BattlePhase.BattleOver,
			lastAction: action,
			availableActions: [] as Array<GameAction>,
		},
		description: 'The trainer ran away!',
	};
}

function applySwitchAction(state: BattleState, action: BattleAction, index: number): ActionResult {
	const switchTarget = state.playerParty[index];
	if (!switchTarget || switchTarget.hp <= 0) {
		return { newState: state, description: 'Cannot switch to that Pokemon (fainted or invalid)' };
	}
	const newState = {
		...state,
		playerActive: switchTarget,
		phase: BattlePhase.ChooseAction,
		lastAction: action,
		availableActions: [] as Array<GameAction>,
	};
	return {
		newState: { ...newState, availableActions: computeAvailableActions(newState) },
		description: `Go, ${switchTarget.species}!`,
	};
}

function buildEffectivenessText(effectiveness: number): string {
	if (effectiveness === 0) return " It doesn't affect the opponent!";
	if (effectiveness >= 2) return " It's super effective!";
	if (effectiveness <= 0.5) return " It's not very effective...";
	return '';
}

function applyPostMovePhase(state: BattleState, opponentFainted: boolean): BattleState {
	const afterStatus = { ...state, playerActive: applyStatusDamage(state.playerActive) };
	if (afterStatus.playerActive.hp > 0 || opponentFainted) {
		return { ...afterStatus, availableActions: computeAvailableActions(afterStatus) };
	}
	const hasHealthy = afterStatus.playerParty.some((p) => p.hp > 0 && p.species !== afterStatus.playerActive.species);
	const phase = hasHealthy ? BattlePhase.FaintedSwitch : BattlePhase.BattleOver;
	return { ...afterStatus, phase, availableActions: computeAvailableActions({ ...afterStatus, phase }) };
}

function applyMoveAction(state: BattleState, action: BattleAction, index: number): ActionResult {
	const move = state.playerActive.moves[index];
	if (!move || move.pp <= 0) {
		return { newState: state, description: 'No PP left or invalid move slot' };
	}

	const updatedMoves = state.playerActive.moves.map((m, i) => (i === index ? { ...m, pp: m.pp - 1 } : m));
	const attackerWithReducedPp: PokemonState = { ...state.playerActive, moves: updatedMoves };

	const attackStat = move.category === 'special' ? state.playerActive.specialAttack : state.playerActive.attack;
	const defenseStat = Math.max(1, Math.floor(state.opponent.level * 1.3 + 15));
	const isCrit = rollCritical();

	const dmgResult = calculateDamage(
		state.playerActive.level,
		move.power,
		attackStat,
		defenseStat,
		move.pokemonType,
		state.playerActive.types,
		state.opponent.types,
		isCrit,
	);

	const newOpponentHpPercent = Math.max(
		0,
		state.opponent.hpPercent - (dmgResult.damage / (state.opponent.level * 2)) * 100,
	);
	const opponentFainted = newOpponentHpPercent <= 0;
	const effectivenessText = buildEffectivenessText(dmgResult.effectiveness);
	const critText = isCrit ? ' A critical hit!' : '';
	const description = `${state.playerActive.species} used ${move.name}!${effectivenessText}${critText}`;

	const midState: BattleState = {
		...state,
		playerActive: attackerWithReducedPp,
		opponent: { ...state.opponent, hpPercent: newOpponentHpPercent },
		phase: opponentFainted ? BattlePhase.BattleOver : BattlePhase.ChooseAction,
		lastAction: action,
	};

	return { newState: applyPostMovePhase(midState, opponentFainted), description };
}

export function applyAction(state: BattleState, action: BattleAction, totalVotes: number): ActionResult {
	const parsed = parseAction(action);
	if (!parsed) {
		return { newState: state, description: 'Invalid action' };
	}

	const now = Date.now();
	const baseState: BattleState = { ...state, updatedAt: now };

	let result: ActionResult;
	if (parsed.type === 'run') {
		result = applyRunAction(baseState, action);
	} else if (parsed.type === 'switch') {
		result = applySwitchAction(baseState, action, parsed.index);
	} else {
		result = applyMoveAction(baseState, action, parsed.index);
	}

	const historyEntry: TurnHistoryEntry = {
		turn: state.turn,
		action,
		description: result.description,
		totalVotes,
	};

	return {
		...result,
		newState: {
			...result.newState,
			turn: state.turn + 1,
			turnHistory: [...state.turnHistory, historyEntry].slice(-20),
		},
	};
}

export function buildInitialActions(state: BattleState): Array<GameAction> {
	return computeAvailableActions(state);
}
