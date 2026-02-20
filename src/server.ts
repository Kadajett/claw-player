import { loadConfig } from './config.js';

const config = loadConfig();

// biome-ignore lint/suspicious/noConsole: startup log is intentional
console.log(`Claw Player server starting on ${config.HOST}:${config.PORT}`);
