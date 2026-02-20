import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'html'],
			thresholds: {
				branches: 80,
				functions: 80,
				lines: 80,
				statements: 80,
			},
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
		},
	},
});
