#!/usr/bin/env node
// Waits for the first settled bet in data/hourly.jsonl, prints it, and exits.
// Notification aid only - it never touches the bot or the site.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(ROOT, 'data', 'hourly.jsonl');

function findSettled() {
  if (!fs.existsSync(LOG)) return null;
  for (const line of fs.readFileSync(LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.phase === 'settled') return r;
  }
  return null;
}

const now = findSettled();
if (now) {
  console.log('FIRST SETTLEMENT (already present)');
  console.log(JSON.stringify(now, null, 2));
  process.exit(0);
}

const timer = setInterval(() => {
  const r = findSettled();
  if (r) {
    clearInterval(timer);
    console.log('FIRST SETTLEMENT');
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }
}, 2000);
