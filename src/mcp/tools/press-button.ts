import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { z } from 'zod';
import type { GameBoyEmulator, GbButton } from '../../game/emulator-interface.js';
import {
	OVERWORLD_CUR_MAP,
	OVERWORLD_X_COORD,
	OVERWORLD_Y_COORD,
	extractOpponentPokemon,
	extractOverworldState,
	extractPlayerPokemon,
	isInBattle,
} from '../../game/memory-map.js';
import {
	ADDR_CUR_MAP_TILESET,
	ADDR_TILE_IN_FRONT_OF_PLAYER,
	describeTile,
	isTileWalkable,
} from '../../game/tileset-collision.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:press-button' });

const ButtonSchema = z.enum(['A', 'B', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'START', 'SELECT']);

const DIRECTIONAL_BUTTONS = new Set<string>(['UP', 'DOWN', 'LEFT', 'RIGHT']);

export function registerPressButtonTool(server: McpServer, emulator: GameBoyEmulator): void {
	// Persistent navigation state across button presses
	let lastSuccessfulDirection: string | null = null;
	let consecutiveBlocks = 0;
	const blockedDirections = new Set<string>();
	let lastPosition = { x: -1, y: -1, mapId: -1 };

	server.registerTool(
		'press_button',
		{
			title: 'Press Game Boy Button',
			description: `Press a Game Boy button on the emulator. Every response includes the full game state after the press:
- gamePhase: "overworld", "dialogue", or "battle"
- position: player x/y and current map
- canMove: whether movement is possible right now
- facingTile: what's in front of the player (walkable path, wall, tree, water, etc.)
- menuOpen: raw on-screen menu text with > marking the cursor position, e.g. ">FIGHT  ITEM\n POKeMON RUN"
- dialogueText: on-screen text (dialogue, battle messages, etc.)
- battle: (only during battles) your Pokemon name/level/HP, your moves with PP, opponent name/level/HP%

Valid buttons: A, B, UP, DOWN, LEFT, RIGHT, START, SELECT

Common uses:
- A: confirm, advance dialogue, select menu item, interact
- B: cancel, close menus, go back
- UP/DOWN/LEFT/RIGHT: move player, navigate menus (battle menu is a 2x2 grid: FIGHT=top-left, ITEM=top-right, POKeMON=bottom-left, RUN=bottom-right)
- START: open/close pause menu

Battle menu navigation: The main battle menu is a 2x2 grid. After selecting FIGHT, moves appear in a 2x2 grid. Use UP/DOWN/LEFT/RIGHT to move between options, A to select.

For directional buttons in overworld, the response includes whether movement succeeded (moved: true) or was blocked (blocked: true with the obstacle type).`,
			inputSchema: {
				button: ButtonSchema,
			},
		},
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: button press handler assembles full game state
		async ({ button }: { button: GbButton }) => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId, button }, 'press_button called');

			if (!emulator.isInitialized) {
				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Emulator not initialized' }) }],
					isError: true,
				};
			}

			try {
				// For directional buttons, track position before/after to detect blocked movement
				let movementResult: {
					moved: boolean;
					from: { x: number; y: number; mapId: number };
					to: { x: number; y: number; mapId: number };
				} | null = null;

				if (DIRECTIONAL_BUTTONS.has(button)) {
					const beforeX = await emulator.readByte(OVERWORLD_X_COORD);
					const beforeY = await emulator.readByte(OVERWORLD_Y_COORD);
					const beforeMap = await emulator.readByte(OVERWORLD_CUR_MAP);

					await emulator.pressButton(button);
					// Walking animation in Pokemon Red takes ~16 frames (267ms) after
					// the 15-frame button hold. Wait long enough for the full step.
					await emulator.waitMs(450);

					const afterX = await emulator.readByte(OVERWORLD_X_COORD);
					const afterY = await emulator.readByte(OVERWORLD_Y_COORD);
					const afterMap = await emulator.readByte(OVERWORLD_CUR_MAP);

					movementResult = {
						moved: afterX !== beforeX || afterY !== beforeY || afterMap !== beforeMap,
						from: { x: beforeX, y: beforeY, mapId: beforeMap },
						to: { x: afterX, y: afterY, mapId: afterMap },
					};
				} else {
					await emulator.pressButton(button);
					await emulator.waitMs(150);
				}

				// Read full game state after every button press
				const ram = await emulator.getRAM();
				const state = extractOverworldState(ram);

				// Read facing tile collision info
				const tilesetId = ram[ADDR_CUR_MAP_TILESET] ?? 0;
				const facingTileId = ram[ADDR_TILE_IN_FRONT_OF_PLAYER] ?? 0;
				const facingWalkable = isTileWalkable(tilesetId, facingTileId);
				const facingTileDesc = describeTile(tilesetId, facingTileId);

				// Build battle info if applicable
				let battle: unknown = undefined;
				if (state.gamePhase === 'battle' && isInBattle(ram)) {
					const player = extractPlayerPokemon(ram);
					const opponent = extractOpponentPokemon(ram);
					battle = {
						yourPokemon: `${player.species} Lv${player.level} HP:${player.hp}/${player.maxHp}`,
						yourMoves: player.moves.map((m) => `${m.name} (PP:${m.pp})`),
						opponent: `${opponent.species} Lv${opponent.level} HP:${Math.round(opponent.hpPercent)}%`,
						opponentStatus: opponent.status,
					};
				}

				// Build movement feedback and update navigation state
				// Only track navigation state in overworld when movement is possible
				// (not in battles, menus, or dialogue where directional buttons navigate UI)
				let moved: boolean | undefined;
				let blocked: boolean | undefined;
				let mapChanged: boolean | undefined;
				let message: string | undefined;
				if (movementResult && state.gamePhase === 'overworld') {
					const currentPos = { x: movementResult.to.x, y: movementResult.to.y, mapId: movementResult.to.mapId };

					// Reset blocked directions when position changes
					if (
						currentPos.x !== lastPosition.x ||
						currentPos.y !== lastPosition.y ||
						currentPos.mapId !== lastPosition.mapId
					) {
						blockedDirections.clear();
						lastPosition = currentPos;
					}

					moved = movementResult.moved;
					if (!movementResult.moved) {
						blocked = true;
						consecutiveBlocks++;
						blockedDirections.add(button);
						message = `Movement BLOCKED by ${facingTileDesc}`;
						if (consecutiveBlocks >= 3) {
							const openDirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'].filter((d) => !blockedDirections.has(d));
							message += `. STUCK: ${consecutiveBlocks} consecutive blocks. Blocked: [${[...blockedDirections].join(', ')}].`;
							if (openDirs.length > 0) {
								message += ` Try: [${openDirs.join(', ')}]`;
							} else {
								message += ' All directions blocked, try A or B to interact.';
							}
						}
					} else {
						lastSuccessfulDirection = button;
						consecutiveBlocks = 0;
						if (movementResult.from.mapId !== movementResult.to.mapId) {
							mapChanged = true;
							blockedDirections.clear();
							message = 'Entered a new map!';
						}
					}
				} else if (movementResult) {
					// In battle/dialogue/menu, still report position but don't track navigation
					moved = movementResult.moved;
				}

				const navigation = {
					...(lastSuccessfulDirection ? { lastSuccessfulDirection } : {}),
					...(consecutiveBlocks > 0 ? { consecutiveBlocks } : {}),
					...(blockedDirections.size > 0 ? { blockedDirections: [...blockedDirections] } : {}),
				};

				const result = {
					button,
					gamePhase: state.gamePhase,
					position: { x: state.location.x, y: state.location.y, map: state.location.mapName },
					playerDirection: state.playerDirection,
					canMove: state.canMove,
					facingTile: { walkable: facingWalkable, type: facingTileDesc },
					...(state.menuOpen ? { menuOpen: state.menuOpen } : {}),
					...(state.dialogueText ? { dialogueText: state.dialogueText } : {}),
					...(battle ? { battle } : {}),
					...(moved !== undefined ? { moved } : {}),
					...(blocked ? { blocked } : {}),
					...(mapChanged ? { mapChanged } : {}),
					...(message ? { message } : {}),
					...(Object.keys(navigation).length > 0 ? { navigation } : {}),
				};

				return {
					content: [{ type: 'text' as const, text: JSON.stringify(result) }],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId, button }, 'press_button failed');
				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to press button' }) }],
					isError: true,
				};
			}
		},
	);
}
