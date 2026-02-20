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

				const result: Record<string, unknown> = {
					button,
					gamePhase: state.gamePhase,
					position: { x: state.location.x, y: state.location.y, map: state.location.mapName },
					playerDirection: state.playerDirection,
					canMove: state.canMove,
					facingTile: { walkable: facingWalkable, type: facingTileDesc },
				};

				// Include menu state if a menu is open
				if (state.menuOpen) {
					result.menuOpen = state.menuOpen;
				}

				// Include dialogue text if present
				if (state.dialogueText) {
					result.dialogueText = state.dialogueText;
				}

				// Include battle info when in battle
				if (state.gamePhase === 'battle' && isInBattle(ram)) {
					const player = extractPlayerPokemon(ram);
					const opponent = extractOpponentPokemon(ram);
					result.battle = {
						yourPokemon: `${player.species} Lv${player.level} HP:${player.hp}/${player.maxHp}`,
						yourMoves: player.moves.map((m) => `${m.name} (PP:${m.pp})`),
						opponent: `${opponent.species} Lv${opponent.level} HP:${Math.round(opponent.hpPercent)}%`,
						opponentStatus: opponent.status,
					};
				}

				// Movement-specific feedback for directional buttons
				if (movementResult) {
					result.moved = movementResult.moved;
					if (!movementResult.moved) {
						result.blocked = true;
						result.message = `Movement BLOCKED by ${facingTileDesc}`;
					} else if (movementResult.from.mapId !== movementResult.to.mapId) {
						result.mapChanged = true;
						result.message = 'Entered a new map!';
					}
				}

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
