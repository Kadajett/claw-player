import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameStateService, SubmitActionOutput } from '../../types/mcp.js';
import { requestContext } from '../request-context.js';
import { registerSubmitActionTool } from './submit-action.js';

const mockResult: SubmitActionOutput = {
	success: true,
	outcome: 'You voted "a" (confirm). Current tally: a: 5 votes, b: 1 vote. You are with the majority!',
	pointsEarned: 15,
	newScore: 215,
	newRank: 2,
	rankChange: '0',
	achievementsUnlocked: [],
	rateLimitRemaining: 17,
};

function makeService(result: SubmitActionOutput = mockResult): GameStateService {
	return {
		getBattleState: vi.fn(),
		submitAction: vi.fn().mockResolvedValue(result),
		getRateLimit: vi.fn(),
		getHistory: vi.fn(),
	};
}

function captureHandler<T>(
	server: McpServer,
	toolName: string,
): { handler: ((args: T) => Promise<unknown>) | undefined } {
	const captured: { handler: ((args: T) => Promise<unknown>) | undefined } = { handler: undefined };
	const original = server.registerTool.bind(server);
	vi.spyOn(server, 'registerTool').mockImplementation((name, config, cb) => {
		if (name === toolName) {
			captured.handler = cb as (args: T) => Promise<unknown>;
		}
		return original(name, config, cb);
	});
	return captured;
}

describe('registerSubmitActionTool', () => {
	it('registers submit_action tool on the server', () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		registerSubmitActionTool(server, makeService());
	});

	it('tool handler submits button action "a"', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureHandler<{ action: string }>(server, 'submit_action');

		registerSubmitActionTool(server, service);

		expect(captured.handler).toBeDefined();

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({ action: 'a' });
		});

		expect(service.submitAction).toHaveBeenCalledWith('agent-test', 'a');

		const content = (result as { content: Array<{ type: string; text: string }> }).content[0];
		const parsed = JSON.parse(content?.text ?? '{}') as SubmitActionOutput;
		expect(parsed.success).toBe(true);
		expect(parsed.pointsEarned).toBe(15);
	});

	it('tool handler submits directional button action', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		const captured = captureHandler<{ action: string }>(server, 'submit_action');

		registerSubmitActionTool(server, service);

		await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({ action: 'down' });
		});

		expect(service.submitAction).toHaveBeenCalledWith('agent-test', 'down');
	});

	it('tool handler returns isError when service throws', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.1' });
		const service = makeService();
		(service.submitAction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Rate limited'));

		const captured = captureHandler<{ action: string }>(server, 'submit_action');
		registerSubmitActionTool(server, service);

		const result = await requestContext.run({ agentId: 'agent-test' }, async () => {
			return captured.handler?.({ action: 'b' });
		});

		expect(result).toMatchObject({ isError: true });
	});
});
