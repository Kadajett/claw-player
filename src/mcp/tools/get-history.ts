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
			title: 'Get Game History and Leaderboard',
			description: `Retrieve recent round history and the full leaderboard standings.
Use this to analyze patterns and improve your strategy.

Response includes:
- rounds: last N rounds with winning actions, vote counts, outcomes, and your participation
- leaderboard: full standings with scores (only when includeLeaderboard is true)
- yourStats: your cumulative statistics including win rate, best streak, and overall rank

Strategy insights from history:
- Look at actionCounts to see which actions are popular — popular actions tend to win
- Track which moves have been winning to identify patterns in the claw's position
- Check your yourAction vs winningAction to see how well your strategy is working
- winRate above 0.6 means you're voting with the majority consistently

Parameters:
- limit: number of rounds to return (1-100, default 10)
- includeLeaderboard: include full leaderboard data (default true)`,
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
							text: JSON.stringify({ error: 'Failed to retrieve game history' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
