'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '');
const RECENT_DAYS = 14;

let meta, institutions, items, changelog, instById;
const state = { view: 'uni', q: '', country: '', sector: '', stance: '' };

async function load() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => r.json());
  let policies;
  [meta, institutions, policies, changelog] = await Promise.all(['meta', 'institutions', 'policies', 'changelog'].map(get));
  items = policies.items;
  institutions.sort((a, b) => a.rank - b.rank);
  instById = Object.fromEntries(institutions.map((i) => [i.id, i]));

  $('#demo').hidden = !meta.demo;
  $('#stats').textContent = `${institutions.length} מוסדות · ${items.length} פריטי מדיניות · עדכון אחרון: ${fmtDate(policies.updated)}`;
  $('#foot').textContent = `רשימת המוסדות לפי ${meta.rankingSource}.`;

  fillSelect('#f-country', 'כל המדינות', meta.countries);
  fillSelect('#f-sector', 'כל הסקטורים', meta.sectors);
  fillSelect('#f-stance', 'כל העמדות', meta.stances);
  $('#legend').innerHTML = Object.keys(meta.stances).map(badge).join('');

  readHash();
  bind();
  render();
}

function fillSelect(sel, allLabel, map) {
  $(sel).innerHTML = `<option value="">${allLabel}</option>` +
    Object.entries(map).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
}

function bind() {
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
  const on = (sel, key) => $(sel).addEventListener('input', (e) => { state[key] = e.target.value; render(); });
  on('#q', 'q'); on('#f-country', 'country'); on('#f-sector', 'sector'); on('#f-stance', 'stance');
  $('#reset').addEventListener('click', () => { Object.assign(state, { q: '', country: '', sector: '', stance: '' }); render(); });
  $('#dlg-close').addEventListener('click', () => $('#dlg').close());
  $('#view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (!b) return;
    const it = items.find((x) => x.id === b.dataset.item);
    $('#dlg-body').innerHTML = itemHtml(it, 'both');
    $('#dlg').showModal();
  });
  window.addEventListener('hashchange', () => { readHash(); render(); });
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(state)) if (p.has(k)) state[k] = p.get(k);
}

function writeHash() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v && !(k === 'view' && v === 'uni')) p.set(k, v);
  history.replaceState(null, '', p.toString() ? '#' + p : location.pathname);
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  return items.filter((it) => {
    const inst = instById[it.institution];
    if (state.country && inst.country !== state.country) return false;
    if (state.sector && it.sector !== state.sector) return false;
    if (state.stance && it.stance !== state.stance) return false;
    if (q) {
      const hay = [inst.name, inst.nameHe, it.summary, it.sourceTitle, meta.sectors[it.sector]].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const badge = (stance) => `<span class="badge s-${stance}">${esc(meta.stances[stance])}</span>`;
const isRecent = (d) => d && (Date.now() - new Date(d)) / 864e5 <= RECENT_DAYS;

// title: 'sector' | 'inst' | 'both'
function itemHtml(it, title) {
  const inst = instById[it.institution];
  const heading = { sector: meta.sectors[it.sector], inst: inst.nameHe, both: `${inst.nameHe} · ${meta.sectors[it.sector]}` }[title];
  const src = it.sourceUrl
    ? `מקור: <a href="${esc(it.sourceUrl)}" target="_blank" rel="noopener">${esc(it.sourceTitle || it.sourceUrl)}</a>` +
      (it.sourceDate ? ` (${fmtDate(it.sourceDate)})` : '') + ' · '
    : '';
  return `<article class="item">
    <header><h3>${esc(heading)}</h3>${badge(it.stance)}${isRecent(it.changed) ? '<span class="badge new">עודכן לאחרונה</span>' : ''}${it.verified === false ? '<span class="badge s-none" title="המקור לא נפתח לבדיקה חוזרת">לא אומת עצמאית</span>' : ''}</header>
    <p>${esc(it.summary)}</p>
    <footer>${it.scope === 'university' ? 'מדיניות כלל-אוניברסיטאית · ' : ''}${src}נבדק: ${fmtDate(it.checked)}</footer>
  </article>`;
}

function instCard(inst, list, open) {
  const order = Object.keys(meta.sectors);
  list.sort((a, b) => order.indexOf(a.sector) - order.indexOf(b.sector));
  return `<details class="inst"${open ? ' open' : ''}>
    <summary>
      <span class="inst-name">${esc(inst.nameHe)}</span>
      <span class="inst-en">${esc(inst.name)}</span>
      <span class="inst-meta">${esc(meta.countries[inst.country])} · דירוג ${esc(inst.rankLabel || inst.rank)} · ${list.length} פריטים</span>
    </summary>
    <div class="inst-body">${list.map((it) => itemHtml(it, 'sector')).join('')}
      <p><a href="${esc(inst.url)}" target="_blank" rel="noopener">אתר הפקולטה</a></p></div>
  </details>`;
}

function groupBy(list, key) {
  const m = new Map();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

function instCards(list, insts) {
  const by = groupBy(list, (it) => it.institution);
  const shown = insts.filter((i) => by.has(i.id));
  return shown.map((i) => instCard(i, by.get(i.id), shown.length <= 3)).join('');
}

const views = {
  uni: (list) => instCards(list, institutions),

  country: (list) => Object.entries(meta.countries).map(([code, name]) => {
    const insts = institutions.filter((i) => i.country === code);
    const html = instCards(list, insts);
    return html ? `<h2 class="group">${esc(name)} <small>${insts.length} מוסדות</small></h2>${html}` : '';
  }).join(''),

  sector: (list) => {
    const by = groupBy(list, (it) => it.sector);
    return Object.entries(meta.sectors).filter(([k]) => by.has(k)).map(([k, name]) => {
      const rows = by.get(k).sort((a, b) => instById[a.institution].rank - instById[b.institution].rank);
      return `<h2 class="group">${esc(name)} <small>${rows.length} מוסדות</small></h2>
        <div class="item-list">${rows.map((it) => itemHtml(it, 'inst')).join('')}</div>`;
    }).join('');
  },

  matrix: (list) => {
    const by = groupBy(list, (it) => it.institution);
    const sectors = Object.entries(meta.sectors).filter(([k]) => !state.sector || k === state.sector);
    const rows = institutions.filter((i) => by.has(i.id)).map((i) => {
      const cells = sectors.map(([k]) => {
        const it = by.get(i.id).find((x) => x.sector === k);
        return it
          ? `<td><button class="badge s-${it.stance}" data-item="${it.id}">${esc(meta.stances[it.stance])}</button></td>`
          : '<td class="empty">–</td>';
      }).join('');
      return `<tr><th scope="row">${esc(i.nameHe)}</th>${cells}</tr>`;
    }).join('');
    if (!rows) return '';
    return `<div class="table-wrap"><table class="matrix">
      <thead><tr><th></th>${sectors.map(([, n]) => `<th scope="col">${esc(n)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  },

  changes: () => {
    const rows = changelog
      .filter((c) => !state.country || instById[c.institution].country === state.country)
      .filter((c) => !state.sector || c.sector === state.sector)
      .sort((a, b) => b.date.localeCompare(a.date));
    return rows.length ? `<div class="item-list">${rows.map((c) => `<article class="item">
      <header><h3>${esc(instById[c.institution].nameHe)} · ${esc(meta.sectors[c.sector])}</h3>
        <span class="badge new">${c.type === 'new' ? 'חדש' : 'שינוי'}</span></header>
      <p>${esc(c.note)}</p><footer>${fmtDate(c.date)}</footer></article>`).join('')}</div>` : '';
  },
};

function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === state.view));
  $('#q').value = state.q; $('#f-country').value = state.country;
  $('#f-sector').value = state.sector; $('#f-stance').value = state.stance;
  const html = (views[state.view] || views.uni)(filtered());
  $('#view').innerHTML = html || '<p class="empty-msg">לא נמצאו תוצאות.</p>';
  writeHash();
}

load().catch((e) => { $('#view').innerHTML = `<p class="empty-msg">שגיאה בטעינת הנתונים: ${esc(e.message)}</p>`; });
