# @telegraphic-dev/openclaw-gateway-client

TypeScript client for the OpenClaw Gateway WebSocket protocol.

Features:
- challenge-based `connect` handshake
- Ed25519 device identity generation/signing
- device token persistence hooks
- retry path for token mismatch -> stored device token
- typed-ish RPC calls
- event streaming
- chat/session convenience helpers
- Node-first transport via `ws`

## Install

```bash
npm install @telegraphic-dev/openclaw-gateway-client
```

## Quick start

```ts
import { OpenClawGatewayClient, fileStoreAdapter } from '@telegraphic-dev/openclaw-gateway-client';

const client = new OpenClawGatewayClient({
  url: 'wss://gateway.example.com',
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
  store: fileStoreAdapter('.openclaw-gateway-client'),
  client: {
    id: 'gateway-client',
    version: '0.1.0',
    platform: 'node',
    mode: 'backend',
  },
  role: 'operator',
  scopes: ['operator.read', 'operator.write', 'operator.admin'],
});

await client.connect();
const sessions = await client.request('sessions.list', { limit: 5 });
console.log(sessions);
await client.close();
```
