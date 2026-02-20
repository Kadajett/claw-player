import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import type { GameBoyEmulator } from '../../game/emulator-interface.js';
import { getNavigationHint } from '../../game/map-knowledge.js';
import { extractOverworldState } from '../../game/memory-map.js';
import {
	ADDR_CUR_MAP_TILESET,
	ADDR_TILE_IN_FRONT_OF_PLAYER,
	describeTile,
	isTileWalkable,
} from '../../game/tileset-collision.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:get-overworld-state' });

export function registerGetOverworldStateTool(server: McpServer, emulator: GameBoyEmulator): void {
	server.registerTool(
		'get_overworld_state',
		{
			title: 'Get Overworld State',
			description: `Read the current game state outside of battles. Use this to understand where the player is, what's happening on screen, and what actions are available.

Returns:
- gamePhase: "overworld", "dialogue", "battle", or "cutscene"
- location: map name, player X/Y coordinates, map width/height
- playerDirection: which way the player is facing
- canMove: whether the player can currently move (false during dialogue/cutscene)
- facingTile: collision info for the tile the player is facing (walkable, type like "tree/hedge", "water", "wall", "obstacle")
- warps: list of exit/door/stair tiles with their (x,y) position and destination map. Walk onto a warp tile to transition to another area.
- player: name, money, badges, inventory
- nearbyNpcs: NPCs visible on the current map

Use this after pressing buttons to see the effect of your actions.
During dialogue, press A to advance text. During menus, use UP/DOWN to navigate and A to select.
Use warps to find exits: walk to the warp's (x,y) coordinate to leave the current area.
Use facingTile to check if the direction you want to move has an obstacle before trying.`,
		},
		async () => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId }, 'get_overworld_state called');

			if (!emulator.isInitialized) {
				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Emulator not initialized' }) }],
					isError: true,
				};
			}

			try {
				const ram = await emulator.getRAM();
				const state = extractOverworldState(ram);

				// Read tileset collision data for the tile the player is facing
				const tilesetId = ram[ADDR_CUR_MAP_TILESET] ?? 0;
				const facingTileId = ram[ADDR_TILE_IN_FRONT_OF_PLAYER] ?? 0;
				const facingWalkable = isTileWalkable(tilesetId, facingTileId);
				const facingTileDesc = describeTile(tilesetId, facingTileId);

				// Merge collision info into the state JSON
				const stateWithCollision = {
					...state,
					facingTile: {
						walkable: facingWalkable,
						type: facingTileDesc,
						tileId: `0x${facingTileId.toString(16).padStart(2, '0')}`,
						tilesetId,
					},
				};

				// Add pre-trained map navigation hints
				const navHint = getNavigationHint(state.location.mapId, state.location.x, state.location.y);

				const content: Array<{ type: 'text'; text: string }> = [
					{ type: 'text' as const, text: JSON.stringify(stateWithCollision) },
				];

				if (navHint) {
					content.push({ type: 'text' as const, text: navHint });
				}

				return { content };
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId }, 'get_overworld_state failed');
				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to read overworld state' }) }],
					isError: true,
				};
			}
		},
	);
}
