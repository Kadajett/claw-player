import { PokemonType } from './types.js';

// Gen 1 type effectiveness table
// Rows = attacking type, Columns = defending type
// Values: 0 = immune, 0.5 = not very effective, 1 = neutral, 2 = super effective

const TYPE_ORDER: Array<PokemonType> = [
	PokemonType.Normal,
	PokemonType.Fire,
	PokemonType.Water,
	PokemonType.Electric,
	PokemonType.Grass,
	PokemonType.Ice,
	PokemonType.Fighting,
	PokemonType.Poison,
	PokemonType.Ground,
	PokemonType.Flying,
	PokemonType.Psychic,
	PokemonType.Bug,
	PokemonType.Rock,
	PokemonType.Ghost,
	PokemonType.Dragon,
];

// 15x15 effectiveness matrix: CHART[attacker][defender]
// Row order matches TYPE_ORDER
const CHART_ROWS: Array<Array<number>> = [
	// Normal attacking:   Nor  Fir  Wat  Ele  Grs  Ice  Fgt  Poi  Gnd  Fly  Psy  Bug  Rok  Gst  Drg
	/* Normal   */ [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0, 1],
	/* Fire     */ [1, 0.5, 0.5, 1, 2, 2, 1, 1, 1, 1, 1, 2, 0.5, 1, 0.5],
	/* Water    */ [1, 2, 0.5, 1, 0.5, 1, 1, 1, 2, 1, 1, 1, 2, 1, 0.5],
	/* Electric */ [1, 1, 2, 0.5, 0.5, 1, 1, 1, 0, 2, 1, 1, 1, 1, 0.5],
	/* Grass    */ [1, 0.5, 2, 1, 0.5, 1, 1, 0.5, 2, 0.5, 1, 0.5, 2, 1, 0.5],
	/* Ice      */ [1, 0.5, 0.5, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2],
	/* Fighting */ [2, 1, 1, 1, 1, 2, 1, 0.5, 1, 0.5, 0.5, 0.5, 2, 0, 1],
	/* Poison   */ [1, 1, 1, 1, 2, 1, 1, 0.5, 0.5, 1, 1, 2, 0.5, 0.5, 1],
	/* Ground   */ [1, 2, 1, 2, 0.5, 1, 1, 2, 1, 0, 1, 0.5, 2, 1, 1],
	/* Flying   */ [1, 1, 1, 0.5, 2, 1, 2, 1, 1, 1, 1, 2, 0.5, 1, 1],
	/* Psychic  */ [1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 0.5, 1, 1, 0, 1],
	/* Bug      */ [1, 0.5, 1, 1, 2, 1, 0.5, 2, 1, 0.5, 2, 1, 1, 0.5, 1],
	/* Rock     */ [1, 2, 1, 1, 1, 2, 0.5, 1, 0.5, 2, 1, 2, 1, 1, 1],
	/* Ghost    */ [0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 2, 1],
	/* Dragon   */ [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
];

function buildTypeIndex(): Map<PokemonType, number> {
	const index = new Map<PokemonType, number>();
	for (let i = 0; i < TYPE_ORDER.length; i++) {
		const t = TYPE_ORDER[i];
		if (t !== undefined) {
			index.set(t, i);
		}
	}
	return index;
}

const TYPE_INDEX = buildTypeIndex();

export function getTypeEffectiveness(attackingType: PokemonType, defendingType: PokemonType): number {
	const atkIdx = TYPE_INDEX.get(attackingType);
	const defIdx = TYPE_INDEX.get(defendingType);

	if (atkIdx === undefined || defIdx === undefined) return 1;

	const row = CHART_ROWS[atkIdx];
	if (!row) return 1;

	const value = row[defIdx];
	return value ?? 1;
}

export function getCombinedEffectiveness(attackingType: PokemonType, defenderTypes: Array<PokemonType>): number {
	return defenderTypes.reduce((acc, defType) => acc * getTypeEffectiveness(attackingType, defType), 1);
}
