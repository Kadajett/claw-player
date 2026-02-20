import pino from 'pino';
import type { Logger } from 'pino';

import { loadConfig } from './config.js';

export type { Logger };

export function createLogger(name: string): Logger {
	const config = loadConfig();
	const baseOptions = {
		name,
		level: config.LOG_LEVEL,
	};
	if (config.NODE_ENV !== 'production') {
		return pino({ ...baseOptions, transport: { target: 'pino-pretty' } });
	}
	return pino(baseOptions);
}
