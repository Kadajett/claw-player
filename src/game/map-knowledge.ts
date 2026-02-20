// ─── Pre-trained Map Knowledge ───────────────────────────────────────────────
// Hardcoded navigation data for Pokemon Red maps. Gives the agent spatial
// awareness so it can navigate purposefully instead of wandering blind.
//
// Coordinates use the game's wXCoord/wYCoord system (0-indexed, top-left origin).
// Map IDs match the wCurMap RAM address values.

export type MapNav = {
	description: string;
	tips: Array<string>;
	keyLocations: Array<{ name: string; x: number; y: number }>;
	/** Recommended path waypoints to follow in order (e.g. "exit this map") */
	exitPath?: Array<{ x: number; y: number; note: string }>;
};

const MAP_KNOWLEDGE: ReadonlyMap<number, MapNav> = new Map([
	// Red's House 2F (bedroom)
	[
		0x26,
		{
			description:
				"Player's bedroom on the 2nd floor of Red's house. Small room with a bed, PC, and TV. The stairs down are near the top-right of the room.",
			tips: [
				'Walk toward the stairs (top-right area) and step on them to go downstairs.',
				'The room is very small (about 4x4 walkable tiles).',
				'The stairs are at approximately (7,1).',
			],
			keyLocations: [
				{ name: 'Stairs down', x: 7, y: 1 },
				{ name: 'PC', x: 0, y: 1 },
				{ name: 'Bed', x: 3, y: 1 },
			],
			exitPath: [{ x: 7, y: 1, note: 'Walk to stairs to go to 1F' }],
		},
	],
	// Red's House 1F
	[
		0x25,
		{
			description:
				"First floor of Red's house. Mom is here. The front door (exit to Pallet Town) is at the bottom-center of the room. The stairs to 2F are on the right side.",
			tips: [
				'The front door is at the bottom-center of the room, around (2,7) to (3,7).',
				'Walk down to the door mat area and keep going down to exit.',
				'Mom (NPC) is usually sitting at the table. Walk around her, do not try to walk through her.',
				'The room is about 4 tiles wide and 5 tiles tall of walkable space.',
			],
			keyLocations: [
				{ name: 'Front door (exit)', x: 2, y: 7 },
				{ name: 'Stairs to 2F', x: 7, y: 1 },
				{ name: 'TV', x: 1, y: 1 },
				{ name: 'Table (Mom sits here)', x: 5, y: 4 },
			],
			exitPath: [
				{ x: 3, y: 5, note: 'Walk to center of room' },
				{ x: 2, y: 7, note: 'Walk down to the door to exit to Pallet Town' },
			],
		},
	],
	// Pallet Town
	[
		0x00,
		{
			description:
				"A small town with two houses and Prof. Oak's lab. Player's house is top-left, Blue's house is top-right, Oak's Lab is bottom-center.",
			tips: [
				'The main walkable path runs north-south through the center of town.',
				'Trees and fences block most of the east and west edges.',
				'To reach Route 1 (north), walk to the top-center of town and go up.',
				"Prof. Oak's Lab entrance is at the bottom-center of town.",
				'IMPORTANT: Do NOT walk between the houses and the fence/trees on the sides. You can get stuck in narrow gaps. Stay on the main center path.',
				'The town is 10 tiles wide, 9 tiles tall. The safe walkable corridor is roughly x=3 to x=7.',
				'If you try to leave town by walking into the tall grass (south toward Route 1), Prof. Oak will stop you.',
			],
			keyLocations: [
				{ name: "Red's House door", x: 3, y: 3 },
				{ name: "Blue's House door", x: 7, y: 3 },
				{ name: "Prof. Oak's Lab door", x: 5, y: 7 },
				{ name: 'Route 1 exit (south)', x: 4, y: 0 },
				{ name: 'Tall grass (triggers Oak event)', x: 4, y: 9 },
			],
			exitPath: [
				{ x: 5, y: 5, note: 'Walk to center of town (safe corridor)' },
				{ x: 5, y: 8, note: 'Walk south toward tall grass to trigger Prof. Oak event' },
			],
		},
	],
	// Prof. Oak's Lab
	[
		0x28,
		{
			description:
				"Prof. Oak's Pokemon Research Lab. Three Poke Balls on a table in the back. This is where you pick your starter Pokemon.",
			tips: [
				'The three starter Poke Balls are on the table at the back of the lab.',
				'Walk up to the table and press A to examine a Poke Ball to choose your starter.',
				'Bulbasaur is on the left, Charmander in the middle, Squirtle on the right.',
				'After choosing, your rival will pick the type-advantaged Pokemon.',
				'The exit door is at the bottom-center.',
			],
			keyLocations: [
				{ name: 'Bulbasaur (Poke Ball)', x: 6, y: 1 },
				{ name: 'Charmander (Poke Ball)', x: 7, y: 1 },
				{ name: 'Squirtle (Poke Ball)', x: 8, y: 1 },
				{ name: 'Exit door', x: 4, y: 11 },
				{ name: 'Prof. Oak', x: 5, y: 2 },
			],
			exitPath: [{ x: 4, y: 11, note: 'Walk to the door at the bottom to exit' }],
		},
	],
	// Route 1
	[
		0x0c,
		{
			description:
				'A short route connecting Pallet Town (south) to Viridian City (north). Mostly a straight path with some tall grass patches. No trainers.',
			tips: [
				'Walk north to reach Viridian City.',
				'There are ledges you can only jump down (south), not climb up.',
				'Stay on the path. Tall grass may trigger wild Pokemon encounters.',
				'An NPC near the top gives you a free Potion (need to talk to him with A).',
			],
			keyLocations: [
				{ name: 'Pallet Town exit (south)', x: 4, y: 35 },
				{ name: 'Viridian City entrance (north)', x: 4, y: 0 },
				{ name: 'Free Potion NPC', x: 3, y: 8 },
			],
		},
	],
	// Viridian City
	[
		0x01,
		{
			description:
				'First major city north of Pallet Town. Has a Pokemart and Pokemon Center. The Gym is initially locked.',
			tips: [
				'The Pokemart is to the upper-right area.',
				'The Pokemon Center is to the left.',
				"When you first arrive, the mart clerk gives you Oak's Parcel. Deliver it to Prof. Oak in Pallet Town.",
				'After delivering the parcel, you can buy Poke Balls from the mart.',
				'Route 2 exit is to the north (toward Pewter City / Viridian Forest).',
			],
			keyLocations: [
				{ name: 'Pokemon Center', x: 5, y: 5 },
				{ name: 'Pokemart', x: 15, y: 5 },
				{ name: 'Route 1 (south)', x: 9, y: 17 },
				{ name: 'Route 2 (north)', x: 9, y: 0 },
				{ name: 'Gym (locked)', x: 2, y: 9 },
			],
		},
	],
]);

export function getMapKnowledge(mapId: number): MapNav | null {
	return MAP_KNOWLEDGE.get(mapId) ?? null;
}

/**
 * Given the current map and player position, generate navigation guidance.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: navigation hint assembly with many map-specific branches
export function getNavigationHint(mapId: number, playerX: number, playerY: number): string | null {
	const nav = MAP_KNOWLEDGE.get(mapId);
	if (!nav) return null;

	const lines: Array<string> = [];
	lines.push(`MAP INFO: ${nav.description}`);

	if (nav.tips.length > 0) {
		lines.push(`TIPS: ${nav.tips.join(' | ')}`);
	}

	// Show distances to key locations
	const nearby = nav.keyLocations
		.map((loc) => {
			const dx = loc.x - playerX;
			const dy = loc.y - playerY;
			const dist = Math.abs(dx) + Math.abs(dy);
			const dirParts: Array<string> = [];
			if (dy < 0) dirParts.push(`${Math.abs(dy)} up`);
			if (dy > 0) dirParts.push(`${dy} down`);
			if (dx < 0) dirParts.push(`${Math.abs(dx)} left`);
			if (dx > 0) dirParts.push(`${dx} right`);
			const dirStr = dirParts.length > 0 ? dirParts.join(', ') : 'here';
			return { name: loc.name, dist, dirStr };
		})
		.sort((a, b) => a.dist - b.dist);

	lines.push(`NEARBY: ${nearby.map((n) => `${n.name} (${n.dirStr})`).join(' | ')}`);

	if (nav.exitPath) {
		const nextWaypoint = nav.exitPath.find((wp) => {
			const dist = Math.abs(wp.x - playerX) + Math.abs(wp.y - playerY);
			return dist > 0;
		});
		if (nextWaypoint) {
			const dx = nextWaypoint.x - playerX;
			const dy = nextWaypoint.y - playerY;
			const dirs: Array<string> = [];
			if (dy < 0) dirs.push(`UP ${Math.abs(dy)} steps`);
			if (dy > 0) dirs.push(`DOWN ${dy} steps`);
			if (dx < 0) dirs.push(`LEFT ${Math.abs(dx)} steps`);
			if (dx > 0) dirs.push(`RIGHT ${dx} steps`);
			lines.push(`NEXT WAYPOINT: ${nextWaypoint.note} (go ${dirs.join(', then ')})`);
		}
	}

	return lines.join('\n');
}
