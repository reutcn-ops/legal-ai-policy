// Checks that every sourceUrl in data/policies.json responds. Usage: node scripts/check-links.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { items } = JSON.parse(readFileSync(join(root, 'data', 'policies.json'), 'utf8'));
const urls = [...new Set(items.map((i) => i.sourceUrl).filter(Boolean))];
const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; link-checker)', Accept: 'text/html,application/pdf,*/*' };

async function check(url) {
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    return r.status;
  } catch (e) { return e.name === 'TimeoutError' ? 'timeout' : 'error'; }
}

const bad = [];
for (let i = 0; i < urls.length; i += 8) {
  const chunk = urls.slice(i, i + 8);
  const res = await Promise.all(chunk.map(check));
  res.forEach((s, j) => { if (s !== 200) bad.push(`${s}\t${chunk[j]}`); });
}
console.log(`${urls.length} URLs checked, ${bad.length} not OK.`);
if (bad.length) console.log(bad.join('\n'));
