#!/usr/bin/env node
// ============================================================================
// scan-secrets.mjs — fail the build if Telegram bot tokens (or similar
// secrets) appear in tracked files. Run from repo root:  node scripts/scan-secrets.mjs
// Exit 0 = clean, 1 = findings, 2 = git error. OWNED BY SA3.
// ============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  // Telegram bot token shape: <8-10 digits>:<35+ chars> — e.g. bot12345678:AAH... or raw 123456789:AAH...
  { name: 'telegram-bot-token', re: /\bbot\d{8,}:A[\w-]{20,}|\b8826\d{6}:A[\w-]{20,}|\b\d{8,10}:A[\w-]{30,}/ },
  // TELEGRAM_BOT_TOKEN= with a NON-EMPTY value (allow `TELEGRAM_BOT_TOKEN=` and placeholder ''/"" only)
  { name: 'env-token-assignment', re: /TELEGRAM_BOT_TOKEN=(?!\s*$)(?!['"]{2})['"]?[^\s'"]+/m },
];

let files;
try {
  files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
} catch (err) {
  console.error('scan-secrets: git ls-files failed:', err.message);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted-in-index / binary unreadable
  }
  for (const { name, re } of PATTERNS) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (re.test(line)) {
        // redact the matched secret itself in the report
        findings.push(`${file}:${i + 1} [${name}] ${line.replace(/\S{10,}/g, '[redacted]')}`);
      }
    });
  }
}

if (findings.length > 0) {
  console.error(`scan-secrets: FOUND ${findings.length} potential secret(s):`);
  for (const f of findings) console.error('  ' + f);
  console.error('Rotate the token, scrub history, store secrets only in .env / GitHub Secrets.');
  process.exit(1);
}
console.log(`scan-secrets: OK — ${files.length} tracked files scanned, no secrets found.`);
