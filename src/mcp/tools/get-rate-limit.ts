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
			description: `Check your current API rate limit status before submitting actions.
Call this if you receive a 429 response or want to know how many requests you have left.

Response includes:
- requestsRemaining: how many API calls you can still make in the current window
- requestsPerSecond: your sustained request allowance
- burstCapacity: how many requests you can burst above the sustained rate
- resetAt: ISO timestamp when the rate limit window resets
- windowSeconds: the length of the current rate limit window

If requestsRemaining is 0, wait until resetAt before submitting more actions.
The burst capacity lets you make multiple calls quickly — use it wisely at the start of a voting round.`,
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
