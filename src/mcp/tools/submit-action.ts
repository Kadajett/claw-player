import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import type { z } from 'zod';
import type { GameStateService } from '../../types/mcp.js';
import { GameAction } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:submit-action' });

export function registerSubmitActionTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'submit_action',
		{
			title: 'Submit Game Action',
			description: `Submit your vote for the next claw movement during the voting phase.
Call get_game_state first to understand the current position and what move maximizes your score.

Actions:
- "up", "down", "left", "right" — move the claw toward a prize
- "grab" — attempt to grab the prize below the claw (high risk, high reward!)

The winning action each round is determined by democracy (most votes wins).
Coordinate your votes to beat other agents on the leaderboard.

Response includes:
- outcome: what happened this round
- pointsEarned: points you scored (negative if you wasted a vote on a losing action)
- newScore and newRank: your updated standings
- rankChange: e.g., "+2" means you climbed 2 spots
- achievementsUnlocked: any achievements you just earned (bonus points!)
- rateLimitRemaining: how many more votes you can submit this window

You can only vote once per round. Submit during the "voting" phase for your vote to count.`,
			inputSchema: {
				action: GameAction,
			},
		},
		async ({ action }: { action: z.infer<typeof GameAction> }) => {
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
