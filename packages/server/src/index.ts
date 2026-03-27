import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { Queries } from './db/queries.js';
import { SessionManager } from './pty/SessionManager.js';
import { GraphService } from './graph/GraphService.js';
import { BranchService } from './graph/BranchService.js';
import { registerWebSocket } from './ws/handler.js';

const app = Fastify({ logger: true });

// Initialize database
const db = getDb();
const queries = new Queries(db);
queries.recoverRestorableTerminals();

// Initialize services
const sessionManager = new SessionManager();
const graphService = new GraphService(queries);
const branchService = new BranchService(queries);

await app.register(fastifyCors, {
  origin: config.clientOrigin,
});

await app.register(fastifyWebsocket);

// Health check
app.get('/health', async () => ({ status: 'ok' }));

// WebSocket handler
registerWebSocket(app, { sessionManager, graphService, branchService, queries });

// Graceful shutdown
const shutdown = () => {
  app.log.info('Shutting down, killing all PTY sessions...');
  sessionManager.killAll();
  closeDb();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Server listening on http://${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
