#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { OpenClawGatewayClient, fileStoreAdapter, ROLE_SCOPE_MAP } from '../../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const port = Number(process.env.PORT || 6274);

const sessions = new Map();

function json(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

const server = http.createServer(async (req, res) => {
  const target = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(publicDir, target);
  try {
    const body = await readFile(file);
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const sessionId = randomUUID();
  const state = { client: null, unsubscribers: [] };
  sessions.set(sessionId, state);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'connect') {
        await state.client?.close().catch(() => {});
        state.unsubscribers.forEach((fn) => fn());
        state.unsubscribers = [];
        state.client = new OpenClawGatewayClient({
          url: msg.payload.url,
          token: msg.payload.token,
          role: msg.payload.role ?? 'operator',
          scopes: msg.payload.scopes?.length ? msg.payload.scopes : ROLE_SCOPE_MAP.operator,
          client: msg.payload.client,
          locale: msg.payload.locale,
          userAgent: msg.payload.userAgent,
          store: fileStoreAdapter(path.resolve(process.cwd(), '.openclaw-gateway-client-inspector')),
          logger: {
            debug: () => {},
            info: () => {},
            warn: (...args) => json(ws, 'event', { event: 'proxy.warn', payload: args }),
            error: (...args) => json(ws, 'event', { event: 'proxy.error', payload: args }),
          },
        });
        state.unsubscribers.push(state.client.onAnyEvent((event) => json(ws, 'event', event)));
        await state.client.connect();
        json(ws, 'connected', { url: msg.payload.url });
        return;
      }
      if (msg.type === 'call') {
        if (!state.client) throw new Error('Not connected');
        const result = await state.client.request(msg.payload.method, msg.payload.params || {});
        json(ws, 'result', { method: msg.payload.method, ok: true, result });
        return;
      }
    } catch (error) {
      json(ws, 'error', { message: error instanceof Error ? error.message : String(error) });
    }
  });

  ws.on('close', async () => {
    state.unsubscribers.forEach((fn) => fn());
    await state.client?.close().catch(() => {});
    sessions.delete(sessionId);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`OpenClaw Gateway Inspector running at http://127.0.0.1:${port}`);
});
