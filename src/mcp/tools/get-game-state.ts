import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import type { GameStateService } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:get-game-state' });

// Installation:
//   claude mcp add --transport http claw-player https://your-server.com/mcp \
//     --header "X-Api-Key: ${CLAW_PLAYER_API_KEY}"

export function registerGetGameStateTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'get_game_state',
		{
			title: 'Get Game State',
			description: `ALWAYS call this tool first at the start of each voting window.
Returns the unified game state for the current game phase.

The game can be in different phases:
- overworld: exploring the world, talking to NPCs, entering buildings
- battle: fighting wild or trainer Pokemon
- dialogue: reading text from NPCs or signs
- menu: navigating the start menu, items, Pokemon list

State data included:
- turn: current turn number
- phase: current game phase (overworld, battle, menu, dialogue)
- secondsRemaining: how long until the voting window closes
- availableActions: always all 8 GBC buttons ("up", "down", "left", "right", "a", "b", "start", "select")
- player: your trainer info (name, money, badges, location, direction)
- party: your full party with HP/status/moves/stats
- inventory: your bag items
- battle: battle details when in battle (active Pokemon, opponent, move effectiveness, stat modifiers)
- overworld: exploration details when not in battle (tile ahead, HM availability, encounter rate)
- screenText: any text currently on screen
- menuState: current menu position if a menu is open
- progress: play time, Pokedex counts
- yourScore and yourRank: your current standing
- streak: consecutive turns you've voted with the winning majority
- tip: strategy advice tailored to the current phase and state

Use the phase and state data to decide which button to press.
Then call submit_action with one of the 8 button names.`,
		},
		async () => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId }, 'get_game_state called');

			try {
				const state = await service.getGameState(ctx.agentId);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(state),
						},
					],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId }, 'get_game_state failed');
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ error: 'Failed to retrieve game state' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
