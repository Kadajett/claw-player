import { describe, expect, it } from 'vitest';

import { getCombinedEffectiveness, getTypeEffectiveness } from './type-chart.js';
import { PokemonType } from './types.js';

describe('getTypeEffectiveness', () => {
	it('returns 1 for neutral matchup', () => {
		expect(getTypeEffectiveness(PokemonType.Normal, PokemonType.Normal)).toBe(1);
		expect(getTypeEffectiveness(PokemonType.Fire, PokemonType.Normal)).toBe(1);
	});

	it('returns 2 for super effective', () => {
		expect(getTypeEffectiveness(PokemonType.Fire, PokemonType.Grass)).toBe(2);
		expect(getTypeEffectiveness(PokemonType.Water, PokemonType.Fire)).toBe(2);
		expect(getTypeEffectiveness(PokemonType.Electric, PokemonType.Water)).toBe(2);
	});

	it('returns 0.5 for not very effective', () => {
		expect(getTypeEffectiveness(PokemonType.Fire, PokemonType.Water)).toBe(0.5);
		expect(getTypeEffectiveness(PokemonType.Water, PokemonType.Grass)).toBe(0.5);
		expect(getTypeEffectiveness(PokemonType.Normal, PokemonType.Rock)).toBe(0.5);
	});

	it('returns 0 for immunity', () => {
		expect(getTypeEffectiveness(PokemonType.Normal, PokemonType.Ghost)).toBe(0);
		expect(getTypeEffectiveness(PokemonType.Electric, PokemonType.Ground)).toBe(0);
		expect(getTypeEffectiveness(PokemonType.Fighting, PokemonType.Ghost)).toBe(0);
	});

	it('Gen 1 quirk: Ghost does not affect Psychic (0x)', () => {
		expect(getTypeEffectiveness(PokemonType.Ghost, PokemonType.Psychic)).toBe(0);
	});

	it('Gen 1: Bug is super effective vs Psychic', () => {
		expect(getTypeEffectiveness(PokemonType.Bug, PokemonType.Psychic)).toBe(2);
	});

	it('Gen 1: Poison is super effective vs Bug', () => {
		expect(getTypeEffectiveness(PokemonType.Poison, PokemonType.Bug)).toBe(2);
	});

	it('Ground is immune to Flying', () => {
		expect(getTypeEffectiveness(PokemonType.Ground, PokemonType.Flying)).toBe(0);
	});
});

describe('getCombinedEffectiveness', () => {
	it('returns 1 for single neutral type', () => {
		expect(getCombinedEffectiveness(PokemonType.Normal, [PokemonType.Normal])).toBe(1);
	});

	it('multiplies dual-type effectiveness', () => {
		// Fire vs Grass+Flying: 2 * 1 = 2
		expect(getCombinedEffectiveness(PokemonType.Fire, [PokemonType.Grass, PokemonType.Flying])).toBe(2);
	});

	it('returns 0 when one type is immune', () => {
		// Normal vs Rock+Ghost: 0.5 * 0 = 0
		expect(getCombinedEffectiveness(PokemonType.Normal, [PokemonType.Rock, PokemonType.Ghost])).toBe(0);
	});

	it('returns 4 for double super effective', () => {
		// Water vs Fire+Rock: 2 * 2 = 4
		expect(getCombinedEffectiveness(PokemonType.Water, [PokemonType.Fire, PokemonType.Rock])).toBe(4);
	});

	it('returns 0.25 for double not very effective', () => {
		// Fire vs Water+Dragon: 0.5 * 0.5 = 0.25
		expect(getCombinedEffectiveness(PokemonType.Fire, [PokemonType.Water, PokemonType.Dragon])).toBe(0.25);
	});

	it('handles empty defender types gracefully', () => {
		expect(getCombinedEffectiveness(PokemonType.Fire, [])).toBe(1);
	});
});
