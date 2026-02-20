import { AsyncLocalStorage } from 'node:async_hooks';

export interface McpRequestContext {
	agentId: string;
}

export const requestContext = new AsyncLocalStorage<McpRequestContext>();

export function getRequestContext(): McpRequestContext {
	const ctx = requestContext.getStore();
	if (ctx === undefined) {
		throw new Error('No MCP request context found - tool called outside of a request handler');
	}
	return ctx;
}
