import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { OpenClawGatewayClient, buildDeviceSignaturePayload, resolveLeastPrivilegeOperatorScopesForMethod, authorizeOperatorScopesForMethod } from '../dist/index.js';

class MemoryStore {
  constructor() {
    this.identity = null;
    this.tokenStore = null;
  }
  async loadIdentity() { return this.identity; }
  async saveIdentity(identity) { this.identity = identity; }
  async loadTokenStore(deviceId) { return this.tokenStore?.deviceId === deviceId ? this.tokenStore : null; }
  async saveTokenStore(store) { this.tokenStore = store; }
  async clearStoredDeviceToken(deviceId, role) {
    if (this.tokenStore?.deviceId !== deviceId) return;
    delete this.tokenStore.tokens[role];
  }
}

class MockWebSocket extends EventEmitter {
  constructor(url, script) {
    super();
    this.url = url;
    this.script = script;
    this.sent = [];
    queueMicrotask(() => this.emit('open'));
  }
  send(data) {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.script?.(this, msg);
  }
  close() {
    queueMicrotask(() => this.emit('close', 1000, Buffer.from('closed')));
  }
}

test('buildDeviceSignaturePayload keeps expected order', () => {
  assert.equal(
    buildDeviceSignaturePayload({
      deviceId: 'd', clientId: 'c', clientMode: 'backend', role: 'operator', scopes: ['operator.read'], signedAtMs: 1, token: 't', nonce: 'n',
    }),
    'v2|d|c|backend|operator|operator.read|1|t|n',
  );
});

test('scope helpers match expected behavior', () => {
  assert.deepEqual(resolveLeastPrivilegeOperatorScopesForMethod('chat.send'), ['operator.write']);
  assert.deepEqual(resolveLeastPrivilegeOperatorScopesForMethod('sessions.list'), ['operator.read']);
  assert.deepEqual(authorizeOperatorScopesForMethod('sessions.list', ['operator.write']), { allowed: true });
  assert.deepEqual(authorizeOperatorScopesForMethod('device.pair.list', ['operator.read']), { allowed: false, missingScope: 'operator.pairing' });
});

test('client connects and performs request', async () => {
  const store = new MemoryStore();
  const client = new OpenClawGatewayClient({
    url: 'ws://localhost:18789',
    token: 'shared-token',
    store,
    webSocketFactory: (url) => {
      const mock = new MockWebSocket(url, (ws, msg) => {
        if (msg.method === 'connect') {
          queueMicrotask(() => ws.emit('message', Buffer.from(JSON.stringify({
            type: 'res',
            id: 'connect-1',
            ok: true,
            payload: { auth: { deviceToken: 'device-token', role: 'operator', scopes: ['operator.read', 'operator.write'] } },
          }))));
        } else if (msg.method === 'sessions.list') {
          queueMicrotask(() => ws.emit('message', Buffer.from(JSON.stringify({
            type: 'res',
            id: msg.id,
            ok: true,
            payload: { sessions: [{ key: 'main' }] },
          }))));
        }
      });
      queueMicrotask(() => mock.emit('message', Buffer.from(JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'abc123' },
      }))));
      return mock;
    },
  });

  const result = await client.listSessions({ limit: 1 });
  assert.equal(result.sessions[0].key, 'main');
  assert.equal(store.tokenStore.tokens.operator.token, 'device-token');
  await client.close();
});
