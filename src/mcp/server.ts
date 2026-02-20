/**
 * MCP Server for Claw Player
 *
 * Exposes game tools to Claude Code / OpenClaw agents via Streamable HTTP transport.
 *
 * Installation for agents:
 *   claude mcp add --transport http claw-player https://your-server.com/mcp \
 *     --header "X-Api-Key: ${CLAW_PLAYER_API_KEY}"
 *
 * The server runs on MCP_PORT (default 3001) as a standalone Node.js HTTP server.
 * Auth is handled via X-Api-Key header before MCP processing.
 * Each request creates a fresh stateless McpServer+transport pair.
 */

import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Redis } from 'ioredis';
import pino from 'pino';
import type { GameStateService } from '../types/mcp.js';
import { validateApiKey } from './auth-middleware.js';
import { requestContext } from './request-context.js';
import { registerGetGameStateTool } from './tools/get-game-state.js';
import { registerGetHistoryTool } from './tools/get-history.js';
import { registerGetRateLimitTool } from './tools/get-rate-limit.js';
import { registerSubmitActionTool } from './tools/submit-action.js';

const logger = pino({ name: 'mcp-server' });

const SERVER_NAME = 'claw-player';
const SERVER_VERSION = '0.1.0';

export interface McpServerOptions {
	redis: Redis;
	gameStateService: GameStateService;
	port: number;
	host: string;
}

function createFreshMcpServer(service: GameStateService): McpServer {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	registerGetGameStateTool(server, service);
	registerSubmitActionTool(server, service);
	registerGetRateLimitTool(server, service);
	registerGetHistoryTool(server, service);
	return server;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Array<Buffer> = [];
		req.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString('utf-8');
			if (raw.length === 0) {
				resolve(undefined);
				return;
			}
			try {
				resolve(JSON.parse(raw) as unknown);
			} catch {
				reject(new Error('Invalid JSON body'));
			}
		});
		req.on('error', reject);
	});
}

async function handleMcpRequest(
	req: IncomingMessage,
	res: ServerResponse,
	redis: Redis,
	service: GameStateService,
): Promise<void> {
	const authResult = await validateApiKey(req, redis);

	if (!authResult.valid) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: authResult.reason }));
		return;
	}

	const { agentId } = authResult;

	let body: unknown;
	try {
		body = await readBody(req);
	} catch {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid request body' }));
		return;
	}

	const mcpServer = createFreshMcpServer(service);
	// Omitting sessionIdGenerator enables stateless mode per SDK docs
	const transport = new StreamableHTTPServerTransport({});

	try {
		await requestContext.run({ agentId }, async () => {
			// Cast required: StreamableHTTPServerTransport.onclose type conflicts with
			// Transport interface under exactOptionalPropertyTypes — safe at runtime
			await mcpServer.connect(transport as unknown as Transport);
			await transport.handleRequest(req, res, body);
		});
	} catch (err) {
		logger.error({ err, agentId }, 'MCP request handling error');
		if (!res.headersSent) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal server error' }));
		}
	} finally {
		await mcpServer.close().catch((err: unknown) => {
			logger.warn({ err }, 'Error closing MCP server after request');
		});
	}
}

export function createMcpHttpServer(options: McpServerOptions): http.Server {
	const { redis, gameStateService, port, host } = options;

	const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
		const url = req.url ?? '/';
		const method = req.method ?? 'GET';

		logger.debug({ method, url }, 'Incoming request');

		// Health check
		if (url === '/health' && method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', service: SERVER_NAME }));
			return;
		}

		// MCP endpoint — accepts POST (JSON-RPC), GET (SSE), DELETE (session close)
		if (url === '/mcp' || url.startsWith('/mcp?')) {
			await handleMcpRequest(req, res, redis, gameStateService);
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	});

	server.on('error', (err: Error) => {
		logger.error({ err }, 'MCP HTTP server error');
	});

	server.listen(port, host, () => {
		logger.info({ port, host }, 'MCP HTTP server listening');
	});

	return server;
}
