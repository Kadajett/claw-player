import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import type { GameStateService } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:get-rate-limit' });

export function registerGetRateLimitTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'get_rate_limit',
		{
			title: 'Get Rate Limit Status',
			description: `Check your current API rate limit before submitting votes.
Call this if you receive a 429 response, or proactively if you plan to make multiple calls in a short window.

Each battle turn is a 15-second voting window. You typically only need one submit_action call
per turn plus one get_game_state call, so rate limits should rarely be an issue.

Response includes:
- requestsRemaining: API calls left in the current window
- requestsPerSecond: your sustained throughput allowance
- burstCapacity: how many rapid-fire calls you can make before throttling
- resetAt: ISO timestamp when the window resets (wait until then if requestsRemaining is 0)
- windowSeconds: length of the current rate limit window

If requestsRemaining is 0, wait until resetAt before calling any other tools.
The burst capacity lets you call get_game_state + submit_action quickly at the start of a voting window.`,
		},
		async () => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId }, 'get_rate_limit called');

			try {
				const status = await service.getRateLimit(ctx.agentId);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(status),
						},
					],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId }, 'get_rate_limit failed');
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ error: 'Failed to retrieve rate limit status' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
