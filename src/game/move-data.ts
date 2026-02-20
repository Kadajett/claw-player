import type { MoveCategory } from './types.js';
import { PokemonType } from './types.js';

// ─── Move Info Type ──────────────────────────────────────────────────────────

export type MoveInfo = {
	name: string;
	pokemonType: PokemonType;
	power: number; // 0 for status moves, 1 for OHKO/fixed-damage moves
	accuracy: number; // 0-100
	basePp: number;
	category: MoveCategory;
};

// ─── Gen 1 Physical/Special Split ────────────────────────────────────────────
// In Gen 1, category is determined entirely by the move's type:
// Special types: Fire, Water, Grass, Electric, Psychic, Ice, Dragon
// Physical types: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost

const SPECIAL_TYPES: ReadonlySet<PokemonType> = new Set([
	PokemonType.Fire,
	PokemonType.Water,
	PokemonType.Grass,
	PokemonType.Electric,
	PokemonType.Psychic,
	PokemonType.Ice,
	PokemonType.Dragon,
]);

function m(
	name: string,
	type: PokemonType,
	power: number,
	accuracy: number,
	basePp: number,
	forceCategory?: MoveCategory,
): MoveInfo {
	let category: MoveCategory;
	if (forceCategory !== undefined) {
		category = forceCategory;
	} else if (power === 0) {
		category = 'status';
	} else {
		category = SPECIAL_TYPES.has(type) ? 'special' : 'physical';
	}
	return { name, pokemonType: type, power, accuracy, basePp, category };
}

// Type aliases for compact table entries
const N = PokemonType.Normal;
const Fi = PokemonType.Fighting;
const Fl = PokemonType.Flying;
const Po = PokemonType.Poison;
const Gr = PokemonType.Ground;
const Ro = PokemonType.Rock;
const Bu = PokemonType.Bug;
const Gh = PokemonType.Ghost;
const Fr = PokemonType.Fire;
const Wa = PokemonType.Water;
const Ga = PokemonType.Grass;
const El = PokemonType.Electric;
const Ps = PokemonType.Psychic;
const Ic = PokemonType.Ice;
const Dr = PokemonType.Dragon;

// ─── Complete Gen 1 Move Table (IDs 1-165) ──────────────────────────────────
// Data sourced from pret/pokered disassembly (data/moves/moves.asm)
// Move IDs match the values stored in Pokemon Red's RAM

export const MOVE_TABLE: ReadonlyMap<number, MoveInfo> = new Map<number, MoveInfo>([
	[1, m('Pound', N, 40, 100, 35)],
	[2, m('Karate Chop', N, 50, 100, 25)],
	[3, m('Double Slap', N, 15, 85, 10)],
	[4, m('Comet Punch', N, 18, 85, 15)],
	[5, m('Mega Punch', N, 80, 85, 20)],
	[6, m('Pay Day', N, 40, 100, 20)],
	[7, m('Fire Punch', Fr, 75, 100, 15)],
	[8, m('Ice Punch', Ic, 75, 100, 15)],
	[9, m('Thunder Punch', El, 75, 100, 15)],
	[10, m('Scratch', N, 40, 100, 35)],
	[11, m('Vice Grip', N, 55, 100, 30)],
	[12, m('Guillotine', N, 1, 30, 5)],
	[13, m('Razor Wind', N, 80, 75, 10)],
	[14, m('Swords Dance', N, 0, 100, 30)],
	[15, m('Cut', N, 50, 95, 30)],
	[16, m('Gust', N, 40, 100, 35)],
	[17, m('Wing Attack', Fl, 35, 100, 35)],
	[18, m('Whirlwind', N, 0, 85, 20)],
	[19, m('Fly', Fl, 70, 95, 15)],
	[20, m('Bind', N, 15, 75, 20)],
	[21, m('Slam', N, 80, 75, 20)],
	[22, m('Vine Whip', Ga, 35, 100, 10)],
	[23, m('Stomp', N, 65, 100, 20)],
	[24, m('Double Kick', Fi, 30, 100, 30)],
	[25, m('Mega Kick', N, 120, 75, 5)],
	[26, m('Jump Kick', Fi, 70, 95, 25)],
	[27, m('Rolling Kick', Fi, 60, 85, 15)],
	[28, m('Sand Attack', N, 0, 100, 15)],
	[29, m('Headbutt', N, 70, 100, 15)],
	[30, m('Horn Attack', N, 65, 100, 25)],
	[31, m('Fury Attack', N, 15, 85, 20)],
	[32, m('Horn Drill', N, 1, 30, 5)],
	[33, m('Tackle', N, 35, 95, 35)],
	[34, m('Body Slam', N, 85, 100, 15)],
	[35, m('Wrap', N, 15, 85, 20)],
	[36, m('Take Down', N, 90, 85, 20)],
	[37, m('Thrash', N, 90, 100, 20)],
	[38, m('Double-Edge', N, 100, 100, 15)],
	[39, m('Tail Whip', N, 0, 100, 30)],
	[40, m('Poison Sting', Po, 15, 100, 35)],
	[41, m('Twineedle', Bu, 25, 100, 20)],
	[42, m('Pin Missile', Bu, 14, 85, 20)],
	[43, m('Leer', N, 0, 100, 30)],
	[44, m('Bite', N, 60, 100, 25)],
	[45, m('Growl', N, 0, 100, 40)],
	[46, m('Roar', N, 0, 100, 20)],
	[47, m('Sing', N, 0, 55, 15)],
	[48, m('Supersonic', N, 0, 55, 20)],
	[49, m('Sonic Boom', N, 1, 90, 20)],
	[50, m('Disable', N, 0, 55, 20)],
	[51, m('Acid', Po, 40, 100, 30)],
	[52, m('Ember', Fr, 40, 100, 25)],
	[53, m('Flamethrower', Fr, 95, 100, 15)],
	[54, m('Mist', Ic, 0, 100, 30)],
	[55, m('Water Gun', Wa, 40, 100, 25)],
	[56, m('Hydro Pump', Wa, 120, 80, 5)],
	[57, m('Surf', Wa, 95, 100, 15)],
	[58, m('Ice Beam', Ic, 95, 100, 10)],
	[59, m('Blizzard', Ic, 120, 90, 5)],
	[60, m('Psybeam', Ps, 65, 100, 20)],
	[61, m('Bubble Beam', Wa, 65, 100, 20)],
	[62, m('Aurora Beam', Ic, 65, 100, 20)],
	[63, m('Hyper Beam', N, 150, 90, 5)],
	[64, m('Peck', Fl, 35, 100, 35)],
	[65, m('Drill Peck', Fl, 80, 100, 20)],
	[66, m('Submission', Fi, 80, 80, 25)],
	[67, m('Low Kick', Fi, 50, 90, 20)],
	[68, m('Counter', Fi, 1, 100, 20)],
	[69, m('Seismic Toss', Fi, 1, 100, 20)],
	[70, m('Strength', N, 80, 100, 15)],
	[71, m('Absorb', Ga, 20, 100, 20)],
	[72, m('Mega Drain', Ga, 40, 100, 10)],
	[73, m('Leech Seed', Ga, 0, 90, 10)],
	[74, m('Growth', N, 0, 100, 40)],
	[75, m('Razor Leaf', Ga, 55, 95, 25)],
	[76, m('Solar Beam', Ga, 120, 100, 10)],
	[77, m('Poison Powder', Po, 0, 75, 35)],
	[78, m('Stun Spore', Ga, 0, 75, 30)],
	[79, m('Sleep Powder', Ga, 0, 75, 15)],
	[80, m('Petal Dance', Ga, 70, 100, 20)],
	[81, m('String Shot', Bu, 0, 95, 40)],
	[82, m('Dragon Rage', Dr, 1, 100, 10)],
	[83, m('Fire Spin', Fr, 15, 70, 15)],
	[84, m('Thunder Shock', El, 40, 100, 30)],
	[85, m('Thunderbolt', El, 95, 100, 15)],
	[86, m('Thunder Wave', El, 0, 100, 20)],
	[87, m('Thunder', El, 120, 70, 10)],
	[88, m('Rock Throw', Ro, 50, 65, 15)],
	[89, m('Earthquake', Gr, 100, 100, 10)],
	[90, m('Fissure', Gr, 1, 30, 5)],
	[91, m('Dig', Gr, 100, 100, 10)],
	[92, m('Toxic', Po, 0, 85, 10)],
	[93, m('Confusion', Ps, 50, 100, 25)],
	[94, m('Psychic', Ps, 90, 100, 10)],
	[95, m('Hypnosis', Ps, 0, 60, 20)],
	[96, m('Meditate', Ps, 0, 100, 40)],
	[97, m('Agility', Ps, 0, 100, 30)],
	[98, m('Quick Attack', N, 40, 100, 30)],
	[99, m('Rage', N, 20, 100, 20)],
	[100, m('Teleport', Ps, 0, 100, 20)],
	[101, m('Night Shade', Gh, 0, 100, 15, 'physical')],
	[102, m('Mimic', N, 0, 100, 10)],
	[103, m('Screech', N, 0, 85, 40)],
	[104, m('Double Team', N, 0, 100, 15)],
	[105, m('Recover', N, 0, 100, 20)],
	[106, m('Harden', N, 0, 100, 30)],
	[107, m('Minimize', N, 0, 100, 20)],
	[108, m('Smokescreen', N, 0, 100, 20)],
	[109, m('Confuse Ray', Gh, 0, 100, 10)],
	[110, m('Withdraw', Wa, 0, 100, 40)],
	[111, m('Defense Curl', N, 0, 100, 40)],
	[112, m('Barrier', Ps, 0, 100, 30)],
	[113, m('Light Screen', Ps, 0, 100, 30)],
	[114, m('Haze', Ic, 0, 100, 30)],
	[115, m('Reflect', Ps, 0, 100, 20)],
	[116, m('Focus Energy', N, 0, 100, 30)],
	[117, m('Bide', N, 0, 100, 10, 'physical')],
	[118, m('Metronome', N, 0, 100, 10)],
	[119, m('Mirror Move', Fl, 0, 100, 20)],
	[120, m('Self-Destruct', N, 130, 100, 5)],
	[121, m('Egg Bomb', N, 100, 75, 10)],
	[122, m('Lick', Gh, 20, 100, 30)],
	[123, m('Smog', Po, 20, 70, 20)],
	[124, m('Sludge', Po, 65, 100, 20)],
	[125, m('Bone Club', Gr, 65, 85, 20)],
	[126, m('Fire Blast', Fr, 120, 85, 5)],
	[127, m('Waterfall', Wa, 80, 100, 15)],
	[128, m('Clamp', Wa, 35, 75, 10)],
	[129, m('Swift', N, 60, 100, 20)],
	[130, m('Skull Bash', N, 100, 100, 15)],
	[131, m('Spike Cannon', N, 20, 100, 15)],
	[132, m('Constrict', N, 10, 100, 35)],
	[133, m('Amnesia', Ps, 0, 100, 20)],
	[134, m('Kinesis', Ps, 0, 80, 15)],
	[135, m('Soft-Boiled', N, 0, 100, 10)],
	[136, m('Hi Jump Kick', Fi, 85, 90, 20)],
	[137, m('Glare', N, 0, 75, 30)],
	[138, m('Dream Eater', Ps, 100, 100, 15)],
	[139, m('Poison Gas', Po, 0, 55, 40)],
	[140, m('Barrage', N, 15, 85, 20)],
	[141, m('Leech Life', Bu, 20, 100, 15)],
	[142, m('Lovely Kiss', N, 0, 75, 10)],
	[143, m('Sky Attack', Fl, 140, 90, 5)],
	[144, m('Transform', N, 0, 100, 10)],
	[145, m('Bubble', Wa, 20, 100, 30)],
	[146, m('Dizzy Punch', N, 70, 100, 10)],
	[147, m('Spore', Ga, 0, 100, 15)],
	[148, m('Flash', N, 0, 70, 20)],
	[149, m('Psywave', Ps, 1, 80, 15)],
	[150, m('Splash', N, 0, 100, 40)],
	[151, m('Acid Armor', Po, 0, 100, 40)],
	[152, m('Crabhammer', Wa, 90, 85, 10)],
	[153, m('Explosion', N, 170, 100, 5)],
	[154, m('Fury Swipes', N, 18, 80, 15)],
	[155, m('Bonemerang', Gr, 50, 90, 10)],
	[156, m('Rest', Ps, 0, 100, 10)],
	[157, m('Rock Slide', Ro, 75, 90, 10)],
	[158, m('Hyper Fang', N, 80, 90, 15)],
	[159, m('Sharpen', N, 0, 100, 30)],
	[160, m('Conversion', N, 0, 100, 30)],
	[161, m('Tri Attack', N, 80, 100, 10)],
	[162, m('Super Fang', N, 1, 90, 10)],
	[163, m('Slash', N, 70, 100, 20)],
	[164, m('Substitute', N, 0, 100, 10)],
	[165, m('Struggle', N, 50, 100, 10)],
]);
