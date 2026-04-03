import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
export {
  ADMIN_SCOPE,
  APPROVALS_SCOPE,
  METHOD_SCOPE_BY_NAME,
  METHOD_SCOPE_GROUPS,
  NODE_ROLE_METHODS,
  OPERATOR_SCOPES,
  PAIRING_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  authorizeOperatorScopesForMethod,
  isAdminOnlyMethod,
  isNodeRoleMethod,
  resolveLeastPrivilegeOperatorScopesForMethod,
  resolveRequiredOperatorScopeForMethod,
  resolveScopedMethod,
} from './generated/methods.js';
import {
  ADMIN_SCOPE,
  APPROVALS_SCOPE,
  METHOD_SCOPE_BY_NAME,
  METHOD_SCOPE_GROUPS,
  NODE_ROLE_METHODS,
  OPERATOR_SCOPES,
  PAIRING_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  authorizeOperatorScopesForMethod,
  isAdminOnlyMethod,
  isNodeRoleMethod,
  resolveLeastPrivilegeOperatorScopesForMethod,
  resolveRequiredOperatorScopeForMethod,
  resolveScopedMethod,
} from './generated/methods.js';
export type {
  AgentsListResult,
  AgentIdentityGetResult,
  AgentWaitParams,
  AgentWaitResult,
  ChatAbortParams,
  ChatHistoryParams,
  ChatHistoryResult,
  ChatSendAck,
  ChatSendParams,
  ChannelsStatusResult,
  ConfigGetResult,
  ConfigSchemaResult,
  CronListResult,
  CronRunsResult,
  CronStatusResult,
  DevicePairListResult,
  DeviceTokenRotateParams,
  DeviceTokenRotateResult,
  GatewayEventName,
  GatewayHelloOk,
  GatewayIdentityResult,
  HealthResult,
  KnownMethod,
  LogsTailResult,
  ModelsListResult,
  NodeListResult,
  ParamsFor,
  ResultFor,
  SessionsCreateParams,
  SessionsCreateResult,
  SessionsDeleteParams,
  SessionsDeleteResult,
  SessionsGetParams,
  SessionsGetResult,
  SessionsListParams,
  SessionsListResult,
  SessionsPatchParams,
  SessionsSendParams,
  SessionsSendResult,
  SkillsStatusResult,
  StatusResult,
  SystemPresenceResult,
  ToolsCatalogResult,
  ToolsEffectiveResult,
} from './types.js';
import type {
  AgentsListResult,
  AgentIdentityGetResult,
  AgentWaitParams,
  AgentWaitResult,
  ChatAbortParams,
  ChatHistoryParams,
  ChatHistoryResult,
  ChatSendAck,
  ChatSendParams,
  ChannelsStatusResult,
  ConfigGetResult,
  ConfigSchemaResult,
  CronListResult,
  CronRunsResult,
  CronStatusResult,
  DevicePairListResult,
  DeviceTokenRotateParams,
  DeviceTokenRotateResult,
  GatewayEventName,
  GatewayHelloOk,
  GatewayIdentityResult,
  HealthResult,
  KnownMethod,
  LogsTailResult,
  ModelsListResult,
  NodeListResult,
  ParamsFor,
  ResultFor,
  SessionsCreateParams,
  SessionsCreateResult,
  SessionsDeleteParams,
  SessionsDeleteResult,
  SessionsGetParams,
  SessionsGetResult,
  SessionsListParams,
  SessionsListResult,
  SessionsPatchParams,
  SessionsSendParams,
  SessionsSendResult,
  SkillsStatusResult,
  StatusResult,
  SystemPresenceResult,
  ToolsCatalogResult,
  ToolsEffectiveResult,
} from './types.js';

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

export type HelloOk = GatewayHelloOk;

export type HelloOk_Legacy = {
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
  };
};

export const ROLE_SCOPE_MAP = {
  operator: [...OPERATOR_SCOPES],
  'operator.readonly': [READ_SCOPE],
  'operator.writeonly': [WRITE_SCOPE],
  pairing: [PAIRING_SCOPE],
  approvals: [APPROVALS_SCOPE],
} as const;

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

  async request<M extends KnownMethod>(method: M, params: ParamsFor<M>): Promise<ResultFor<M>>;
  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
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

  async health(): Promise<HealthResult> {
    return this.request('health', {});
  }

  async status(): Promise<StatusResult> {
    return this.request('status', {});
  }

  async modelsList(): Promise<ModelsListResult> {
    return this.request('models.list', {});
  }

  async channelsStatus(params: Record<string, unknown> = {}): Promise<ChannelsStatusResult> {
    return this.request('channels.status', params);
  }

  async gatewayIdentityGet(): Promise<GatewayIdentityResult> {
    return this.request('gateway.identity.get', {});
  }

  async systemPresence(): Promise<SystemPresenceResult> {
    return this.request('system-presence', {});
  }

  async nodeList(): Promise<NodeListResult> {
    return this.request('node.list', {});
  }

  async agentsList(): Promise<AgentsListResult> {
    return this.request('agents.list', {});
  }

  async agentIdentityGet(params: { agentId?: string; sessionKey?: string }): Promise<AgentIdentityGetResult> {
    return this.request('agent.identity.get', params);
  }

  async toolsCatalog(params: { agentId: string; includePlugins?: boolean }): Promise<ToolsCatalogResult> {
    return this.request('tools.catalog', params);
  }

  async toolsEffective(params: { agentId: string; sessionKey: string }): Promise<ToolsEffectiveResult> {
    return this.request('tools.effective', params);
  }

  async skillsStatus(params: { agentId?: string } | Record<string, never> = {}): Promise<SkillsStatusResult> {
    return this.request('skills.status', params);
  }

  async logsTail(params: { cursor?: number; limit?: number; maxBytes?: number } = {}): Promise<LogsTailResult> {
    return this.request('logs.tail', params);
  }

  async configGet(): Promise<ConfigGetResult> {
    return this.request('config.get', {});
  }

  async configSchema(): Promise<ConfigSchemaResult> {
    return this.request('config.schema', {} as never);
  }

  async listSessions(params: SessionsListParams = {}): Promise<SessionsListResult> {
    return this.request('sessions.list', params);
  }

  async createSession(params: SessionsCreateParams): Promise<SessionsCreateResult> {
    return this.request('sessions.create', params);
  }

  async getSession(params: SessionsGetParams): Promise<SessionsGetResult> {
    return this.request('sessions.get', params);
  }

  async sendSessionMessage(params: SessionsSendParams): Promise<SessionsSendResult> {
    return this.request('sessions.send', {
      idempotencyKey: randomUUID(),
      ...params,
    });
  }

  async patchSession(params: SessionsPatchParams): Promise<Record<string, unknown>> {
    return this.request('sessions.patch', params);
  }

  async deleteSession(params: SessionsDeleteParams): Promise<SessionsDeleteResult> {
    return this.request('sessions.delete', params);
  }

  async waitForAgentRun(params: AgentWaitParams): Promise<AgentWaitResult> {
    return this.request('agent.wait', params);
  }

  async resetSession(key: string): Promise<Record<string, unknown>> {
    return this.request('sessions.reset', { key });
  }

  async compactSession(key: string): Promise<Record<string, unknown>> {
    return this.request('sessions.compact', { key });
  }

  async chatHistory(params: ChatHistoryParams): Promise<ChatHistoryResult> {
    return this.request('chat.history', params);
  }

  async chatSend(params: ChatSendParams): Promise<ChatSendAck> {
    return this.request('chat.send', { idempotencyKey: randomUUID(), deliver: false, ...params });
  }

  async chatAbort(params: ChatAbortParams): Promise<Record<string, unknown>> {
    return this.request('chat.abort', params);
  }

  async chatInject(sessionKey: string, message: string): Promise<Record<string, unknown>> {
    return this.request('chat.inject', { sessionKey, message });
  }

  async devicePairList(): Promise<DevicePairListResult> {
    return this.request('device.pair.list', {});
  }

  async devicePairApprove(requestId: string): Promise<Record<string, unknown>> {
    return this.request('device.pair.approve', { requestId });
  }

  async devicePairReject(requestId: string): Promise<Record<string, unknown>> {
    return this.request('device.pair.reject', { requestId });
  }

  async deviceTokenRotate(params: DeviceTokenRotateParams): Promise<DeviceTokenRotateResult> {
    return this.request('device.token.rotate', params);
  }

  async deviceTokenRevoke(params: { deviceId: string; role: string }): Promise<Record<string, unknown>> {
    return this.request('device.token.revoke', params);
  }

  async webLoginStart(params: { force?: boolean; timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
    return this.request('web.login.start', params);
  }

  async webLoginWait(params: { timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
    return this.request('web.login.wait', params);
  }

  async channelsLogout(channel: string): Promise<Record<string, unknown>> {
    return this.request('channels.logout', { channel });
  }

  async cronStatus(): Promise<CronStatusResult> {
    return this.request('cron.status', {});
  }

  async cronList(params: Record<string, unknown> = {}): Promise<CronListResult> {
    return this.request('cron.list', params);
  }

  async cronRuns(params: Record<string, unknown> = {}): Promise<CronRunsResult> {
    return this.request('cron.runs', params);
  }

  on(eventName: GatewayEventName, handler: (event: GatewayEvent) => void): () => void {
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
  if (set.has(ADMIN_SCOPE)) {
    set.add(READ_SCOPE);
    set.add(WRITE_SCOPE);
    set.add(APPROVALS_SCOPE);
    set.add(PAIRING_SCOPE);
  } else if (set.has(WRITE_SCOPE)) {
    set.add(READ_SCOPE);
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
