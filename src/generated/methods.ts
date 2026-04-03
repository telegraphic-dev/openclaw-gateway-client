export const ADMIN_SCOPE = 'operator.admin' as const;
export const READ_SCOPE = 'operator.read' as const;
export const WRITE_SCOPE = 'operator.write' as const;
export const APPROVALS_SCOPE = 'operator.approvals' as const;
export const PAIRING_SCOPE = 'operator.pairing' as const;

export const OPERATOR_SCOPES = [
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
] as const;

export const NODE_ROLE_METHODS = [
  'node.invoke.result',
  'node.event',
  'node.pending.drain',
  'node.canvas.capability.refresh',
  'node.pending.pull',
  'node.pending.ack',
  'skills.bins',
] as const;

export const METHOD_SCOPE_GROUPS = {
  [APPROVALS_SCOPE]: [
    'exec.approval.request',
    'exec.approval.waitDecision',
    'exec.approval.resolve',
    'plugin.approval.request',
    'plugin.approval.waitDecision',
    'plugin.approval.resolve',
  ],
  [PAIRING_SCOPE]: [
    'node.pair.request',
    'node.pair.list',
    'node.pair.reject',
    'node.pair.verify',
    'device.pair.list',
    'device.pair.approve',
    'device.pair.reject',
    'device.pair.remove',
    'device.token.rotate',
    'device.token.revoke',
    'node.rename',
  ],
  [READ_SCOPE]: [
    'health',
    'doctor.memory.status',
    'logs.tail',
    'channels.status',
    'status',
    'usage.status',
    'usage.cost',
    'tts.status',
    'tts.providers',
    'models.list',
    'tools.catalog',
    'tools.effective',
    'agents.list',
    'agent.identity.get',
    'skills.status',
    'voicewake.get',
    'sessions.list',
    'sessions.get',
    'sessions.preview',
    'sessions.resolve',
    'sessions.subscribe',
    'sessions.unsubscribe',
    'sessions.messages.subscribe',
    'sessions.messages.unsubscribe',
    'sessions.usage',
    'sessions.usage.timeseries',
    'sessions.usage.logs',
    'cron.list',
    'cron.status',
    'cron.runs',
    'gateway.identity.get',
    'system-presence',
    'last-heartbeat',
    'node.list',
    'node.describe',
    'chat.history',
    'config.get',
    'config.schema.lookup',
    'talk.config',
    'agents.files.list',
    'agents.files.get',
  ],
  [WRITE_SCOPE]: [
    'send',
    'poll',
    'agent',
    'agent.wait',
    'wake',
    'talk.mode',
    'talk.speak',
    'tts.enable',
    'tts.disable',
    'tts.convert',
    'tts.setProvider',
    'voicewake.set',
    'node.invoke',
    'node.pair.approve',
    'chat.send',
    'chat.abort',
    'sessions.create',
    'sessions.send',
    'sessions.steer',
    'sessions.abort',
    'push.test',
    'node.pending.enqueue',
  ],
  [ADMIN_SCOPE]: [
    'channels.logout',
    'agents.create',
    'agents.update',
    'agents.delete',
    'skills.install',
    'skills.update',
    'secrets.reload',
    'secrets.resolve',
    'cron.add',
    'cron.update',
    'cron.remove',
    'cron.run',
    'sessions.patch',
    'sessions.reset',
    'sessions.delete',
    'sessions.compact',
    'connect',
    'chat.inject',
    'web.login.start',
    'web.login.wait',
    'set-heartbeats',
    'system-event',
    'agents.files.set',
  ],
} as const;

export const ADMIN_METHOD_PREFIXES = ['exec.approvals.', 'config.', 'wizard.', 'update.'] as const;

export type OperatorScope = (typeof OPERATOR_SCOPES)[number];
export type NodeRoleMethod = (typeof NODE_ROLE_METHODS)[number];
export type ScopedMethod = (typeof METHOD_SCOPE_GROUPS)[OperatorScope][number];
export type KnownGatewayMethod = ScopedMethod | NodeRoleMethod;

export const METHOD_SCOPE_BY_NAME = new Map<string, OperatorScope>(
  Object.entries(METHOD_SCOPE_GROUPS).flatMap(([scope, methods]) => methods.map((method) => [method, scope as OperatorScope])),
);

export function resolveScopedMethod(method: string): OperatorScope | undefined {
  const explicit = METHOD_SCOPE_BY_NAME.get(method);
  if (explicit) return explicit;
  if (ADMIN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) return ADMIN_SCOPE;
  return undefined;
}

export function isNodeRoleMethod(method: string): method is NodeRoleMethod {
  return (NODE_ROLE_METHODS as readonly string[]).includes(method);
}

export function isAdminOnlyMethod(method: string): boolean {
  return resolveScopedMethod(method) === ADMIN_SCOPE;
}

export function resolveRequiredOperatorScopeForMethod(method: string): OperatorScope | undefined {
  return resolveScopedMethod(method);
}

export function resolveLeastPrivilegeOperatorScopesForMethod(method: string): OperatorScope[] {
  const required = resolveRequiredOperatorScopeForMethod(method);
  return required ? [required] : [];
}

export function authorizeOperatorScopesForMethod(method: string, scopes: readonly string[]): { allowed: true } | { allowed: false; missingScope: OperatorScope } {
  if (scopes.includes(ADMIN_SCOPE)) return { allowed: true };
  const required = resolveRequiredOperatorScopeForMethod(method) ?? ADMIN_SCOPE;
  if (required === READ_SCOPE) {
    if (scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE)) return { allowed: true };
    return { allowed: false, missingScope: READ_SCOPE };
  }
  if (scopes.includes(required)) return { allowed: true };
  return { allowed: false, missingScope: required };
}
