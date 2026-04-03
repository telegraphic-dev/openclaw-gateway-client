# @telegraphic-dev/openclaw-gateway-client

Reusable TypeScript client for the OpenClaw Gateway WebSocket protocol, aligned with OpenClaw 2026.4.2.

## Features

- challenge-based `connect` handshake
- Ed25519 device identity generation/signing
- stored device token persistence + retry recovery
- typed request/response map for known Gateway methods
- exported method/scope constants from current OpenClaw scope model
- scope authorization helpers
- event streaming helpers
- reusable file-backed state adapter
- high-level helpers for sessions, chat, pairing, login, config, logs, cron, tools, agents

## Install

```bash
npm install @telegraphic-dev/openclaw-gateway-client
```

## Quick start

```ts
import {
  OpenClawGatewayClient,
  ROLE_SCOPE_MAP,
  fileStoreAdapter,
} from '@telegraphic-dev/openclaw-gateway-client';

const client = new OpenClawGatewayClient({
  url: 'https://gateway.example.com',
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
  store: fileStoreAdapter('.openclaw-gateway-client'),
  client: {
    id: 'my-app',
    version: '0.1.0',
    platform: 'node',
    mode: 'backend',
  },
  role: 'operator',
  scopes: ROLE_SCOPE_MAP.operator,
});

await client.connect();
const sessions = await client.listSessions({ limit: 5 });
console.log(sessions.sessions);
await client.close();
```

## Exported protocol metadata

```ts
import {
  METHOD_SCOPE_GROUPS,
  METHOD_SCOPE_BY_NAME,
  ROLE_SCOPE_MAP,
  resolveRequiredOperatorScopeForMethod,
  resolveLeastPrivilegeOperatorScopesForMethod,
  authorizeOperatorScopesForMethod,
} from '@telegraphic-dev/openclaw-gateway-client';
```

This lets other projects:
- build UI around supported methods
- enforce least-privilege client scopes
- show scope badges/explanations
- gate operations before sending RPC requests

## Included known method wrappers

- Core: `health`, `status`, `modelsList`, `gatewayIdentityGet`
- Agents/tools: `agentsList`, `agentIdentityGet`, `toolsCatalog`, `toolsEffective`, `skillsStatus`
- Sessions: `listSessions`, `createSession`, `getSession`, `patchSession`, `deleteSession`, `resetSession`, `compactSession`
- Chat: `chatHistory`, `chatSend`, `chatAbort`, `chatInject`
- Device pairing: `devicePairList`, `devicePairApprove`, `devicePairReject`, `deviceTokenRotate`, `deviceTokenRevoke`
- Web/login: `webLoginStart`, `webLoginWait`
- Config/logs/cron: `configGet`, `configSchema`, `logsTail`, `cronStatus`, `cronList`, `cronRuns`
- Channel/system: `channelsStatus`, `channelsLogout`, `systemPresence`, `nodeList`

## Local inspector against a real Gateway

Yes — I added a local inspector CLI specifically for this.

Examples:

```bash
# one-off call
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789 \
OPENCLAW_GATEWAY_TOKEN=... \
npm run inspect -- call health

# call with params
npm run inspect -- call sessions.list --params '{"limit":5}'

# stream all events
npm run inspect -- events

# send chat
npm run inspect -- chat --sessionKey main --message 'hello from inspector'

# interactive REPL
npm run inspect -- repl
```

Published binary name:

```bash
openclaw-gateway-inspector call health
```

What it gives us:
- real handshake testing against an actual Gateway
- event stream inspection
- ad hoc RPC invocation
- reproducible debugging for pairing/auth/scope problems

## CI / publish

Included:
- GitHub Actions CI: typecheck + build + tests
- GitHub Actions publish workflow for npm releases

Still needed in GitHub repo settings:
- `NPM_TOKEN` secret for publish workflow

## Notes

- Scope/method constants are extracted from the current OpenClaw scope model and included directly in the package.
- Some Gateway methods are intentionally still typed as `Record<string, unknown>` results where the upstream payload is broad or evolving.
- The package is Node-first today (`ws` transport). Browser transport can be added later behind an adapter.
