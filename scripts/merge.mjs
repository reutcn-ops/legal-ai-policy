// Merges data/raw/*.json (research output) into data/policies.json and updates data/changelog.json.
// Usage: node scripts/merge.mjs [--init]
//   --init  first import: no changelog entries, nothing flagged as recently changed.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (f) => join(root, 'data', f);
const read = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8');

const init = process.argv.includes('--init');
const today = new Date().toISOString().slice(0, 10);
const meta = read(data('meta.json'));
const instIds = new Set(read(data('institutions.json')).map((i) => i.id));
const prev = init || !existsSync(data('policies.json')) ? [] : read(data('policies.json')).items;
const prevById = new Map(prev.map((p) => [p.id, p]));
const changelog = init ? [] : read(data('changelog.json'));

// Ids whose source could not be independently re-read (shown on the site as "not independently verified").
const unverified = new Set(existsSync(data('unverified.json')) ? read(data('unverified.json')) : []);
const items = new Map();
const problems = [];
for (const f of readdirSync(data('raw')).filter((f) => f.endsWith('.json')).sort()) {
  let rows;
  try { rows = read(join(data('raw'), f)); } catch (e) { problems.push(`${f}: invalid JSON (${e.message})`); continue; }
  for (const r of rows) {
    const id = `${r.institution}-${r.sector}`;
    const bad = !instIds.has(r.institution) ? 'unknown institution'
      : !(r.sector in meta.sectors) ? 'unknown sector'
      : !(r.stance in meta.stances) ? 'unknown stance'
      : !r.summary ? 'missing summary'
      : r.stance !== 'none' && !/^https?:\/\//.test(r.sourceUrl || '') ? 'missing source URL'
      : items.has(id) ? 'duplicate' : null;
    if (bad) { problems.push(`${f}: ${id}: ${bad}`); continue; }
    const old = prevById.get(id);
    const same = old && old.stance === r.stance && old.summary === r.summary && old.sourceUrl === r.sourceUrl;
    if (!init && !old) changelog.push({ date: today, institution: r.institution, sector: r.sector, type: 'new', note: `נוסף פריט חדש: ${meta.stances[r.stance]}.` });
    if (!init && old && old.stance !== r.stance) changelog.push({ date: today, institution: r.institution, sector: r.sector, type: 'changed', note: `העמדה עודכנה מ"${meta.stances[old.stance]}" ל"${meta.stances[r.stance]}".` });
    items.set(id, {
      id, institution: r.institution, sector: r.sector, stance: r.stance, scope: r.scope || 'law',
      summary: r.summary, sourceTitle: r.sourceTitle || null, sourceUrl: r.sourceUrl || null,
      sourceDate: r.sourceDate || null, evidence: r.evidence || null,
      verified: !unverified.has(id), checked: today, changed: init ? null : same ? old.changed : today,
    });
  }
}

// An institution missing from the raw files keeps its previous items (a failed run must not erase data).
const covered = new Set([...items.values()].map((i) => i.institution));
for (const p of prev) if (!covered.has(p.institution)) items.set(p.id, p);
for (const id of instIds) if (![...items.values()].some((i) => i.institution === id)) problems.push(`no items for institution: ${id}`);

write(data('policies.json'), { updated: today, items: [...items.values()] });
write(data('changelog.json'), changelog);
console.log(`${items.size} items written.`);
if (problems.length) console.log('Problems:\n' + problems.join('\n'));
