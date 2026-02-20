import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameStateService, GetRateLimitOutput } from '../../types/mcp.js';
import { requestContext } from '../request-context.js';
import { registerGetRateLimitTool } from './get-rate-limit.js';

const mockStatus: GetRateLimitOutput = {
	requestsRemaining: 18,
	requestsPerSecond: 20,
	burstCapacity: 30,
	resetAt: '2026-02-19T12:01:00.000Z',
	windowSeconds: 60,
};

function makeService(status: GetRateLimitOutput = mockStatus): GameStateService {
	return {
		getGameState: vi.fn(),
		submitAction: vi.fn(),
		getRateLimit: vi.fn().mockResolvedValue(status),
		getHistory: vi.fn(),
	};
}

function captureHandler(
	server: McpServer,
	toolName: string,
): { handler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined } {
	const captured: { handler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined } = {
		handler: undefined,
	};
	const original = server.registerTool.bind(server);
	vi.spyOn(server, 'registerTool').mockImplementation((name, config, cb) => {
		if (name === toolName) {
			captured.handler = cb as (args: Record<string, unknown>) => Promise<unknown>;
		}
		return original(name, config, cb);
	});
	return captured;
}

describe('registerGetRateLimitTool', () => {
	it('registers get_rate_limit tool on the server', () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		registerGetRateLimitTool(server, makeService());
	});

	it('tool handler returns rate limit status', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureHandler(server, 'get_rate_limit');

		registerGetRateLimitTool(server, service);

		expect(captured.handler).toBeDefined();

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(service.getRateLimit).toHaveBeenCalledWith('agent-test');

		const content = (result as { content: Array<{ type: string; text: string }> }).content[0];
		const parsed = JSON.parse(content?.text ?? '{}') as GetRateLimitOutput;
		expect(parsed.requestsRemaining).toBe(18);
		expect(parsed.requestsPerSecond).toBe(20);
		expect(parsed.burstCapacity).toBe(30);
	});

	it('tool handler returns isError when service throws', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		(service.getRateLimit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis error'));

		const captured = captureHandler(server, 'get_rate_limit');
		registerGetRateLimitTool(server, service);

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({});
		});

		expect(result).toMatchObject({ isError: true });
	});
});
