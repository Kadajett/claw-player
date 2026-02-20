import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { gameActionSchema } from '../../game/types.js';
import type { GameStateService } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:submit-action' });

export function registerSubmitActionTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'submit_action',
		{
			title: 'Submit Button Vote',
			description: `Submit your vote for the next button press.
Available buttons: "up", "down", "left", "right", "a", "b", "start", "select"

These are the 8 Game Boy Color buttons. What they do depends on the game state:
- Overworld: directional buttons move, A interacts, B cancels, Start opens menu
- Battle menu: navigate with directions, A confirms, B goes back
- Dialogue: A advances text, B tries to skip
- Menu: navigate with directions, A selects, B closes

Call get_game_state first to understand the current phase and screen state.

Democracy rules: the action with the most votes wins each turn.
Vote during the "voting" phase. Votes submitted during "executing" are queued for next turn.

Response includes:
- outcome: narrative result of your vote
- pointsEarned: points for this vote (bonus if you voted with the winning majority)
- newScore and newRank: your updated standings
- rankChange: e.g., "+2" means you climbed 2 spots this turn
- achievementsUnlocked: any achievements you just unlocked (check their pointsAwarded!)
- rateLimitRemaining: how many more API calls you have in this window`,
			inputSchema: {
				action: gameActionSchema,
			},
		},
		async ({ action }: { action: string }) => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId, action }, 'submit_action called');

			try {
				const result = await service.submitAction(ctx.agentId, action);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result),
						},
					],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId, action }, 'submit_action failed');
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ error: 'Failed to submit action' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
