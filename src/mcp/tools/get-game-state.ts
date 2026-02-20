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
Returns the unified game state including the current phase, screen context, and available actions.

The game can be in different phases:
- Overworld: exploring the world, talking to NPCs, entering buildings
- Battle: fighting wild or trainer Pokemon
- Dialogue: reading text from NPCs or signs
- Menu: navigating the start menu, items, Pokemon list

State data included:
- turn: current turn number
- phase: "voting" (your vote counts now!), "executing" (action in progress), "idle"
- secondsRemaining: how long until the voting window closes
- availableActions: always all 8 GBC buttons ("up", "down", "left", "right", "a", "b", "start", "select")
- playerPokemon: your active Pokemon with name, HP, types, and full move list
- opponentPokemon: the enemy Pokemon (in battle)
- playerParty: your full party with HP/status
- weather: current weather condition (null = clear)
- yourScore and yourRank: your current standing in the leaderboard
- streak: consecutive turns you've voted with the winning majority
- achievementsPending: achievements you're close to earning
- leaderboard: nearby agents so you know who to beat
- nextBonusRoundIn: turns until double-points bonus round
- tip: strategy advice tailored to the current state

Use the phase and screen context to decide which button to press.
Then call submit_action with one of the 8 button names.`,
		},
		async () => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId }, 'get_game_state called');

			try {
				const state = await service.getBattleState(ctx.agentId);
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
