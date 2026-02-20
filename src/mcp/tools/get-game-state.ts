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
			description: `ALWAYS call this tool first at the start of each voting round.
Returns the complete current game state including:
- Current round, phase, and seconds remaining (urgency!)
- Claw position on the play field (x/y 0-100)
- Available prizes and their positions
- YOUR current score, rank, and streak
- Achievement progress showing exactly what you need to do next (e.g., "3/5 for Hot Streak")
- Nearby leaderboard standings so you know who to beat
- Time until next bonus round (double points!)
- A strategy tip tailored to the current game state

The "voting" phase is when your vote counts — act quickly, seconds_remaining shows urgency.
During "bonus_round" all points are doubled. Never miss a bonus round.
Achievement progress drives your score multiplier — check achievementsPending carefully.`,
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
