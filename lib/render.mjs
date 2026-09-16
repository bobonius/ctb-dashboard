// Everything that touches the DOM. All league arithmetic comes from
// lib/league.mjs so the page and the Action can never disagree.

import * as L from './league.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => asDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (s) => asDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const shortField = (f) => String(f ?? '').replace('Hockey Field', 'Hockey').replace('Football Field', 'Football');
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const state = { meta: null, fixtures: [], squad: [], appearances: [], positions: [] };

/* ---------- loading ---------- */

async function text(path) {
  // no-store, or the Pages CDN serves a stale table for minutes after a commit
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.text();
}

export async function boot() {
  try {
    const [meta, fx, sq, ap, ps] = await Promise.all([
      text('data/meta.json'), text('data/fixtures.csv'), text('data/squad.csv'),
      text('data/appearances.csv'), text('history/positions.csv'),
    ]);
    state.meta = JSON.parse(meta);
    state.fixtures = L.readFixtures(fx);
    state.squad = L.readSquad(sq);
    state.appearances = L.readAppearances(ap);
    state.positions = L.readPositions(ps);
    render();
  } catch (err) {
    $('#app').innerHTML = `<div class="wrap"><div class="empty" style="margin-top:40px">
      <b>Could not load the season data</b>${esc(err.message)}<br><br>
      If you opened this file straight off disk, that is the cause: the browser blocks
      module imports and data fetches over file://. Serve the folder instead
      (VS Code, right click index.html, Open with Live Server).</div></div>`;
  }
}

/* ---------- dashboard ---------- */

function render() {
  const { meta } = state;
  const table = L.buildTable(state.fixtures);
  const next = L.nextFixture(state.fixtures, meta.team, todayIso());

  $('#app').innerHTML = `<div class="wrap">
    <header class="mast">
      <div class="crest" aria-hidden="true"></div>
      <div><h1>${esc(meta.team)}</h1>
        <div class="sub">${esc(meta.league)} · ${esc(meta.season)} · ${esc(meta.venue)}</div></div>
    </header>
    ${hero(next, table)}
    <div class="grid">
      <section><h2>Goals</h2><p class="hint">Season total, built up match by match</p>${board('goals')}</section>
      <section><h2>Assists</h2><p class="hint">Season total, built up match by match</p>${board('assists')}</section>
      <section class="full"><h2>Attendance</h2>
        <p class="hint">Out of ${L.loggedMatches(state.appearances)} matches with a squad logged</p>${attendance()}</section>
      <section class="full"><h2>League table</h2>
        <p class="hint">Sorted on points, goal difference, goals for, then goals against.</p>
        ${tableHTML(table)}</section>
      <section class="full"><h2>Position</h2>
        <p class="hint">Only weeks where every scheduled match has a score. Gaps are gaps in the data, not slumps.</p>
        ${chart()}</section>
      <section class="full"><h2>Our season</h2>${season()}</section>
    </div>
    <div class="foot">
      <span>Results sync from the sheet automatically</span>
      <a href="${esc(meta.sourceUrl)}" target="_blank" rel="noopener">Official schedule on Playpass</a>
    </div></div>`;
}

function hero(f, table) {
  if (!f) return `<div class="hero"><div class="kick">Next up</div><h2 class="opp">Season complete</h2></div>`;
  const home = f.home === state.meta.team;
  const opp = home ? f.away : f.home;
  const days = Math.round((asDate(f.scheduled) - asDate(todayIso())) / 864e5);
  const when = days < 0 ? 'Overdue' : days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : `in ${days} days`;
  const r = L.rowFor(table, opp);
  const bit = r && r.p
    ? `${esc(opp)} sit ${ordinal(r.pos)} on ${r.pts} point${r.pts === 1 ? '' : 's'}${r.form.length ? ', form ' + form(r.form) : ''}`
    : '';
  return `<div class="hero">
    <div class="kick">Next up</div><h2 class="opp">${esc(opp)}</h2>
    <div class="meta">
      <span><b>${esc(fmtDate(f.scheduled))}</b></span>
      <span><b>${esc(f.time)}</b> <span class="dim">kick-off</span></span>
      <span><b>${esc(shortField(f.field))}</b></span>
      <span class="dim">${home ? 'Listed first' : 'Listed second'}</span>
    </div>
    <div class="count"><strong>${esc(when)}</strong><span>${esc(state.meta.venue)}</span></div>
    ${bit ? `<div class="meta" style="margin-top:16px"><span class="dim">${bit}</span></div>` : ''}
    ${state.meta.note ? `<div class="note">${esc(state.meta.note)}</div>` : ''}
  </div>`;
}

const form = (f) => `<span class="form">${f.slice(-5).map((r) => `<i class="${r}">${r}</i>`).join('')}</span>`;

function board(key) {
  const list = L.leaderboard(state.squad, state.appearances, key);
  if (!list.length) return `<div class="empty"><b>Nothing on the board</b>No ${key} logged yet this season.</div>`;
  const max = list[0][key];
  return `<ol class="lb">${list.map((r, i) => `
    <li${i === 0 ? ' class="lead"' : ''}>
      <span class="rk">${i + 1}</span>
      <span class="nm">${esc(r.name)}<span class="sec">${r.apps} app${r.apps === 1 ? '' : 's'}</span></span>
      <span class="val">${r[key]}</span>
      <span class="bar" style="width:${Math.round((r[key] / max) * 100)}%"></span>
    </li>`).join('')}</ol>`;
}

function attendance() {
  const n = L.loggedMatches(state.appearances);
  if (!n) return `<div class="empty"><b>Nothing logged yet</b>Add rows to data/appearances.csv after your next game.</div>`;
  const rows = state.squad
    .map((p) => ({ name: p.name, ...L.playerTotals(state.appearances, p.id) }))
    .sort((a, b) => b.apps - a.apps || a.name.localeCompare(b.name));
  return `<ul class="att">${rows.map((r) => `
    <li><span>${esc(r.name)}</span>
      <span class="track"><span class="fill" style="width:${Math.round((r.apps / n) * 100)}%"></span></span>
      <span class="pc">${r.apps}/${n}</span></li>`).join('')}</ul>`;
}

function tableHTML(t) {
  return `<table class="tbl"><thead><tr>
    <th></th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
    </tr></thead><tbody>${t.map((r) => `
    <tr${r.team === state.meta.team ? ' class="me"' : ''}>
      <td>${r.pos}</td><td>${esc(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td>
    </tr>`).join('')}</tbody></table>`;
}

function chart() {
  const pts = state.positions;
  if (!pts.length) {
    return `<div class="empty"><b>No complete week yet</b>
      Once every match of a matchday has a score, the Action adds a point to the line.</div>`;
  }
  const n = L.teamsFrom(state.fixtures).length || 16;
  const W = 760, H = 260, Lm = 34, R = 14, T = 16, B = 28;
  const iw = W - Lm - R, ih = H - T - B;
  const x = (i) => (pts.length < 2 ? Lm + iw / 2 : Lm + (i / (pts.length - 1)) * iw);
  const y = (p) => T + ((p - 1) / (n - 1)) * ih;
  const grid = [1, 4, 8, 12, 16].filter((p) => p <= n).map((p) => `
    <line class="gl" x1="${Lm}" y1="${y(p).toFixed(1)}" x2="${W - R}" y2="${y(p).toFixed(1)}"/>
    <text x="${Lm - 8}" y="${(y(p) + 4).toFixed(1)}" text-anchor="end">${p}</text>`).join('');
  const line = pts.length > 1
    ? `<polyline class="ln" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.pos).toFixed(1)}`).join(' ')}"/>` : '';
  const dots = pts.map((p, i) => `
    <circle class="dot${p.source === 'manual' ? ' man' : ''}" cx="${x(i).toFixed(1)}" cy="${y(p.pos).toFixed(1)}" r="4.5">
      <title>${esc(shortDate(p.date))}: ${ordinal(p.pos)}, ${p.pts} pts</title></circle>
    <text x="${x(i).toFixed(1)}" y="${H - 9}" text-anchor="middle">${esc(shortDate(p.date))}</text>`).join('');
  const cur = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="League position by matchday">
    ${grid}${line}${dots}</svg>
    <div class="legend">
      <span><i></i>Worked out from results</span>
      <span><i class="man"></i>Typed in by hand</span>
      <span>Latest: ${ordinal(cur.pos)} on ${cur.pts} pts</span></div>`;
}

function season() {
  const ours = state.fixtures
    .filter((f) => f.home === state.meta.team || f.away === state.meta.team)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  if (!ours.length) return `<div class="empty"><b>No fixtures</b>Add rows to data/fixtures.csv.</div>`;
  return `<ul class="rows">${ours.map((f) => {
    let label = f.time, cls = 'tbd';
    if (L.isPlayed(f)) {
      const us = f.home === state.meta.team ? f.hs : f.as;
      const them = f.home === state.meta.team ? f.as : f.hs;
      label = `${us}–${them}`;
      cls = us > them ? 'w' : us < them ? 'l' : 'd';
    }
    const moved = f.playedOn && f.playedOn !== f.scheduled;
    return `<li><span class="dt">${esc(shortDate(L.whenPlayed(f)))}</span>
      <span class="vs">${f.home === state.meta.team ? 'v ' + esc(f.away) : 'away to ' + esc(f.home)}
        <span class="fld">${esc(shortField(f.field))}${moved ? ' <span class="moved">moved</span>' : ''}</span></span>
      <span class="sc ${cls}">${esc(label)}</span></li>`;
  }).join('')}</ul>`;
}
