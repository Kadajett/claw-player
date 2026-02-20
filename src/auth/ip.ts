import type { IncomingMessage } from 'node:http';
import type { HttpRequest } from 'uWebSockets.js';

type TrustProxy = 'none' | 'cloudflare' | 'any';

/**
 * Extract client IP from a uWebSockets.js request, respecting proxy trust settings.
 */
export function extractIpFromUws(
	res: { getRemoteAddressAsText(): ArrayBuffer },
	req: HttpRequest,
	trustProxy: TrustProxy,
): string {
	if (trustProxy === 'cloudflare') {
		const cfIp = req.getHeader('cf-connecting-ip');
		if (cfIp) return cfIp;
	}

	if (trustProxy !== 'none') {
		const xff = req.getHeader('x-forwarded-for');
		if (xff) return xff.split(',')[0]?.trim() ?? xff;
	}

	const raw = Buffer.from(res.getRemoteAddressAsText()).toString();
	// uWS returns IPv6-mapped IPv4 like "::ffff:127.0.0.1"
	if (raw.startsWith('::ffff:')) return raw.slice(7);
	return raw;
}

/**
 * Extract client IP from a standard Node.js IncomingMessage.
 */
export function extractIpFromNode(req: IncomingMessage, trustProxy: TrustProxy): string {
	if (trustProxy === 'cloudflare') {
		const cfIp = req.headers['cf-connecting-ip'];
		if (typeof cfIp === 'string' && cfIp) return cfIp;
	}

	if (trustProxy !== 'none') {
		const xff = req.headers['x-forwarded-for'];
		if (typeof xff === 'string' && xff) return xff.split(',')[0]?.trim() ?? xff;
	}

	return req.socket.remoteAddress ?? '0.0.0.0';
}
