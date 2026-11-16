// For each item, fetches the source page and checks that the "evidence" quote appears in it.
// Usage: node scripts/verify-evidence.mjs   (PDFs and blocked pages are reported as unreadable)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { items } = JSON.parse(readFileSync(join(root, 'data', 'policies.json'), 'utf8'));
const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; link-checker)', Accept: 'text/html,*/*' };
const norm = (s) => s.toLowerCase()
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&#39;|&rsquo;|&lsquo;|[‘’]/g, "'")
  .replace(/&quot;|&ldquo;|&rdquo;|[“”]/g, '"').replace(/[–—]|&ndash;|&mdash;/g, '-')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const pages = new Map();
async function page(url) {
  if (!pages.has(url)) pages.set(url, (async () => {
    try {
      const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { err: `HTTP ${r.status}` };
      if (!/html|text/.test(r.headers.get('content-type') || '')) return { err: 'not HTML (PDF?)' };
      return { text: norm(await r.text()) };
    } catch { return { err: 'fetch failed' }; }
  })());
  return pages.get(url);
}

const todoFile = [];
const flag = (it, reason) => todoFile.push({ id: it.id, reason, stance: it.stance, summary: it.summary, evidence: it.evidence, sourceUrl: it.sourceUrl });
const out = { verified: [], notFound: [], unreadable: [] };
const todo = items.filter((i) => i.sourceUrl && i.evidence);
for (let i = 0; i < todo.length; i += 8) {
  await Promise.all(todo.slice(i, i + 8).map(async (it) => {
    const p = await page(it.sourceUrl);
    if (p.err) { out.unreadable.push(`${it.id}\t${p.err}\t${it.sourceUrl}`); flag(it, p.err); }
    else if (p.text.includes(norm(it.evidence))) out.verified.push(it.id);
    else { out.notFound.push(`${it.id}\t"${it.evidence}"\t${it.sourceUrl}`); flag(it, 'quote not found in page'); }
  }));
}
writeFileSync(join(root, 'data', 'verify-todo.json'), JSON.stringify(todoFile, null, 2), 'utf8');
console.log(`verified ${out.verified.length} · quote not found ${out.notFound.length} · unreadable ${out.unreadable.length}`);
if (out.notFound.length) console.log('\nQUOTE NOT FOUND:\n' + out.notFound.join('\n'));
if (out.unreadable.length) console.log('\nUNREADABLE:\n' + out.unreadable.join('\n'));
