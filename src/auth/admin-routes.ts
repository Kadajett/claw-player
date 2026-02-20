import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { validateAdminSecret } from './admin.js';
import {
	BanAgentRequestSchema,
	BanCidrRequestSchema,
	BanIpRequestSchema,
	BanUserAgentRequestSchema,
	UnbanRequestSchema,
} from './ban-types.js';
import { banAgent, banCidr, banIp, banUserAgent, listBans, unban } from './ban.js';

// biome-ignore lint/suspicious/noExplicitAny: adapter types for uWS HttpResponse
type SendJson = (res: any, statusCode: number, body: unknown) => void;
// biome-ignore lint/suspicious/noExplicitAny: adapter types for uWS HttpResponse
type ReadBody = (res: any) => Promise<string>;

export type AdminRoutesDeps = {
	redis: Redis;
	logger: Logger;
	adminSecret: string | undefined;
	sendJson: SendJson;
	readBody: ReadBody;
};

type UwsApp = {
	post: (path: string, handler: (res: unknown, req: unknown) => void) => void;
	get: (path: string, handler: (res: unknown, req: unknown) => void) => void;
};

type UwsRes = {
	onAborted: (cb: () => void) => void;
};

type UwsReq = {
	getHeader: (name: string) => string;
};

/**
 * Register admin API routes on a uWebSockets.js app.
 */
export function registerAdminRoutes(app: UwsApp, deps: AdminRoutesDeps): void {
	const { redis, logger, adminSecret, sendJson, readBody } = deps;

	function checkAdmin(res: UwsRes, req: UwsReq): boolean {
		const secret = req.getHeader('x-admin-secret');
		if (!validateAdminSecret(secret, adminSecret)) {
			sendJson(res, 401, { error: 'Invalid admin secret', code: 'UNAUTHORIZED' });
			return false;
		}
		return true;
	}

	app.post('/api/v1/admin/ban/agent', (res: unknown, req: unknown) => {
		const uwsRes = res as UwsRes;
		const uwsReq = req as UwsReq;
		let aborted = false;
		uwsRes.onAborted(() => {
			aborted = true;
		});

		if (!checkAdmin(uwsRes, uwsReq)) return;

		readBody(res)
			.then(async (bodyStr) => {
				const body = JSON.parse(bodyStr);
				const parsed = BanAgentRequestSchema.safeParse(body);
				if (!parsed.success) {
					if (!aborted) sendJson(res, 400, { error: 'Invalid request', details: parsed.error.flatten() });
					return;
				}
				await banAgent(
					redis,
					parsed.data.agentId,
					parsed.data.type,
					parsed.data.reason,
					'admin',
					parsed.data.durationSeconds,
				);
				logger.info({ agentId: parsed.data.agentId, type: parsed.data.type }, 'Agent banned by admin');
				if (!aborted) sendJson(res, 200, { ok: true, target: parsed.data.agentId });
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error in admin ban agent');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});

	app.post('/api/v1/admin/ban/ip', (res: unknown, req: unknown) => {
		const uwsRes = res as UwsRes;
		const uwsReq = req as UwsReq;
		let aborted = false;
		uwsRes.onAborted(() => {
			aborted = true;
		});

		if (!checkAdmin(uwsRes, uwsReq)) return;

		readBody(res)
			.then(async (bodyStr) => {
				const body = JSON.parse(bodyStr);
				const parsed = BanIpRequestSchema.safeParse(body);
				if (!parsed.success) {
					if (!aborted) sendJson(res, 400, { error: 'Invalid request', details: parsed.error.flatten() });
					return;
				}
				await banIp(redis, parsed.data.ip, parsed.data.type, parsed.data.reason, 'admin', parsed.data.durationSeconds);
				logger.info({ ip: parsed.data.ip, type: parsed.data.type }, 'IP banned by admin');
				if (!aborted) sendJson(res, 200, { ok: true, target: parsed.data.ip });
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error in admin ban ip');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});

	app.post('/api/v1/admin/ban/cidr', (res: unknown, req: unknown) => {
		const uwsRes = res as UwsRes;
		const uwsReq = req as UwsReq;
		let aborted = false;
		uwsRes.onAborted(() => {
			aborted = true;
		});

		if (!checkAdmin(uwsRes, uwsReq)) return;

		readBody(res)
			.then(async (bodyStr) => {
				const body = JSON.parse(bodyStr);
				const parsed = BanCidrRequestSchema.safeParse(body);
				if (!parsed.success) {
					if (!aborted) sendJson(res, 400, { error: 'Invalid request', details: parsed.error.flatten() });
					return;
				}
				await banCidr(
					redis,
					parsed.data.cidr,
					parsed.data.type,
					parsed.data.reason,
					'admin',
					parsed.data.durationSeconds,
				);
				logger.info({ cidr: parsed.data.cidr, type: parsed.data.type }, 'CIDR banned by admin');
				if (!aborted) sendJson(res, 200, { ok: true, target: parsed.data.cidr });
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error in admin ban cidr');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});

	app.post('/api/v1/admin/ban/user-agent', (res: unknown, req: unknown) => {
		const uwsRes = res as UwsRes;
		const uwsReq = req as UwsReq;
		let aborted = false;
		uwsRes.onAborted(() => {
			aborted = true;
		});

		if (!checkAdmin(uwsRes, uwsReq)) return;

		readBody(res)
			.then(async (bodyStr) => {
				const body = JSON.parse(bodyStr);
				const parsed = BanUserAgentRequestSchema.safeParse(body);
				if (!parsed.success) {
					if (!aborted) sendJson(res, 400, { error: 'Invalid request', details: parsed.error.flatten() });
					return;
				}
				await banUserAgent(redis, parsed.data.pattern, parsed.data.reason, 'admin');
				logger.info({ pattern: parsed.data.pattern }, 'User-agent pattern banned by admin');
				if (!aborted) sendJson(res, 200, { ok: true, target: parsed.data.pattern });
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error in admin ban user-agent');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});

	app.post('/api/v1/admin/unban', (res: unknown, req: unknown) => {
		const uwsRes = res as UwsRes;
		const uwsReq = req as UwsReq;
		let aborted = false;
		uwsRes.onAborted(() => {
			aborted = true;
		});

		if (!checkAdmin(uwsRes, uwsReq)) return;

		readBody(res)
			.then(async (bodyStr) => {
				const body = JSON.parse(bodyStr);
				const parsed = UnbanRequestSchema.safeParse(body);
				if (!parsed.success) {
					if (!aborted) sendJson(res, 400, { error: 'Invalid request', details: parsed.error.flatten() });
					return;
				}
				const removed = await unban(redis, parsed.data.kind, parsed.data.target);
				logger.info({ kind: parsed.data.kind, target: parsed.data.target, removed }, 'Unban by admin');
				if (!aborted) sendJson(res, 200, { ok: true, removed });
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error in admin unban');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});

	app.get('/api/v1/admin/bans', (res: unknown, req: unknown) => {
		const uwsRes = res as UwsRes;
		const uwsReq = req as UwsReq;
		let aborted = false;
		uwsRes.onAborted(() => {
			aborted = true;
		});

		if (!checkAdmin(uwsRes, uwsReq)) return;

		listBans(redis)
			.then((bans) => {
				if (!aborted) sendJson(res, 200, { bans });
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error listing bans');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});
}
