// Everything that touches the DOM. All league arithmetic comes from
// lib/league.mjs so the page and the Action can never disagree.

import * as L from './league.mjs';
import { toCSV } from './csv.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => asDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (s) => asDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const shortField = (f) => String(f ?? '').replace('Hockey Field', 'Hockey').replace('Football Field', 'Football');
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const state = { meta: null, fixtures: [], squad: [], appearances: [], positions: [], curFx: null };

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
  const missing = L.missingUpTo(state.fixtures, todayIso());

  $('#app').innerHTML = `<div class="wrap">
    <header class="mast">
      <div class="crest" aria-hidden="true"></div>
      <div><h1>${esc(meta.team)}</h1>
        <div class="sub">${esc(meta.league)} · ${esc(meta.season)} · ${esc(meta.venue)}</div></div>
      <div class="spacer"></div>
      <button class="btn" data-act="log">Log a match</button>
    </header>
    ${hero(next, table)}
    <div class="grid">
      <section><h2>Goals</h2><p class="hint">Season total, built up match by match</p>${board('goals')}</section>
      <section><h2>Assists</h2><p class="hint">Season total, built up match by match</p>${board('assists')}</section>
      <section class="full"><h2>Attendance</h2>
        <p class="hint">Out of ${L.loggedMatches(state.appearances)} matches with a squad logged</p>${attendance()}</section>
      <section class="full"><h2>League table</h2>${warnBanner(missing)}${tableHTML(table)}</section>
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
  if (!n) return `<div class="empty"><b>Nothing logged yet</b>Use Log a match after your next game.</div>`;
  const rows = state.squad
    .map((p) => ({ name: p.name, ...L.playerTotals(state.appearances, p.id) }))
    .sort((a, b) => b.apps - a.apps || a.name.localeCompare(b.name));
  return `<ul class="att">${rows.map((r) => `
    <li><span>${esc(r.name)}</span>
      <span class="track"><span class="fill" style="width:${Math.round((r.apps / n) * 100)}%"></span></span>
      <span class="pc">${r.apps}/${n}</span></li>`).join('')}</ul>`;
}

function warnBanner(missing) {
  if (!missing.length) {
    return `<p class="hint"><span class="ok">Every scheduled match has a score.</span>
      Sorted on points, goal difference, goals for, then goals against.</p>`;
  }
  return `<div class="warn"><b>${missing.length} scheduled match${missing.length === 1 ? '' : 'es'} still without a score.</b>
    Teams with missing results look worse than they are, so positions are provisional.
    Fill them into the sheet, or move the date if the match was postponed.</div>`;
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

/* ---------- match logger ----------
   Results arrive from the sheet, so this only handles the part the sheet
   cannot check: who turned up and who scored. It writes no files. It hands
   you the full appearances.csv to paste over data/appearances.csv.        */

function openLogger() {
  const ours = state.fixtures
    .filter((f) => f.home === state.meta.team || f.away === state.meta.team)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  if (state.curFx == null) {
    const lastPlayed = [...ours].reverse().find(L.isPlayed);
    state.curFx = (lastPlayed ?? ours[0])?.id ?? null;
  }
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  renderLogger();
}

function renderLogger() {
  const f = state.fixtures.find((x) => x.id === state.curFx);
  const ours = state.fixtures
    .filter((x) => x.home === state.meta.team || x.away === state.meta.team)
    .sort((a, b) => (L.whenPlayed(a) < L.whenPlayed(b) ? -1 : 1));
  const rec = f ? L.reconcile(f, state.appearances, state.meta.team) : null;

  $('#sheet').innerHTML = `
    <div class="sh-top"><h2>Log a match</h2><button class="btn-ghost" data-act="close">Close</button></div>
    <div class="sh-body"><div class="sh-inner">
      <p class="help">Scores come from the sheet. This is the part the sheet cannot check.</p>
      <div class="fld"><label for="fxpick">Match</label>
        <select class="inp" id="fxpick">${ours.map((x) => {
          const opp = x.home === state.meta.team ? x.away : x.home;
          return `<option value="${esc(x.id)}"${x.id === state.curFx ? ' selected' : ''}>
            ${esc(shortDate(L.whenPlayed(x)))} — ${esc(opp)}${L.isPlayed(x) ? ` (${x.hs}–${x.as})` : ''}</option>`;
        }).join('')}</select></div>
      ${rec ? `<p class="recon ${rec.ok ? 'good' : 'bad'}">${rec.ok
        ? `Player goals add up to the ${rec.scored} we scored.`
        : `We scored ${rec.scored}, players account for ${rec.claimed}.`}</p>` : ''}
      ${state.squad.filter((p) => p.active).map((p) => playerRow(p)).join('')}
      <div class="addbox" style="margin-top:24px">
        <p class="help">When you are done, copy this and paste it over
          <code>data/appearances.csv</code> in the repo, then commit.</p>
        <button class="btn btn-solid" data-act="copyapps">Copy appearances.csv</button>
        <button class="btn" data-act="downloadapps" style="margin-left:10px">Download it</button>
      </div>
    </div></div>`;
}

function playerRow(p) {
  const a = state.appearances.find((x) => x.fixture === state.curFx && x.player === p.id) ?? { status: '', goals: 0, assists: 0 };
  const on = a.status === 'in';
  const step = (key, one) => `
    <span class="stp${on ? '' : ' off'}"><span class="cap">${one}</span>
      <button data-step="-1" data-p="${esc(p.id)}" data-key="${key}" aria-label="One ${one} fewer for ${esc(p.name)}">−</button>
      <input class="num" value="${a[key] ?? 0}" data-p="${esc(p.id)}" data-key="${key}" inputmode="numeric" aria-label="${key} for ${esc(p.name)}">
      <button data-step="1" data-p="${esc(p.id)}" data-key="${key}" aria-label="One ${one} more for ${esc(p.name)}">+</button></span>`;
  return `<div class="arow">
    <span class="who${a.status === 'out' ? ' off' : ''}">${esc(p.name)}</span>
    <span class="ctl">
      <span class="seg">
        <button class="in" data-att="in" data-p="${esc(p.id)}" aria-pressed="${a.status === 'in'}">Played</button>
        <button class="out" data-att="out" data-p="${esc(p.id)}" aria-pressed="${a.status === 'out'}">Missing</button>
      </span>${step('goals', 'goal')}${step('assists', 'assist')}
    </span></div>`;
}

function appRow(playerId) {
  let a = state.appearances.find((x) => x.fixture === state.curFx && x.player === playerId);
  if (!a) { a = { fixture: state.curFx, player: playerId, status: '', goals: 0, assists: 0 }; state.appearances.push(a); }
  return a;
}

function appearancesCSV() {
  const rows = state.appearances
    .filter((a) => a.status)
    .sort((a, b) => a.fixture.localeCompare(b.fixture, undefined, { numeric: true }) || a.player.localeCompare(b.player))
    .map((a) => ({ fixture_id: a.fixture, player_id: a.player, status: a.status, goals: a.goals, assists: a.assists }));
  return toCSV(rows, ['fixture_id', 'player_id', 'status', 'goals', 'assists']);
}

function refreshRecon() {
  const f = state.fixtures.find((x) => x.id === state.curFx);
  const el = $('#sheet .recon');
  const rec = f && L.reconcile(f, state.appearances, state.meta.team);
  if (!el || !rec) return;
  el.className = `recon ${rec.ok ? 'good' : 'bad'}`;
  el.textContent = rec.ok
    ? `Player goals add up to the ${rec.scored} we scored.`
    : `We scored ${rec.scored}, players account for ${rec.claimed}.`;
}

/* ---------- events ---------- */

document.addEventListener('click', (e) => {
  const t = e.target.closest?.('[data-act],[data-att],[data-step]');
  if (!t) return;

  if (t.dataset.att) {
    const a = appRow(t.dataset.p);
    a.status = a.status === t.dataset.att ? '' : t.dataset.att;
    if (a.status !== 'in') { a.goals = 0; a.assists = 0; }
    const row = t.closest('.arow');
    row.querySelector('[data-att="in"]').setAttribute('aria-pressed', a.status === 'in');
    row.querySelector('[data-att="out"]').setAttribute('aria-pressed', a.status === 'out');
    row.querySelector('.who').className = 'who' + (a.status === 'out' ? ' off' : '');
    row.querySelectorAll('.stp').forEach((st) => {
      st.className = 'stp' + (a.status === 'in' ? '' : ' off');
      if (a.status !== 'in') st.querySelector('.num').value = 0;
    });
    refreshRecon();
    return;
  }

  if (t.dataset.step) {
    const a = appRow(t.dataset.p);
    if (a.status !== 'in') return;
    a[t.dataset.key] = Math.max(0, (a[t.dataset.key] || 0) + Number(t.dataset.step));
    t.parentNode.querySelector('.num').value = a[t.dataset.key];
    refreshRecon();
    return;
  }

  switch (t.dataset.act) {
    case 'log': openLogger(); break;
    case 'close': $('#sheet').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; render(); break;
    case 'copyapps': {
      const csv = appearancesCSV();
      const done = () => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy appearances.csv'; }, 1600); };
      navigator.clipboard?.writeText(csv).then(done, () => fallbackCopy(csv, done));
      break;
    }
    case 'downloadapps': {
      const url = URL.createObjectURL(new Blob([appearancesCSV()], { type: 'text/csv' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'appearances.csv' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      break;
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'fxpick') { state.curFx = e.target.value; renderLogger(); }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.p && el.dataset.key) {
    const a = appRow(el.dataset.p);
    a[el.dataset.key] = Math.max(0, parseInt(el.value, 10) || 0);
    refreshRecon();
  }
});

function fallbackCopy(text, done) {
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { /* clipboard unavailable */ }
  ta.remove();
}
