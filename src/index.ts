import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

export const PROTOCOL_VERSION = 3;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_CHALLENGE_TIMEOUT_MS = 3_000;
export const DEFAULT_CLIENT_ID = 'gateway-client';
export const DEFAULT_CLIENT_MODE = 'backend';
export const DEFAULT_ROLE = 'operator';
export const DEFAULT_SCOPES = ['operator.read', 'operator.write', 'operator.admin'] as const;
export const DEVICE_TOKEN_STORE_VERSION = 1;

export type GatewayRole = 'operator' | string;
export type GatewayScope = string;

export type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

export type StoredDeviceTokenRecord = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

export type StoredDeviceTokenStore = {
  version: number;
  deviceId: string;
  tokens: Record<string, StoredDeviceTokenRecord>;
};

export type ClientIdentity = {
  id: string;
  version: string;
  platform: string;
  mode: string;
};

export type HelloOk = {
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
  };
};

export type RpcRequest = {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type RpcResponse = {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: number | string; message?: string; details?: Record<string, unknown> };
};

export type GatewayEvent<T = Record<string, unknown>> = {
  type: 'event';
  event: string;
  payload?: T;
  seq?: number;
};

export type GatewayMessage = RpcResponse | GatewayEvent | ({ type: 'hello-ok' } & HelloOk);

export type GatewayRpcError = {
  message: string;
  code?: string | number;
  details?: Record<string, unknown>;
};

export class OpenClawGatewayError extends Error {
  code?: string | number;
  details?: Record<string, unknown>;

  constructor(input: GatewayRpcError) {
    super(input.message);
    this.name = 'OpenClawGatewayError';
    this.code = input.code;
    this.details = input.details;
  }
}

export type DeviceStateStore = {
  loadIdentity(): Promise<DeviceIdentity | null>;
  saveIdentity(identity: DeviceIdentity): Promise<void>;
  loadTokenStore(deviceId: string): Promise<StoredDeviceTokenStore | null>;
  saveTokenStore(store: StoredDeviceTokenStore): Promise<void>;
  clearStoredDeviceToken(deviceId: string, role: string): Promise<void>;
};

export type Logger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

export type OpenClawGatewayClientOptions = {
  url: string;
  token?: string;
  role?: GatewayRole;
  scopes?: GatewayScope[];
  client?: Partial<ClientIdentity>;
  locale?: string;
  userAgent?: string;
  store: DeviceStateStore;
  logger?: Logger;
  connectTimeoutMs?: number;
  challengeTimeoutMs?: number;
  requestTimeoutMs?: number;
  webSocketFactory?: (url: string) => WebSocket;
};

export type ConnectRecoveryAdvice = {
  canRetryWithDeviceToken?: boolean;
  recommendedNextStep?: string;
};

export type ConnectResult = {
  hello?: HelloOk;
  usedDeviceToken: boolean;
  deviceIdentity: DeviceIdentity;
};

export class OpenClawGatewayClient {
  private readonly options: {
    url: string;
    token?: string;
    role: string;
    scopes: string[];
    client: ClientIdentity;
    locale: string;
    userAgent: string;
    store: DeviceStateStore;
    logger?: Logger;
    connectTimeoutMs: number;
    challengeTimeoutMs: number;
    requestTimeoutMs: number;
    webSocketFactory?: (url: string) => WebSocket;
  };
  private ws: WebSocket | null = null;
  private connected = false;
  private identity: DeviceIdentity | null = null;
  private readonly eventHandlers = new Map<string, Set<(event: GatewayEvent) => void>>();
  private readonly anyEventHandlers = new Set<(event: GatewayEvent) => void>();
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: unknown) => void; timeout: NodeJS.Timeout }>();
  private closePromise: Promise<void> | null = null;

  constructor(options: OpenClawGatewayClientOptions) {
    this.options = {
      url: normalizeWebSocketUrl(options.url),
      token: options.token,
      role: String(options.role ?? DEFAULT_ROLE),
      scopes: dedupeScopes(options.scopes ?? [...DEFAULT_SCOPES]),
      client: {
        id: options.client?.id ?? DEFAULT_CLIENT_ID,
        version: options.client?.version ?? '0.1.0',
        platform: options.client?.platform ?? 'node',
        mode: options.client?.mode ?? DEFAULT_CLIENT_MODE,
      },
      locale: options.locale ?? 'en-US',
      userAgent: options.userAgent ?? `@telegraphic-dev/openclaw-gateway-client/${options.client?.version ?? '0.1.0'}`,
      store: options.store,
      logger: options.logger,
      connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      challengeTimeoutMs: options.challengeTimeoutMs ?? DEFAULT_CHALLENGE_TIMEOUT_MS,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      webSocketFactory: options.webSocketFactory,
    };
  }

  async connect(): Promise<ConnectResult> {
    if (this.connected && this.ws) {
      return {
        hello: undefined,
        usedDeviceToken: false,
        deviceIdentity: await this.getOrCreateIdentity(),
      };
    }

    const identity = await this.getOrCreateIdentity();
    const storedToken = await this.readStoredDeviceToken(identity.deviceId, this.options.role);

    const firstAttempt = await this.runConnectAttempt({
      identity,
      token: this.options.token,
      deviceToken: undefined,
      storedDeviceToken: storedToken?.token,
    });
    if (firstAttempt.success) return firstAttempt.result;

    const code = readConnectErrorDetailCode(firstAttempt.error.details);
    const advice = extractRecoveryAdvice(firstAttempt.error.details);
    const canRetryWithDeviceToken =
      !!storedToken?.token &&
      (advice.canRetryWithDeviceToken === true || advice.recommendedNextStep === 'retry_with_device_token' || code === 'AUTH_TOKEN_MISMATCH');

    if (canRetryWithDeviceToken) {
      this.log('info', 'retrying connect with stored device token', {
        code,
        recommendedNextStep: advice.recommendedNextStep,
        deviceId: shortDeviceId(identity.deviceId),
      });
      const retry = await this.runConnectAttempt({
        identity,
        token: this.options.token,
        deviceToken: storedToken!.token,
        storedDeviceToken: storedToken!.token,
      });
      if (retry.success) return retry.result;

      const retryCode = readConnectErrorDetailCode(retry.error.details);
      if (retryCode === 'AUTH_DEVICE_TOKEN_MISMATCH') {
        await this.options.store.clearStoredDeviceToken(identity.deviceId, this.options.role);
      }
      throw retry.error;
    }

    if (code === 'AUTH_DEVICE_TOKEN_MISMATCH') {
      await this.options.store.clearStoredDeviceToken(identity.deviceId, this.options.role);
    }

    throw firstAttempt.error;
  }

  async close(code?: number, reason?: string): Promise<void> {
    if (!this.ws) return;
    if (this.closePromise) return this.closePromise;
    const ws = this.ws;
    this.closePromise = new Promise((resolve) => {
      const finish = () => {
        this.connected = false;
        this.ws = null;
        this.closePromise = null;
        resolve();
      };
      ws.once('close', finish);
      ws.close(code, reason);
      setTimeout(finish, 500).unref?.();
    });
    return this.closePromise;
  }

  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.connected || !this.ws) {
      await this.connect();
    }
    const ws = this.ws;
    if (!ws) throw new OpenClawGatewayError({ message: 'gateway not connected' });

    const id = randomUUID();
    const request: RpcRequest = { type: 'req', id, method, params };

    const result = await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new OpenClawGatewayError({ message: `Request timeout after ${this.options.requestTimeoutMs}ms` }));
      }, this.options.requestTimeoutMs);

      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timeout });
      ws.send(JSON.stringify(request));
    });

    return result;
  }

  async health<T = unknown>(): Promise<T> {
    return this.request<T>('health', {});
  }

  async gatewayIdentityGet<T = unknown>(): Promise<T> {
    return this.request<T>('gateway.identity.get', {});
  }

  async listSessions<T = unknown>(params: { limit?: number; activeMinutes?: number; includeGlobal?: boolean; includeUnknown?: boolean } = {}): Promise<T> {
    return this.request<T>('sessions.list', params);
  }

  async createSession<T = unknown>(params: { key: string; label?: string }): Promise<T> {
    return this.request<T>('sessions.create', params);
  }

  async getSession<T = unknown>(params: { key: string; limit?: number }): Promise<T> {
    return this.request<T>('sessions.get', params);
  }

  async patchSession<T = unknown>(params: { key: string; model?: string; thinkingLevel?: string; fastMode?: boolean; verboseLevel?: string; reasoningLevel?: string }): Promise<T> {
    return this.request<T>('sessions.patch', params);
  }

  async deleteSession<T = unknown>(params: { key: string; deleteTranscript?: boolean; emitLifecycleHooks?: boolean }): Promise<T> {
    return this.request<T>('sessions.delete', params);
  }

  async chatHistory<T = unknown>(params: { sessionKey: string; limit?: number }): Promise<T> {
    return this.request<T>('chat.history', params);
  }

  async chatSend<T = unknown>(params: { sessionKey: string; message: string; deliver?: boolean; idempotencyKey?: string; attachments?: unknown[] }): Promise<T> {
    return this.request<T>('chat.send', { idempotencyKey: randomUUID(), deliver: false, ...params });
  }

  async chatAbort<T = unknown>(params: { sessionKey: string; runId?: string }): Promise<T> {
    return this.request<T>('chat.abort', params);
  }

  async devicePairList<T = unknown>(): Promise<T> {
    return this.request<T>('device.pair.list', {});
  }

  async devicePairApprove<T = unknown>(requestId: string): Promise<T> {
    return this.request<T>('device.pair.approve', { requestId });
  }

  async devicePairReject<T = unknown>(requestId: string): Promise<T> {
    return this.request<T>('device.pair.reject', { requestId });
  }

  async deviceTokenRotate<T = unknown>(params: { deviceId: string; role: string; scopes?: string[] }): Promise<T> {
    return this.request<T>('device.token.rotate', params);
  }

  async deviceTokenRevoke<T = unknown>(params: { deviceId: string; role: string }): Promise<T> {
    return this.request<T>('device.token.revoke', params);
  }

  on(eventName: string, handler: (event: GatewayEvent) => void): () => void {
    const bucket = this.eventHandlers.get(eventName) ?? new Set<(event: GatewayEvent) => void>();
    bucket.add(handler);
    this.eventHandlers.set(eventName, bucket);
    return () => {
      const current = this.eventHandlers.get(eventName);
      current?.delete(handler);
      if (current && current.size === 0) this.eventHandlers.delete(eventName);
    };
  }

  onAnyEvent(handler: (event: GatewayEvent) => void): () => void {
    this.anyEventHandlers.add(handler);
    return () => this.anyEventHandlers.delete(handler);
  }

  private async runConnectAttempt(input: {
    identity: DeviceIdentity;
    token?: string;
    deviceToken?: string;
    storedDeviceToken?: string;
  }): Promise<{ success: true; result: ConnectResult } | { success: false; error: OpenClawGatewayError }> {
    return new Promise((resolve) => {
      let ws: WebSocket | null = null;
      let connectTimer: NodeJS.Timeout | null = null;
      let challengeTimer: NodeJS.Timeout | null = null;
      let connectResponseTimer: NodeJS.Timeout | null = null;
      let settled = false;

      const cleanup = () => {
        if (connectTimer) clearTimeout(connectTimer);
        if (challengeTimer) clearTimeout(challengeTimer);
        if (connectResponseTimer) clearTimeout(connectResponseTimer);
      };

      const settle = (result: { success: true; result: ConnectResult } | { success: false; error: OpenClawGatewayError }) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!result.success && ws) {
          try {
            ws.close(4008, 'connect failed');
          } catch {
            // ignore
          }
        }
        resolve(result);
      };

      try {
        ws = this.createWebSocket(this.options.url);
        this.log('debug', 'opening websocket', { url: this.options.url, deviceId: shortDeviceId(input.identity.deviceId) });

        connectTimer = setTimeout(() => {
          settle({ success: false, error: new OpenClawGatewayError({ message: `Connection timeout after ${this.options.connectTimeoutMs}ms` }) });
        }, this.options.connectTimeoutMs);

        ws.on('open', () => {
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          challengeTimer = setTimeout(() => {
            settle({ success: false, error: new OpenClawGatewayError({ message: `Connect challenge timeout after ${this.options.challengeTimeoutMs}ms` }) });
          }, this.options.challengeTimeoutMs);
        });

        ws.on('error', (error) => {
          settle({ success: false, error: new OpenClawGatewayError({ message: `WebSocket error: ${error.message}` }) });
        });

        ws.on('close', (code, reason) => {
          if (settled) return;
          settle({ success: false, error: new OpenClawGatewayError({ message: `WebSocket closed: ${code} ${reason.toString()}`.trim() }) });
        });

        ws.on('message', async (data) => {
          const parsed = safeJsonParse<GatewayMessage>(data.toString());
          if (!parsed) return;

          if (parsed.type === 'event') {
            if (parsed.event === 'connect.challenge') {
              const nonce = typeof parsed.payload?.nonce === 'string' ? parsed.payload.nonce.trim() : '';
              if (!nonce) {
                settle({ success: false, error: new OpenClawGatewayError({ message: 'Gateway connect challenge missing nonce' }) });
                return;
              }
              if (challengeTimer) {
                clearTimeout(challengeTimer);
                challengeTimer = null;
              }

              const signedAt = Date.now();
              const payload = buildDeviceSignaturePayload({
                deviceId: input.identity.deviceId,
                clientId: this.options.client.id,
                clientMode: this.options.client.mode,
                role: String(this.options.role),
                scopes: this.options.scopes,
                signedAtMs: signedAt,
                token: input.token,
                nonce,
              });
              const signature = signDevicePayload(input.identity.privateKeyPem, payload);

              connectResponseTimer = setTimeout(() => {
                settle({ success: false, error: new OpenClawGatewayError({ message: `Connect response timeout after ${this.options.connectTimeoutMs}ms` }) });
              }, this.options.connectTimeoutMs);

              const connectReq: RpcRequest = {
                type: 'req',
                id: 'connect-1',
                method: 'connect',
                params: {
                  minProtocol: PROTOCOL_VERSION,
                  maxProtocol: PROTOCOL_VERSION,
                  client: this.options.client,
                  role: String(this.options.role),
                  scopes: this.options.scopes,
                  caps: ['tool-events'],
                  auth: compactObject({ token: input.token, deviceToken: input.deviceToken }),
                  locale: this.options.locale,
                  userAgent: this.options.userAgent,
                  device: {
                    id: input.identity.deviceId,
                    publicKey: publicKeyRawBase64UrlFromPem(input.identity.publicKeyPem),
                    signature,
                    signedAt,
                    nonce,
                  },
                },
              };
              ws!.send(JSON.stringify(connectReq));
              return;
            }

            this.handleEvent(parsed);
            return;
          }

          if (parsed.type === 'hello-ok') {
            this.ws = ws;
            this.connected = true;
            settle({ success: true, result: { hello: parsed, usedDeviceToken: !!input.deviceToken, deviceIdentity: input.identity } });
            return;
          }

          if (parsed.type === 'res' && parsed.id === 'connect-1') {
            if (connectResponseTimer) {
              clearTimeout(connectResponseTimer);
              connectResponseTimer = null;
            }

            if (!parsed.ok) {
              settle({ success: false, error: new OpenClawGatewayError({ message: `Connect failed: ${parsed.error?.message || 'unknown'}`, code: parsed.error?.code, details: parsed.error?.details }) });
              return;
            }

            const hello = (parsed.payload ?? {}) as HelloOk;
            const deviceToken = hello.auth?.deviceToken;
            if (deviceToken) {
              await this.writeStoredDeviceToken({
                deviceId: input.identity.deviceId,
                role: hello.auth?.role ?? this.options.role,
                token: deviceToken,
                scopes: hello.auth?.scopes ?? this.options.scopes,
                updatedAtMs: Date.now(),
              });
            }

            this.ws = ws;
            this.connected = true;
            settle({ success: true, result: { hello, usedDeviceToken: !!input.deviceToken, deviceIdentity: input.identity } });
            return;
          }

          if (parsed.type === 'res') {
            const pending = this.pending.get(parsed.id);
            if (!pending) return;
            this.pending.delete(parsed.id);
            clearTimeout(pending.timeout);
            if (parsed.ok) {
              pending.resolve(parsed.payload);
            } else {
              pending.reject(new OpenClawGatewayError({ message: parsed.error?.message || 'RPC request failed', code: parsed.error?.code, details: parsed.error?.details }));
            }
          }
        });
      } catch (error) {
        settle({ success: false, error: new OpenClawGatewayError({ message: `Failed to create WebSocket: ${error instanceof Error ? error.message : String(error)}` }) });
      }
    });
  }

  private handleEvent(event: GatewayEvent): void {
    for (const handler of this.anyEventHandlers) handler(event);
    const bucket = this.eventHandlers.get(event.event);
    if (bucket) {
      for (const handler of bucket) handler(event);
    }
  }

  private createWebSocket(url: string): WebSocket {
    return this.options.webSocketFactory ? this.options.webSocketFactory(url) : new WebSocket(url);
  }

  private async getOrCreateIdentity(): Promise<DeviceIdentity> {
    if (this.identity) return this.identity;

    const existing = await this.options.store.loadIdentity();
    if (existing) {
      const derivedId = fingerprintPublicKey(existing.publicKeyPem);
      this.identity = derivedId === existing.deviceId ? existing : { ...existing, deviceId: derivedId };
      if (this.identity.deviceId !== existing.deviceId) {
        await this.options.store.saveIdentity(this.identity);
      }
      return this.identity;
    }

    this.identity = generateDeviceIdentity();
    await this.options.store.saveIdentity(this.identity);
    return this.identity;
  }

  private async readStoredDeviceToken(deviceId: string, role: string): Promise<StoredDeviceTokenRecord | null> {
    const store = await this.options.store.loadTokenStore(deviceId);
    if (!store || store.deviceId !== deviceId) return null;
    return store.tokens?.[role] ?? null;
  }

  private async writeStoredDeviceToken(input: { deviceId: string; role: string; token: string; scopes: string[]; updatedAtMs: number }): Promise<void> {
    const current = await this.options.store.loadTokenStore(input.deviceId);
    const next: StoredDeviceTokenStore = {
      version: DEVICE_TOKEN_STORE_VERSION,
      deviceId: input.deviceId,
      tokens: current?.tokens ? { ...current.tokens } : {},
    };
    next.tokens[input.role] = {
      token: input.token,
      role: input.role,
      scopes: dedupeScopes(input.scopes),
      updatedAtMs: input.updatedAtMs,
    };
    await this.options.store.saveTokenStore(next);
  }

  private log(level: keyof Logger, message: string, meta?: Record<string, unknown>): void {
    this.options.logger?.[level]?.(message, meta);
  }
}

export function normalizeWebSocketUrl(url: string): string {
  if (url.startsWith('wss://') || url.startsWith('ws://')) return url;
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `ws://${url}`;
}

export function dedupeScopes(scopes: readonly string[]): string[] {
  const set = new Set(scopes.map((scope) => scope.trim()).filter(Boolean));
  if (set.has('operator.admin')) {
    set.add('operator.read');
    set.add('operator.write');
  } else if (set.has('operator.write')) {
    set.add('operator.read');
  }
  return [...set];
}

export function buildDeviceSignaturePayload(input: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string;
  nonce: string;
}): string {
  return [
    'v2',
    input.deviceId,
    input.clientId,
    input.clientMode,
    input.role,
    input.scopes.join(','),
    String(input.signedAtMs),
    input.token ?? '',
    input.nonce,
  ].join('|');
}

export function extractRecoveryAdvice(details: unknown): ConnectRecoveryAdvice {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const raw = details as Record<string, unknown>;
  return {
    canRetryWithDeviceToken: typeof raw.canRetryWithDeviceToken === 'boolean' ? raw.canRetryWithDeviceToken : undefined,
    recommendedNextStep: typeof raw.recommendedNextStep === 'string' ? raw.recommendedNextStep : undefined,
  };
}

export function readConnectErrorDetailCode(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  return typeof (details as Record<string, unknown>).code === 'string' ? ((details as Record<string, string>).code || null) : null;
}

export function generateDeviceIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

export function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer;
  const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  if (spki.length === ed25519SpkiPrefix.length + 32 && spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)) {
    return spki.subarray(ed25519SpkiPrefix.length);
  }
  return spki;
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function base64UrlEncode(buffer: Uint8Array | Buffer): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

export function shortDeviceId(deviceId: string): string {
  if (!deviceId) return deviceId;
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-6)}`;
}

export function compactObject<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function fileStoreAdapter(rootDir = path.join(os.homedir(), '.openclaw-gateway-client')): DeviceStateStore {
  const identityPath = path.join(rootDir, 'identity.json');
  const tokenStorePath = path.join(rootDir, 'token-store.json');

  async function ensureDir(): Promise<void> {
    await fs.promises.mkdir(rootDir, { recursive: true });
  }

  return {
    async loadIdentity(): Promise<DeviceIdentity | null> {
      try {
        const raw = safeJsonParse<{ deviceId: string; publicKeyPem: string; privateKeyPem: string }>(await fs.promises.readFile(identityPath, 'utf8'));
        if (!raw?.deviceId || !raw.publicKeyPem || !raw.privateKeyPem) return null;
        return raw;
      } catch {
        return null;
      }
    },
    async saveIdentity(identity: DeviceIdentity): Promise<void> {
      await ensureDir();
      await fs.promises.writeFile(identityPath, JSON.stringify(identity, null, 2) + '\n', 'utf8');
    },
    async loadTokenStore(deviceId: string): Promise<StoredDeviceTokenStore | null> {
      try {
        const raw = safeJsonParse<StoredDeviceTokenStore>(await fs.promises.readFile(tokenStorePath, 'utf8'));
        if (!raw || raw.version !== DEVICE_TOKEN_STORE_VERSION || raw.deviceId !== deviceId || typeof raw.tokens !== 'object') return null;
        return raw;
      } catch {
        return null;
      }
    },
    async saveTokenStore(store: StoredDeviceTokenStore): Promise<void> {
      await ensureDir();
      await fs.promises.writeFile(tokenStorePath, JSON.stringify(store, null, 2) + '\n', 'utf8');
    },
    async clearStoredDeviceToken(deviceId: string, role: string): Promise<void> {
      const existing = await this.loadTokenStore(deviceId);
      if (!existing?.tokens?.[role]) return;
      const next: StoredDeviceTokenStore = { ...existing, tokens: { ...existing.tokens } };
      delete next.tokens[role];
      await this.saveTokenStore(next);
    },
  };
}
