#!/usr/bin/env node
// ============================================================================
// telegram-setup.mjs — one-time Telegram bot wiring for Blockfall.
//   node scripts/telegram-setup.mjs --url https://user.github.io/blockfall [--chat-id 123456]
// Token source: process.env.TELEGRAM_BOT_TOKEN, else a local .env file
// (simple KEY=VALUE parse — NOT vite's loader). Token is NEVER printed.
// OWNED BY SA3.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function loadEnvFile() {
  // .env in repo root (scripts/../.env) or process cwd
  for (const p of [resolve(__dirname, '..', '.env'), resolve(process.cwd(), '.env')]) {
    if (!existsSync(p)) continue;
    const out = {};
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
  }
  return {};
}

const envFile = loadEnvFile();
const token = process.env.TELEGRAM_BOT_TOKEN || envFile.TELEGRAM_BOT_TOKEN || '';
const url = arg('url') || process.env.WEB_APP_URL || envFile.WEB_APP_URL || '';
const chatId = arg('chat-id') || process.env.TELEGRAM_CHAT_ID || envFile.TELEGRAM_CHAT_ID || '';

if (!token) {
  console.error('error: set TELEGRAM_BOT_TOKEN (env or .env). Token never appears in output.');
  process.exit(1);
}
if (!/^https:\/\//.test(url)) {
  console.error('error: app URL must be HTTPS — pass --url https://… or set WEB_APP_URL.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${token}`;

async function api(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    // description may echo nothing sensitive, but redact defensively
    const desc = String(body.description ?? res.status).replace(/\d{8,}:A\S+/g, '[redacted]');
    throw new Error(`${method} failed: ${desc}`);
  }
  return body.result;
}

process.on('unhandledRejection', (err) => {
  const msg = String(err && err.message ? err.message : err)
    .replace(/\d{8,}:A\S+/g, '[redacted]');
  console.error('error:', msg);
  process.exit(1);
});

// 1) getMe — proves the token works, prints only the username.
const me = await api('getMe');
console.log(`ok: bot @${me.username} (id ${me.id})`);

// 2) setMyCommands — /play entry in the bot menu.
// Bot API ≥9 requires a 'description' on BotCommand; 'text' kept for old clients.
await api('setMyCommands', {
  commands: [
    { command: 'play', text: 'Играть в Blockfall', description: 'Играть в Blockfall' },
  ],
});
console.log('ok: setMyCommands (/play)');

// 3) optional: send a greeting with a web_app button to --chat-id.
if (chatId) {
  await api('sendMessage', {
    chat_id: chatId,
    text: 'Blockfall готов — жми кнопку 🎮',
    reply_markup: {
      inline_keyboard: [[{ text: '🎮 Играть', web_app: { url } }]],
    },
  });
  console.log(`ok: sendMessage with web_app button → chat ${chatId}`);
} else {
  console.log('skip: sendMessage (no --chat-id). Mini App menu button itself is set via @BotFather /newapp or /setmenubutton — see DEPLOYMENT.md.');
}
console.log('done. Web App URL:', url);
