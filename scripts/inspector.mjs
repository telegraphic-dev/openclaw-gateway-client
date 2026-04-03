#!/usr/bin/env node
import process from 'node:process';
import { OpenClawGatewayClient, ROLE_SCOPE_MAP, fileStoreAdapter } from '../dist/index.js';

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [k, inline] = token.slice(2).split('=');
      const next = inline ?? argv[i + 1];
      if (inline === undefined && argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1;
      result[k] = next ?? true;
    } else {
      result._.push(token);
    }
  }
  return result;
}

function usage() {
  console.log(`openclaw-gateway-inspector

Usage:
  node scripts/inspector.mjs call <method> [--params '{"x":1}'] [--url ws://127.0.0.1:18789] [--token ...]
  node scripts/inspector.mjs events [--url ...] [--token ...]
  node scripts/inspector.mjs chat --sessionKey main --message 'hello'
  node scripts/inspector.mjs repl [--url ...] [--token ...]

Environment fallbacks:
  OPENCLAW_GATEWAY_URL
  OPENCLAW_GATEWAY_TOKEN
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, method] = args._;
  if (!command) {
    usage();
    process.exit(1);
  }

  const url = args.url ?? process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789';
  const token = args.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
  const store = fileStoreAdapter('.openclaw-gateway-client-inspector');
  const client = new OpenClawGatewayClient({
    url,
    token,
    store,
    role: 'operator',
    scopes: ROLE_SCOPE_MAP.operator,
    client: {
      id: 'openclaw-gateway-inspector',
      version: '0.1.0',
      platform: 'node',
      mode: 'backend',
    },
    logger: {
      debug: (m, meta) => process.env.DEBUG ? console.error('[debug]', m, meta ?? '') : undefined,
      info: (m, meta) => console.error('[info]', m, meta ?? ''),
      warn: (m, meta) => console.error('[warn]', m, meta ?? ''),
      error: (m, meta) => console.error('[error]', m, meta ?? ''),
    },
  });

  try {
    if (command === 'events') {
      client.onAnyEvent((event) => {
        console.log(JSON.stringify(event, null, 2));
      });
      await client.connect();
      console.error('connected; streaming events. Ctrl+C to exit.');
      await new Promise(() => {});
    }

    if (command === 'call') {
      if (!method) throw new Error('missing method');
      const params = args.params ? JSON.parse(String(args.params)) : {};
      const result = await client.request(method, params);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'chat') {
      const sessionKey = String(args.sessionKey ?? 'main');
      const message = String(args.message ?? 'hello');
      const result = await client.chatSend({ sessionKey, message });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'repl') {
      await client.connect();
      console.error('connected. Enter: <method> <json-params>');
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', async (chunk) => {
        const line = chunk.trim();
        if (!line) return;
        if (line === 'exit' || line === 'quit') process.exit(0);
        const firstSpace = line.indexOf(' ');
        const method = firstSpace === -1 ? line : line.slice(0, firstSpace);
        const raw = firstSpace === -1 ? '{}' : line.slice(firstSpace + 1);
        try {
          const params = JSON.parse(raw);
          const result = await client.request(method, params);
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          console.error(String(error));
        }
      });
      return;
    }

    usage();
    process.exit(1);
  } finally {
    if (command !== 'events' && command !== 'repl') {
      await client.close();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
