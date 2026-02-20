import { startRelayServer } from './relay/server.js';

const server = await startRelayServer();

function shutdown(): void {
	server.close().catch((err: unknown) => {
		console.error('Error during relay shutdown:', err);
		process.exit(1);
	});
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
