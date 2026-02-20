import { z } from 'zod';

const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().int().positive().default(3000),
	MCP_PORT: z.coerce.number().int().positive().default(3001),
	HOST: z.string().default('0.0.0.0'),
	REDIS_URL: z.string().url().default('redis://localhost:6379'),
	TICK_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
	RATE_LIMIT_RPS: z.coerce.number().int().min(1).max(1000).default(20),
	RATE_LIMIT_BURST: z.coerce.number().int().min(1).max(100).default(30),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	JWT_SECRET: z.string().min(32).optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
	const result = envSchema.safeParse(process.env);
	if (!result.success) {
		const formatted = result.error.flatten().fieldErrors;
		throw new Error(`Invalid environment configuration: ${JSON.stringify(formatted)}`);
	}
	return result.data;
}
