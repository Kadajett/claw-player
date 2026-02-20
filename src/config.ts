import { z } from 'zod';

const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().int().positive().default(3000),
	HOST: z.string().default('0.0.0.0'),
	REDIS_URL: z.string().url().default('redis://localhost:6379'),
	TICK_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
	RATE_LIMIT_RPS: z.coerce.number().int().min(1).max(1000).default(20),
	RATE_LIMIT_BURST: z.coerce.number().int().min(1).max(100).default(30),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	JWT_SECRET: z.string().min(32).optional(),
	// Path to Pokemon Red ROM file - users must supply their own legally obtained copy
	POKEMON_RED_ROM_PATH: z.string().optional(),
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
