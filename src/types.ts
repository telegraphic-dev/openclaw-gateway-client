import type { OperatorScope } from './generated/methods.js';

export type RpcEnvelopeRequest<Method extends string = string, Params = Record<string, unknown>> = {
  type: 'req';
  id: string;
  method: Method;
  params?: Params;
};

export type RpcEnvelopeResponse<Result = unknown> = {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Result;
  error?: {
    code?: number | string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export type RpcEnvelopeEvent<Name extends string = string, Payload = Record<string, unknown>> = {
  type: 'event';
  event: Name;
  payload?: Payload;
  seq?: number;
};

export type GatewayHelloOk = {
  type?: 'hello-ok';
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
  };
  snapshot?: {
    presence?: unknown[];
    health?: unknown;
    sessionDefaults?: {
      defaultAgentId?: string;
      mainSessionKey?: string;
      mainKey?: string;
    };
    updateAvailable?: boolean;
  };
};

export type GatewayEventName =
  | 'connect.challenge'
  | 'presence'
  | 'tick'
  | 'health'
  | 'agent'
  | 'chat'
  | 'shutdown'
  | 'sessions.changed'
  | 'device.pair.requested'
  | 'device.pair.resolved'
  | 'exec.approval.requested'
  | 'exec.approval.resolved'
  | 'plugin.approval.requested'
  | 'plugin.approval.resolved'
  | 'update.available'
  | string;

export type ChatMessageContentText = { type: 'text'; text: string };
export type ChatMessageContentImage = {
  type: 'image';
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string };
};
export type ChatMessageContent = ChatMessageContentText | ChatMessageContentImage | Record<string, unknown>;

export type ChatTranscriptMessage = {
  role?: 'user' | 'assistant' | 'system' | string;
  text?: string;
  content?: ChatMessageContent[] | string;
  timestamp?: number;
  runId?: string;
  sessionKey?: string;
};

export type ChatHistoryParams = {
  sessionKey: string;
  limit?: number;
};

export type ChatHistoryResult = {
  messages: ChatTranscriptMessage[];
  thinkingLevel?: string | null;
};

export type ChatSendAttachment = {
  type: 'image';
  mimeType: string;
  content: string;
};

export type ChatSendParams = {
  sessionKey: string;
  message: string;
  deliver?: boolean;
  idempotencyKey?: string;
  attachments?: ChatSendAttachment[];
};

export type ChatSendAck = {
  runId?: string;
  status?: 'started' | 'in_flight' | 'ok' | string;
};

export type ChatAbortParams = {
  sessionKey: string;
  runId?: string;
};

export type SessionsListParams = {
  includeGlobal?: boolean;
  includeUnknown?: boolean;
  activeMinutes?: number;
  limit?: number;
};

export type SessionUsageSummary = {
  totalTokens?: number;
  totalCost?: number;
  messageCounts?: {
    total?: number;
    user?: number;
    assistant?: number;
    errors?: number;
  };
};

export type SessionEntry = {
  key: string;
  label?: string;
  model?: string;
  modelProvider?: string;
  status?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  deliveryContext?: Record<string, unknown>;
  usage?: SessionUsageSummary;
};

export type SessionsListResult = {
  defaults?: {
    model?: string;
    modelProvider?: string;
  };
  sessions?: SessionEntry[];
};

export type SessionsGetParams = {
  key: string;
  limit?: number;
};

export type SessionsPatchParams = {
  key: string;
  model?: string;
  thinkingLevel?: string;
  fastMode?: boolean;
  verboseLevel?: string;
  reasoningLevel?: string;
};

export type SessionsDeleteParams = {
  key: string;
  deleteTranscript?: boolean;
  emitLifecycleHooks?: boolean;
};

export type SessionsDeleteResult = {
  ok: boolean;
  key: string;
  deleted: boolean;
  archived: string[];
};

export type SessionsCreateParams = {
  key: string;
  label?: string;
};

export type DevicePairRequest = {
  requestId?: string;
  id?: string;
  deviceId?: string;
  deviceName?: string;
  requestedAtMs?: number;
  requestedScopes?: string[];
};

export type PairedDevice = {
  deviceId: string;
  role?: string;
  scopes?: string[];
  updatedAtMs?: number;
};

export type DevicePairListResult = {
  pending: DevicePairRequest[];
  paired: PairedDevice[];
};

export type DeviceTokenRotateParams = {
  deviceId: string;
  role: string;
  scopes?: string[];
};

export type DeviceTokenRotateResult = {
  token?: string;
  role?: string;
  scopes?: string[];
  deviceId?: string;
};

export type GatewayIdentityResult = {
  identity?: string;
  gatewayId?: string;
};

export type HealthResult = {
  ok?: boolean;
  ts?: number;
  durationMs?: number;
  heartbeatSeconds?: number;
  defaultAgentId?: string;
  agents?: unknown[];
  sessions?: {
    path?: string;
    count?: number;
    recent?: unknown[];
  };
};

export type StatusResult = Record<string, unknown>;
export type ModelsListResult = { models?: Array<{ id: string; provider?: string }> };
export type ChannelsStatusResult = Record<string, unknown>;
export type SystemPresenceResult = unknown[];
export type LastHeartbeatResult = Record<string, unknown>;
export type NodeListResult = { nodes?: unknown[] };
export type AgentIdentityGetResult = { name?: string; avatarUrl?: string; agentId?: string };
export type ToolsCatalogResult = Record<string, unknown>;
export type ToolsEffectiveResult = Record<string, unknown>;
export type CronStatusResult = Record<string, unknown>;
export type CronListResult = { jobs?: unknown[] };
export type CronRunsResult = { entries?: unknown[] };
export type LogsTailResult = { lines?: string[]; cursor?: number; truncated?: boolean; file?: string };
export type ConfigGetResult = { config?: Record<string, unknown>; raw?: string; hash?: string; valid?: boolean; issues?: unknown[] };
export type ConfigSchemaResult = { schema?: Record<string, unknown>; uiHints?: Record<string, unknown>; version?: string | number };
export type SkillsStatusResult = Record<string, unknown>;
export type AgentsListResult = { defaultId?: string; agents?: Array<{ id: string; provider?: string }> };

export type MethodMap = {
  health: { params: Record<string, never>; result: HealthResult };
  status: { params: Record<string, never>; result: StatusResult };
  'models.list': { params: Record<string, never>; result: ModelsListResult };
  'channels.status': { params: Record<string, unknown>; result: ChannelsStatusResult };
  'channels.logout': { params: { channel: string }; result: Record<string, unknown> };
  'gateway.identity.get': { params: Record<string, never>; result: GatewayIdentityResult };
  'system-presence': { params: Record<string, never>; result: SystemPresenceResult };
  'last-heartbeat': { params: Record<string, never>; result: LastHeartbeatResult };
  'node.list': { params: Record<string, never>; result: NodeListResult };
  'agent.identity.get': { params: { agentId?: string; sessionKey?: string }; result: AgentIdentityGetResult };
  'tools.catalog': { params: { agentId: string; includePlugins?: boolean }; result: ToolsCatalogResult };
  'tools.effective': { params: { agentId?: string; sessionKey?: string }; result: ToolsEffectiveResult };
  'skills.status': { params: { agentId?: string } | Record<string, never>; result: SkillsStatusResult };
  'agents.list': { params: Record<string, never>; result: AgentsListResult };
  'logs.tail': { params: { cursor?: number; limit?: number; maxBytes?: number }; result: LogsTailResult };
  'config.get': { params: Record<string, never>; result: ConfigGetResult };
  'config.schema': { params: Record<string, never>; result: ConfigSchemaResult };
  'chat.history': { params: ChatHistoryParams; result: ChatHistoryResult };
  'chat.send': { params: ChatSendParams; result: ChatSendAck };
  'chat.abort': { params: ChatAbortParams; result: Record<string, unknown> };
  'chat.inject': { params: { sessionKey: string; message: string }; result: Record<string, unknown> };
  'sessions.list': { params: SessionsListParams; result: SessionsListResult };
  'sessions.get': { params: SessionsGetParams; result: Record<string, unknown> };
  'sessions.create': { params: SessionsCreateParams; result: Record<string, unknown> };
  'sessions.patch': { params: SessionsPatchParams; result: Record<string, unknown> };
  'sessions.delete': { params: SessionsDeleteParams; result: SessionsDeleteResult };
  'sessions.reset': { params: { key: string }; result: Record<string, unknown> };
  'sessions.compact': { params: { key: string }; result: Record<string, unknown> };
  'sessions.usage': { params: Record<string, unknown>; result: Record<string, unknown> };
  'sessions.usage.timeseries': { params: Record<string, unknown>; result: Record<string, unknown> };
  'sessions.usage.logs': { params: Record<string, unknown>; result: Record<string, unknown> };
  'device.pair.list': { params: Record<string, never>; result: DevicePairListResult };
  'device.pair.approve': { params: { requestId: string }; result: Record<string, unknown> };
  'device.pair.reject': { params: { requestId: string }; result: Record<string, unknown> };
  'device.token.rotate': { params: DeviceTokenRotateParams; result: DeviceTokenRotateResult };
  'device.token.revoke': { params: { deviceId: string; role: string }; result: Record<string, unknown> };
  'web.login.start': { params: { force?: boolean; timeoutMs?: number }; result: Record<string, unknown> };
  'web.login.wait': { params: { timeoutMs?: number }; result: Record<string, unknown> };
  'cron.status': { params: Record<string, never>; result: CronStatusResult };
  'cron.list': { params: Record<string, unknown>; result: CronListResult };
  'cron.runs': { params: Record<string, unknown>; result: CronRunsResult };
};

export type KnownMethod = keyof MethodMap;
export type ParamsFor<M extends KnownMethod> = MethodMap[M]['params'];
export type ResultFor<M extends KnownMethod> = MethodMap[M]['result'];

export type RoleScopeMap = {
  operator: OperatorScope[];
  'operator.readonly': Extract<OperatorScope, 'operator.read'>[];
  'operator.writeonly': Extract<OperatorScope, 'operator.write'>[];
  pairing: Extract<OperatorScope, 'operator.pairing'>[];
  approvals: Extract<OperatorScope, 'operator.approvals'>[];
};
