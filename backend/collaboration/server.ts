import { WebSocketServer } from 'ws';
import * as http from 'http';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { Pool } from 'pg';
import * as Y from 'yjs';
import { Redis } from 'ioredis';

const PORT = 8080;
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('okay');
});

const wss = new WebSocketServer({ server });

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'printrocket',
  password: process.env.PGPASSWORD || 'password',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

const redisPub = new Redis();
const redisSub = new Redis();

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, {
    gc: true,
  });
});

// Periodic save to PostgreSQL
const ydocs = require('y-websocket/bin/utils').docs;

setInterval(async () => {
  for (const [docName, doc] of ydocs) {
    const update = Y.encodeStateAsUpdate(doc);
    try {
      await pool.query(
        `INSERT INTO documents (id, yjs_update) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = CURRENT_TIMESTAMP`,
        [docName, Buffer.from(update)]
      );
      console.log(`Saved document ${docName} to DB.`);
    } catch (err) {
      console.error(`Error saving document ${docName}`, err);
    }
  }
}, 30000); // save every 30 seconds

server.listen(PORT, () => {
  console.log(`Collaboration WebSocket Gateway running on ws://localhost:${PORT}`);
});
