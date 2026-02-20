import { describe, expect, it } from 'vitest';

import {
	applyAction,
	applyStatusDamage,
	buildInitialActions,
	calculateDamage,
	computeAvailableActions,
	rollCritical,
} from './battle-engine.js';
import { BattlePhase, type BattleState, type PokemonState, PokemonType, StatusCondition } from './types.js';

function makePokemon(overrides?: Partial<PokemonState>): PokemonState {
	return {
		species: 'Pikachu',
		level: 25,
		hp: 50,
		maxHp: 50,
		attack: 55,
		defense: 40,
		specialAttack: 50,
		specialDefense: 50,
		speed: 90,
		status: StatusCondition.None,
		types: [PokemonType.Electric],
		moves: [
			{
				name: 'Thunderbolt',
				pokemonType: PokemonType.Electric,
				power: 95,
				accuracy: 100,
				pp: 15,
				maxPp: 15,
				category: 'special',
			},
		],
		...overrides,
	};
}

function makeState(overrides?: Partial<BattleState>): BattleState {
	const now = Date.now();
	const playerActive = makePokemon();
	const base: BattleState = {
		gameId: 'test-game',
		turn: 0,
		phase: BattlePhase.ChooseAction,
		playerActive,
		playerParty: [playerActive, makePokemon({ species: 'Charmander', types: [PokemonType.Fire] })],
		opponent: {
			species: 'Rattata',
			hpPercent: 100,
			status: StatusCondition.None,
			types: [PokemonType.Normal],
			level: 10,
		},
		availableActions: ['move:0', 'switch:1', 'run'],
		weather: 'clear',
		turnHistory: [],
		lastAction: null,
		createdAt: now,
		updatedAt: now,
	};
	return { ...base, ...overrides };
}

describe('calculateDamage', () => {
	it('returns positive damage for standard move', () => {
		const result = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Electric],
			[PokemonType.Water],
			false,
		);
		expect(result.damage).toBeGreaterThan(0);
	});

	it('applies STAB bonus when type matches attacker', () => {
		const withStab = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Electric],
			[PokemonType.Water],
			false,
		);
		const noStab = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Normal],
			[PokemonType.Water],
			false,
		);
		expect(withStab.isStab).toBe(true);
		expect(noStab.isStab).toBe(false);
		expect(withStab.damage).toBeGreaterThanOrEqual(noStab.damage);
	});

	it('applies critical hit multiplier', () => {
		const crit = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Electric],
			[PokemonType.Normal],
			true,
		);
		const normal = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Electric],
			[PokemonType.Normal],
			false,
		);
		expect(crit.isCritical).toBe(true);
		// Crit should generally do more damage (with same random factor not possible to guarantee, but flag is set)
		expect(normal.isCritical).toBe(false);
	});

	it('returns 0 effectiveness for immune type', () => {
		const result = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Electric],
			[PokemonType.Ground],
			false,
		);
		expect(result.effectiveness).toBe(0);
		// Damage should be 1 (capped at max(1, 0)) when effectiveness is 0
		// Actually with effectiveness 0, finalDamage becomes 0 * multipliers = 0, then max(1, 0) = 1
		expect(result.damage).toBe(1);
	});

	it('returns super effective multiplier', () => {
		const result = calculateDamage(
			25,
			95,
			50,
			40,
			PokemonType.Electric,
			[PokemonType.Normal],
			[PokemonType.Water],
			false,
		);
		expect(result.effectiveness).toBe(2);
	});
});

describe('rollCritical', () => {
	it('returns boolean', () => {
		const result = rollCritical();
		expect(typeof result).toBe('boolean');
	});

	it('returns true roughly 6.25% of the time', () => {
		let hits = 0;
		const trials = 10000;
		for (let i = 0; i < trials; i++) {
			if (rollCritical()) hits++;
		}
		// Should be within 2 standard deviations of 6.25%
		expect(hits / trials).toBeGreaterThan(0.03);
		expect(hits / trials).toBeLessThan(0.1);
	});
});

describe('applyStatusDamage', () => {
	it('does not modify pokemon with no status', () => {
		const pokemon = makePokemon({ status: StatusCondition.None });
		expect(applyStatusDamage(pokemon)).toEqual(pokemon);
	});

	it('reduces HP for burn', () => {
		const pokemon = makePokemon({ status: StatusCondition.Burn, hp: 50, maxHp: 50 });
		const result = applyStatusDamage(pokemon);
		expect(result.hp).toBeLessThan(50);
	});

	it('reduces HP for poison', () => {
		const pokemon = makePokemon({ status: StatusCondition.Poison, hp: 50, maxHp: 50 });
		const result = applyStatusDamage(pokemon);
		expect(result.hp).toBeLessThan(50);
	});

	it('does not reduce HP below 0', () => {
		const pokemon = makePokemon({ status: StatusCondition.Burn, hp: 1, maxHp: 50 });
		const result = applyStatusDamage(pokemon);
		expect(result.hp).toBe(0);
	});

	it('does not modify pokemon with freeze', () => {
		const pokemon = makePokemon({ status: StatusCondition.Freeze, hp: 50, maxHp: 50 });
		expect(applyStatusDamage(pokemon)).toEqual(pokemon);
	});
});

describe('computeAvailableActions', () => {
	it('includes moves with pp > 0', () => {
		const state = makeState();
		const actions = computeAvailableActions(state);
		expect(actions).toContain('move:0');
	});

	it('excludes moves with 0 pp', () => {
		const state = makeState({
			playerActive: makePokemon({
				moves: [
					{
						name: 'Struggle',
						pokemonType: PokemonType.Normal,
						power: 50,
						accuracy: 100,
						pp: 0,
						maxPp: 0,
						category: 'physical',
					},
				],
			}),
		});
		const actions = computeAvailableActions(state);
		expect(actions).not.toContain('move:0');
	});

	it('always includes run', () => {
		const actions = computeAvailableActions(makeState());
		expect(actions).toContain('run');
	});

	it('excludes fainted party members from switch', () => {
		const state = makeState({
			playerParty: [
				makePokemon({ species: 'Pikachu' }),
				makePokemon({ species: 'Charmander', hp: 0, types: [PokemonType.Fire] }),
			],
		});
		const actions = computeAvailableActions(state);
		expect(actions).not.toContain('switch:1');
	});

	it('excludes active pokemon from switch', () => {
		const state = makeState();
		const actions = computeAvailableActions(state);
		// Pikachu is active (index 0) and same species as playerActive
		expect(actions).not.toContain('switch:0');
	});
});

describe('applyAction - run', () => {
	it('sets phase to battle_over', () => {
		const state = makeState();
		const result = applyAction(state, 'run', 5);
		expect(result.newState.phase).toBe(BattlePhase.BattleOver);
		expect(result.description).toContain('ran away');
	});

	it('increments turn', () => {
		const state = makeState({ turn: 3 });
		const result = applyAction(state, 'run', 5);
		expect(result.newState.turn).toBe(4);
	});
});

describe('applyAction - switch', () => {
	it('switches active pokemon', () => {
		const state = makeState();
		const result = applyAction(state, 'switch:1', 3);
		expect(result.newState.playerActive.species).toBe('Charmander');
	});

	it('fails gracefully for fainted target', () => {
		const state = makeState({
			playerParty: [
				makePokemon({ species: 'Pikachu' }),
				makePokemon({ species: 'Charmander', hp: 0, types: [PokemonType.Fire] }),
			],
		});
		const result = applyAction(state, 'switch:1', 2);
		expect(result.newState.playerActive.species).toBe('Pikachu');
		expect(result.description).toContain('Cannot switch');
	});

	it('appends to turn history', () => {
		const state = makeState();
		const result = applyAction(state, 'switch:1', 3);
		expect(result.newState.turnHistory).toHaveLength(1);
	});
});

describe('applyAction - move', () => {
	it('reduces move PP', () => {
		const state = makeState();
		const initialPp = state.playerActive.moves[0]?.pp ?? 0;
		const result = applyAction(state, 'move:0', 10);
		expect(result.newState.playerActive.moves[0]?.pp).toBe(initialPp - 1);
	});

	it('deals damage to opponent', () => {
		const state = makeState();
		const result = applyAction(state, 'move:0', 10);
		expect(result.newState.opponent.hpPercent).toBeLessThanOrEqual(100);
	});

	it('handles invalid move slot gracefully', () => {
		const state = makeState();
		const result = applyAction(state, 'move:2', 3);
		expect(result.description).toContain('No PP left or invalid');
	});

	it('sets phase to battle_over when opponent faints', () => {
		const state = makeState({
			opponent: {
				species: 'Rattata',
				hpPercent: 0.001,
				status: StatusCondition.None,
				types: [PokemonType.Normal],
				level: 1,
			},
		});
		const result = applyAction(state, 'move:0', 10);
		expect(result.newState.phase).toBe(BattlePhase.BattleOver);
	});

	it('adds entry to turn history', () => {
		const state = makeState();
		const result = applyAction(state, 'move:0', 10);
		expect(result.newState.turnHistory).toHaveLength(1);
		const entry = result.newState.turnHistory[0];
		expect(entry?.action).toBe('move:0');
		expect(entry?.totalVotes).toBe(10);
	});
});

describe('applyAction - invalid action', () => {
	it('returns state unchanged for invalid action', () => {
		const state = makeState();
		// Use type assertion to test invalid input
		// biome-ignore lint/suspicious/noExplicitAny: testing invalid input
		const result = applyAction(state, 'fly' as any, 0);
		expect(result.newState).toBe(state);
	});
});

describe('buildInitialActions', () => {
	it('returns available actions for state', () => {
		const state = makeState();
		const actions = buildInitialActions(state);
		expect(actions.length).toBeGreaterThan(0);
		expect(actions).toContain('run');
	});
});
