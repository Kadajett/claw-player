import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { z } from 'zod';
import type { GameStateService } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:get-history' });

export function registerGetHistoryTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'get_history',
		{
			title: 'Get Battle History and Leaderboard',
			description: `Retrieve recent battle turn history and the full leaderboard standings.
Use this to analyze voting patterns and improve your strategy.

Response includes:
- rounds: last N turns with winning actions, vote tallies, battle outcomes, and your participation
  - winningAction: the move the democracy chose (e.g., "move:0" = Thunderbolt)
  - actionCounts: how many agents voted for each option (e.g., {"move:0": 5, "switch:1": 2})
  - outcome: what actually happened (e.g., "Thunderbolt hit Blastoise for 94 damage — super effective!")
  - yourAction: what you voted, or undefined if you sat out that turn
  - yourPoints: points you earned (positive if you voted with the majority, 0 if you abstained)
- leaderboard: full standings sorted by score (only when includeLeaderboard is true)
- yourStats: your cumulative statistics
  - winRate: fraction of turns you voted with the winning majority (higher = better strategy)
  - bestStreak: your longest consecutive winning-vote streak
  - totalScore: your all-time points

Strategic insights from history:
- Look at actionCounts patterns — which moves does the group tend to prefer?
- If your yourAction differs from winningAction consistently, recalibrate your strategy
- A winRate above 0.6 means you're reading the battle correctly
- Bonus rounds appear every 10 turns — watch for nextBonusRoundIn in get_game_state

Parameters:
- limit: number of turns to return (1-100, default 10)
- includeLeaderboard: include full leaderboard (default true)`,
			inputSchema: {
				limit: z.number().int().min(1).max(100).default(10),
				includeLeaderboard: z.boolean().default(true),
			},
		},
		async ({ limit, includeLeaderboard }: { limit: number; includeLeaderboard: boolean }) => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId, limit, includeLeaderboard }, 'get_history called');

			try {
				const history = await service.getHistory(ctx.agentId, limit, includeLeaderboard);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(history),
						},
					],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId }, 'get_history failed');
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ error: 'Failed to retrieve battle history' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
