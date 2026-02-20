import { describe, expect, it } from 'vitest';
import { getRequestContext, requestContext } from './request-context.js';

describe('requestContext', () => {
	it('returns the context when called within run()', () => {
		const ctx = { agentId: 'agent-abc-123' };
		requestContext.run(ctx, () => {
			const result = getRequestContext();
			expect(result.agentId).toBe('agent-abc-123');
		});
	});

	it('throws when called outside of run()', () => {
		expect(() => getRequestContext()).toThrow('No MCP request context found');
	});

	it('isolates context between concurrent runs', async () => {
		const results: Array<string> = [];

		await Promise.all([
			requestContext.run({ agentId: 'agent-1' }, async () => {
				await new Promise<void>((r) => setTimeout(r, 5));
				results.push(getRequestContext().agentId);
			}),
			requestContext.run({ agentId: 'agent-2' }, async () => {
				await new Promise<void>((r) => setTimeout(r, 1));
				results.push(getRequestContext().agentId);
			}),
		]);

		expect(results).toContain('agent-1');
		expect(results).toContain('agent-2');
	});
});
